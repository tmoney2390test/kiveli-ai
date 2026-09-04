begin;

-- Memory depth is a retrieval benefit, not a destructive storage quota. Keep
-- one server-owned policy for operational backstops and compact only low-value
-- episodic material. Pinned, manual, identity, preference, relationship,
-- sensitive, and high-confidence memories are never selected for rollups.
create table if not exists public.together_memory_capacity_policy(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  soft_per_companion integer not null default 500 check(soft_per_companion between 100 and 5000),
  compact_to_per_companion integer not null default 450 check(compact_to_per_companion between 50 and 499),
  hard_per_companion integer not null default 1000 check(hard_per_companion between 500 and 10000),
  hard_per_account integer not null default 10000 check(hard_per_account between 1000 and 100000),
  updated_at timestamptz not null default now(),
  check(compact_to_per_companion<soft_per_companion),
  check(soft_per_companion<hard_per_companion)
);

insert into public.together_memory_capacity_policy(singleton)
values(true) on conflict(singleton) do nothing;

alter table public.together_memory_capacity_policy enable row level security;
revoke all on table public.together_memory_capacity_policy from public,anon,authenticated;
grant select,update on table public.together_memory_capacity_policy to service_role;

alter table public.together_memories drop constraint if exists together_memories_source_type_check;
alter table public.together_memories add constraint together_memories_source_type_check
  check(source_type is null or source_type in('message','scene','plan','date','moment','life_event','manual','consolidation'));

create index if not exists together_memories_user_active_capacity_idx
  on public.together_memories(user_id,updated_at,id) where status='active';
create index if not exists together_memories_character_capacity_candidates_idx
  on public.together_memories(character_instance_id,importance,updated_at,id)
  where status='active' and pinned=false and memory_type in('episodic','emotional');

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

  -- One rollup replaces enough low-value rows to create hysteresis below the
  -- soft limit. Limit each pass so a bulk import cannot create an oversized
  -- transaction; subsequent inserts or an explicit maintenance call continue.
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

create or replace function public.kivelle_guard_memory_capacity()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  policy public.together_memory_capacity_policy%rowtype;
  character_count integer;
  account_count integer;
begin
  if new.status<>'active' or (tg_op='UPDATE' and old.status='active') then return new;end if;
  select * into policy from public.together_memory_capacity_policy where singleton=true;
  if policy.singleton is null or not policy.enabled then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-memory-capacity:'||new.user_id::text,0));
  select count(*)::integer into character_count from public.together_memories
    where user_id=new.user_id and character_instance_id=new.character_instance_id and status='active';
  if character_count>=policy.hard_per_companion then
    raise exception using errcode='P0001',message='MEMORY_COMPANION_CAP_REACHED';
  end if;
  select count(*)::integer into account_count from public.together_memories
    where user_id=new.user_id and status='active';
  if account_count>=policy.hard_per_account then
    raise exception using errcode='P0001',message='MEMORY_ACCOUNT_CAP_REACHED';
  end if;
  return new;
end;
$$;

create or replace function public.kivelle_maintain_memory_capacity_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
begin
  if new.status='active' and pg_trigger_depth()=1 then
    perform public.kivelle_run_memory_capacity_maintenance(new.user_id,new.character_instance_id,now());
  end if;
  return null;
end;
$$;

drop trigger if exists together_memories_capacity_guard on public.together_memories;
create trigger together_memories_capacity_guard
  before insert or update of status on public.together_memories
  for each row execute function public.kivelle_guard_memory_capacity();

drop trigger if exists together_memories_capacity_maintain on public.together_memories;
create trigger together_memories_capacity_maintain
  after insert or update of status on public.together_memories
  for each row execute function public.kivelle_maintain_memory_capacity_trigger();

revoke all on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) to service_role;
revoke all on function public.kivelle_guard_memory_capacity() from public,anon,authenticated;
revoke all on function public.kivelle_maintain_memory_capacity_trigger() from public,anon,authenticated;

-- Bring any unusually large existing relationship into policy without
-- deleting canonical history. Current production counts are below this path.
do $$
declare relationship record;
begin
  for relationship in
    select user_id,character_instance_id
    from public.together_memories
    where status='active'
    group by user_id,character_instance_id
    having count(*)>500
  loop
    perform public.kivelle_run_memory_capacity_maintenance(relationship.user_id,relationship.character_instance_id,now());
  end loop;
end;
$$;

comment on table public.together_memory_capacity_policy is
  'Server-owned operational memory backstops. Subscription tiers change recall depth, never stored-memory ownership.';
comment on function public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamptz) is
  'Supersedes low-value episodic rows into a safe compact rollup while preserving protected and historical rows.';

commit;
