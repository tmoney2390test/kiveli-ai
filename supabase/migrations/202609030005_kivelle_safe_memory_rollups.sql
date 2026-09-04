begin;

-- Capacity rollups are used by every client surface. Restrict their source
-- material to memories that are already approved for the all-surface safe
-- projection so restricted/private detail can never be copied into a digest.
create or replace function public.kivelle_run_memory_capacity_maintenance(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  policy public.together_memory_capacity_policy%rowtype;
  active_before integer:=0;
  trim_count integer:=0;
  source_count integer:=0;
  source_ids uuid[]:='{}'::uuid[];
  continuity_id uuid;
  earliest_at timestamptz;
  digest_text text;
  digest_importance numeric:=.55;
  digest_sensitivity text:='none';
  digest_rating text:='safe';
  digest_id uuid;
begin
  if p_user_id is null or p_character_instance_id is null then
    return jsonb_build_object('consolidated',0,'reason','missing_scope');
  end if;

  select * into policy from public.together_memory_capacity_policy where singleton=true;
  if policy.singleton is null or not policy.enabled then
    return jsonb_build_object('consolidated',0,'reason','disabled');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-memory-capacity:'||p_user_id::text,0));
  select count(*)::integer into active_before
  from public.together_memories
  where user_id=p_user_id and character_instance_id=p_character_instance_id and status='active';

  if active_before<=policy.soft_per_companion then
    return jsonb_build_object('consolidated',0,'active',active_before,'reason','below_soft_limit');
  end if;

  trim_count:=least(100,greatest(2,active_before-policy.compact_to_per_companion+1));
  with candidates as (
    select memory.*
    from public.together_memories memory
    where memory.user_id=p_user_id
      and memory.character_instance_id=p_character_instance_id
      and memory.status='active'
      and memory.pinned=false
      and memory.memory_type in('episodic','emotional')
      and memory.visibility_scope='all'
      and memory.content_rating in('safe','suggestive')
      and memory.importance<.85
      and memory.confidence<.95
      and memory.sensitivity_category<>'sensitive'
      and coalesce(memory.source_type,'')<>'manual'
      and lower(coalesce(memory.metadata->>'manual','false'))<>'true'
      and lower(coalesce(memory.metadata->>'capacityConsolidation','false'))<>'true'
    order by memory.importance asc,
      memory.reinforcement_count asc,
      coalesce(memory.last_mentioned_at,memory.last_retrieved_at,memory.updated_at) asc,
      memory.id
    limit trim_count
  )
  select count(*)::integer,
    coalesce(array_agg(id order by updated_at,id),'{}'::uuid[]),
    (array_agg(candidates.continuity_id order by candidates.updated_at,candidates.id))[1],min(coalesce(candidates.valid_from,candidates.created_at)),
    left('Older shared memories: '||string_agg(left(candidates.canonical_text,240),' • ' order by candidates.updated_at,candidates.id),2000),
    greatest(.55,least(.8,max(candidates.importance))),
    case when bool_or(candidates.sensitivity_category='personal') then 'personal' else 'none' end,
    case when bool_or(candidates.content_rating='suggestive') then 'suggestive' else 'safe' end
  into source_count,source_ids,continuity_id,earliest_at,digest_text,digest_importance,digest_sensitivity,digest_rating
  from candidates;

  if source_count<2 or digest_text is null then
    return jsonb_build_object('consolidated',0,'active',active_before,'reason','protected_working_set');
  end if;

  update public.together_memories
  set status='superseded',valid_to=p_now,updated_at=p_now
  where user_id=p_user_id and id=any(source_ids) and status='active';

  digest_id:=gen_random_uuid();
  insert into public.together_memories(
    id,user_id,continuity_id,character_instance_id,memory_type,canonical_text,
    dedupe_key,subject_key,importance,confidence,sensitivity_category,status,
    source_type,valid_from,learned_via,shareability,metadata,
    content_rating,visibility_scope,moderation_version,updated_at
  ) values (
    digest_id,p_user_id,continuity_id,p_character_instance_id,'episodic',digest_text,
    'capacity-rollup:'||digest_id::text,'capacity-rollup:'||digest_id::text,
    digest_importance,.85,digest_sensitivity,'active','consolidation',coalesce(earliest_at,p_now),
    'system_event','private',jsonb_build_object(
      'capacityConsolidation',true,
      'sourceCount',source_count,
      'sourceMemoryIds',to_jsonb(source_ids),
      'policyVersion','memory-capacity-v1'
    ),digest_rating,'all','memory-capacity-v1',p_now
  );

  return jsonb_build_object(
    'consolidated',source_count,
    'activeBefore',active_before,
    'activeAfter',active_before-source_count+1,
    'rollupId',digest_id,
    'reason','soft_limit'
  );
end;
$$;

revoke all on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) to service_role;

comment on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) is
  'Supersedes only all-surface safe/suggestive low-value episodic rows into a compact rollup while preserving protected and historical rows.';

commit;
