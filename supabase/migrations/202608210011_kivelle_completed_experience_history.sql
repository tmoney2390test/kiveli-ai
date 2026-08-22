begin;

-- Several legacy plan-completion writers predate the required subject_key
-- column. Keep those writers safe while the canonical history materializer
-- below gives every completed shared experience one stable memory identity.
create or replace function public.kivelle_fill_memory_subject_key()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.subject_key is null or btrim(new.subject_key)='' then
    new.subject_key:=new.dedupe_key;
  end if;
  return new;
end;
$$;

drop trigger if exists together_memories_fill_subject_key on public.together_memories;
create trigger together_memories_fill_subject_key
  before insert or update of subject_key,dedupe_key on public.together_memories
  for each row execute function public.kivelle_fill_memory_subject_key();

-- Materialize the durable history contract for a completed SharedPlan. This is
-- deliberately idempotent: retries, elapsed completion, and manual End Plan all
-- converge on the same memory row without reactivating something the user chose
-- to forget.
create or replace function public.kivelle_materialize_completed_plan_history(
  p_plan_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  plan_row public.together_shared_plans%rowtype;
  episode_row public.together_scene_episodes%rowtype;
  memory_id uuid;
  companion_name text;
  location_name text;
  summary_text text;
  memory_importance numeric;
  occurred_at timestamptz;
begin
  select * into plan_row
  from public.together_shared_plans
  where id=p_plan_id;

  if plan_row.id is null or plan_row.status<>'completed' or plan_row.source='date' then
    return null;
  end if;

  select * into episode_row
  from public.together_scene_episodes episode
  where episode.shared_plan_id=plan_row.id
  order by episode.created_at desc
  limit 1;

  select template.name into companion_name
  from public.together_character_instances instance
  join public.together_character_templates template on template.id=instance.character_template_id
  where instance.id=plan_row.character_instance_id and instance.user_id=plan_row.user_id;

  select location.name into location_name
  from public.together_locations location
  where location.id=plan_row.location_id;

  occurred_at:=coalesce(plan_row.completed_at,plan_row.ends_at,plan_row.updated_at);
  summary_text:=coalesce(
    nullif(episode_row.summary,''),
    nullif(plan_row.metadata->'planExperience'->>'summary',''),
    nullif(plan_row.metadata->>'completionSummary',''),
    'You and '||coalesce(companion_name,'your companion')||' shared '||plan_row.title||
      case when location_name is not null then ' at '||location_name||'.' else '.' end
  );
  memory_importance:=greatest(
    .58,
    least(1,coalesce(episode_row.significance,(plan_row.metadata->>'significance')::numeric,.45))
  );

  insert into public.together_memories(
    user_id,continuity_id,character_instance_id,memory_type,canonical_text,
    dedupe_key,subject_key,importance,confidence,sensitivity_category,status,
    source_type,source_id,valid_from,episode_id,world_id,location_id,
    participant_instance_ids,context_tags,learned_via,shareability,metadata
  ) values (
    plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'episodic',summary_text,
    'shared-plan:'||plan_row.id::text,'shared-plan:'||plan_row.id::text,
    memory_importance,.98,'none','active','plan',plan_row.id,occurred_at,
    episode_row.id,plan_row.world_id,plan_row.location_id,
    array[plan_row.character_instance_id],
    array_remove(array['shared_plan',plan_row.activity_key],null),
    case when episode_row.id is null then 'system_event' else 'observed_scene' end,
    'normal',
    jsonb_strip_nulls(jsonb_build_object(
      'sharedPlanId',plan_row.id,
      'sceneEpisodeId',episode_row.id,
      'locationId',plan_row.location_id,
      'completionReason',plan_row.completion_reason,
      'participationLevel',plan_row.participation_level,
      'historyMaterializerVersion',1
    ))
  )
  on conflict(character_instance_id,dedupe_key) do update set
    canonical_text=excluded.canonical_text,
    subject_key=excluded.subject_key,
    importance=greatest(public.together_memories.importance,excluded.importance),
    confidence=greatest(public.together_memories.confidence,excluded.confidence),
    source_type=excluded.source_type,
    source_id=excluded.source_id,
    valid_from=coalesce(public.together_memories.valid_from,excluded.valid_from),
    episode_id=coalesce(excluded.episode_id,public.together_memories.episode_id),
    world_id=coalesce(excluded.world_id,public.together_memories.world_id),
    location_id=coalesce(excluded.location_id,public.together_memories.location_id),
    participant_instance_ids=excluded.participant_instance_ids,
    context_tags=excluded.context_tags,
    learned_via=excluded.learned_via,
    shareability=excluded.shareability,
    metadata=public.together_memories.metadata||excluded.metadata,
    updated_at=now()
  returning id into memory_id;

  return memory_id;
end;
$$;

revoke all on function public.kivelle_materialize_completed_plan_history(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_materialize_completed_plan_history(uuid) to service_role;

create or replace function public.kivelle_materialize_plan_history_on_completion()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.kivelle_materialize_completed_plan_history(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists together_shared_plan_materialize_history on public.together_shared_plans;
create trigger together_shared_plan_materialize_history
  after insert or update of status on public.together_shared_plans
  for each row execute function public.kivelle_materialize_plan_history_on_completion();

create index if not exists together_relationship_milestones_history_idx
  on public.together_relationship_milestones(continuity_id,resolved_at desc)
  where status<>'pending';

-- Repair completed-plan history created before the canonical materializer.
do $$
declare plan_record record;
begin
  for plan_record in
    select id from public.together_shared_plans
    where status='completed' and source<>'date'
  loop
    perform public.kivelle_materialize_completed_plan_history(plan_record.id);
  end loop;
end;
$$;

commit;
