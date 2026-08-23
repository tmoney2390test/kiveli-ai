begin;

-- A Shared Plan remains one canonical commitment.  The anchor companion keeps
-- older direct-chat code compatible, while this roster records everybody who
-- accepted the plan when it was created.  It is deliberately a snapshot: a
-- later group membership change must not rewrite shared history.
alter table public.together_shared_plans
  add column if not exists participant_instance_ids uuid[] not null default '{}'::uuid[];

update public.together_shared_plans
set participant_instance_ids=array[character_instance_id]
where cardinality(participant_instance_ids)=0;

alter table public.together_shared_plans
  drop constraint if exists together_shared_plans_participant_roster_check;
alter table public.together_shared_plans
  add constraint together_shared_plans_participant_roster_check
  check (
    cardinality(participant_instance_ids) between 1 and 5
    and character_instance_id=any(participant_instance_ids)
  );

create index if not exists together_shared_plans_participants_idx
  on public.together_shared_plans using gin(participant_instance_ids);
create index if not exists together_shared_plans_group_conversation_idx
  on public.together_shared_plans(source_conversation_id,status,starts_at)
  where cardinality(participant_instance_ids)>1;

create or replace function public.kivelle_validate_plan_participant_roster()
returns trigger language plpgsql set search_path=public as $$
declare
  source_kind text;
  active_group_ids uuid[];
begin
  -- Older direct-plan and Date insert paths do not know about the additive
  -- roster column yet. Preserve those paths by normalizing an omitted roster
  -- to the existing anchor companion before the table check runs.
  if cardinality(coalesce(new.participant_instance_ids, '{}'::uuid[]))=0 then
    new.participant_instance_ids:=array[new.character_instance_id];
  end if;
  if cardinality(new.participant_instance_ids)<1
     or new.character_instance_id<>all(new.participant_instance_ids) then
    raise exception 'shared plan must include its anchor companion';
  end if;
  if exists(
    select 1 from unnest(new.participant_instance_ids) participant_id
    left join public.together_character_instances instance on instance.id=participant_id
    where instance.id is null
       or instance.user_id<>new.user_id
       or instance.continuity_id<>new.continuity_id
  ) then
    raise exception 'shared plan participants must belong to the same Life';
  end if;
  if new.source_conversation_id is not null then
    select kind into source_kind from public.together_conversations
    where id=new.source_conversation_id
      and user_id=new.user_id
      and continuity_id=new.continuity_id;
    if source_kind is null then raise exception 'shared plan conversation is unavailable'; end if;
    if source_kind='group' then
      select coalesce(array_agg(character_instance_id order by character_instance_id),'{}'::uuid[])
      into active_group_ids
      from public.together_conversation_participants
      where conversation_id=new.source_conversation_id and left_at is null;
      if (select array_agg(value order by value) from unnest(new.participant_instance_ids) value)
         is distinct from active_group_ids then
        raise exception 'group plan roster must match active group participants';
      end if;
    elsif cardinality(new.participant_instance_ids)>1 then
      raise exception 'multi-companion plans require a group conversation';
    end if;
  elsif cardinality(new.participant_instance_ids)>1 then
    raise exception 'multi-companion plans require a group conversation';
  end if;
  return new;
end;
$$;

drop trigger if exists together_shared_plans_validate_roster on public.together_shared_plans;
create trigger together_shared_plans_validate_roster
  before insert or update of user_id,continuity_id,character_instance_id,source_conversation_id,participant_instance_ids
  on public.together_shared_plans for each row
  execute function public.kivelle_validate_plan_participant_roster();

comment on column public.together_shared_plans.participant_instance_ids is
  'Immutable-at-creation companion roster for direct or group plans; the anchor character remains character_instance_id.';

-- Existing relationship triggers remain anchor-compatible. Mirror the same
-- canonical evidence onto non-anchor group members so automatic completion or
-- missed-plan progression cannot silently skip most of the group.
create or replace function public.kivelle_group_plan_relationship_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  participant_id uuid;
  significance numeric;
  timezone_name text;
begin
  if cardinality(new.participant_instance_ids)<=1 then return new; end if;
  significance:=greatest(.3,least(1,coalesce((new.metadata->>'significance')::numeric,.5)));
  timezone_name:=coalesce(nullif(new.user_timezone,''),nullif(new.world_timezone,''),'UTC');
  foreach participant_id in array new.participant_instance_ids loop
    if participant_id=new.character_instance_id then continue; end if;
    -- Future-planning evidence is written by the server only after the full
    -- create/switch flow commits its side effects. Doing that in this INSERT
    -- trigger would leave false relationship evidence when a staged switch is
    -- rolled back.
    if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
      perform public.kivelle_insert_relationship_evidence(
        new.user_id,participant_id,'commitment_kept','shared_plan',new.id::text,
        coalesce(new.completed_at,now()),greatest(.6,significance),.25,timezone_name,
        jsonb_build_object('title',new.title,'groupPlan',true,'participantInstanceIds',new.participant_instance_ids)
      );
      perform public.kivelle_insert_relationship_evidence(
        new.user_id,participant_id,'shared_plan_completed','shared_plan',new.id::text,
        coalesce(new.completed_at,now()),greatest(.65,significance),.55,timezone_name,
        jsonb_build_object('title',new.title,'groupPlan',true,'participantInstanceIds',new.participant_instance_ids)
      );
    elsif new.status='missed' and (tg_op='INSERT' or old.status is distinct from 'missed') then
      perform public.kivelle_insert_relationship_evidence(
        new.user_id,participant_id,'commitment_missed','shared_plan',new.id::text,
        coalesce(new.missed_at,now()),greatest(.65,significance),-.7,timezone_name,
        jsonb_build_object('title',new.title,'reason',new.miss_reason,'groupPlan',true,'participantInstanceIds',new.participant_instance_ids)
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists together_group_plan_relationship_evidence on public.together_shared_plans;
create trigger together_group_plan_relationship_evidence
  after insert or update of status,starts_at,completed_at,missed_at
  on public.together_shared_plans for each row
  execute function public.kivelle_group_plan_relationship_evidence();

revoke all on function public.kivelle_group_plan_relationship_evidence() from public,anon,authenticated;

-- The existing scene participant invariant was written when a plan could
-- contain only its anchor. Keep every ownership/location/attendance check,
-- but admit any companion from the canonical plan roster.
create or replace function public.kivelle_validate_scene_participant()
returns trigger language plpgsql set search_path=public as $$
declare
  scene_user uuid;
  scene_continuity uuid;
  scene_world uuid;
  scene_location uuid;
  scene_ended_at timestamptz;
  scene_plan_id uuid;
  instance_user uuid;
  instance_continuity uuid;
  instance_world uuid;
  instance_location uuid;
begin
  select user_id,continuity_id,world_id,location_id,ended_at,shared_plan_id
    into scene_user,scene_continuity,scene_world,scene_location,scene_ended_at,scene_plan_id
    from public.together_scene_sessions where id=new.scene_session_id;
  select instance.user_id,instance.continuity_id,location.world_id,instance.current_location_id
    into instance_user,instance_continuity,instance_world,instance_location
    from public.together_character_instances instance
    left join public.together_locations location on location.id=instance.current_location_id
    where instance.id=new.character_instance_id;
  if scene_user is null or scene_user<>new.user_id or scene_continuity<>new.continuity_id then
    raise exception 'scene participant must belong to its scene user and Life';
  end if;
  if instance_user is null or instance_user<>new.user_id or instance_continuity<>new.continuity_id then
    raise exception 'scene participant character must belong to the same user and Life';
  end if;
  if scene_ended_at is null and scene_plan_id is not null then
    if not exists(
      select 1 from public.together_shared_plans plan
      join public.together_plan_attendance attendance
        on attendance.plan_id=plan.id
       and attendance.user_id=plan.user_id
       and attendance.continuity_id=plan.continuity_id
       and attendance.participant_type='character'
       and attendance.character_instance_id=new.character_instance_id
       and attendance.left_at is null
      where plan.id=scene_plan_id
        and plan.user_id=new.user_id
        and plan.continuity_id=new.continuity_id
        and new.character_instance_id=any(plan.participant_instance_ids)
        and plan.world_id=scene_world
        and plan.location_id=scene_location
        and plan.status in ('scheduled','active')
    ) then raise exception 'plan scene participant must have active plan attendance'; end if;
  elsif scene_ended_at is null then
    if instance_world is distinct from scene_world then raise exception 'scene participant must be present in the same world'; end if;
    if instance_location is distinct from scene_location then raise exception 'scene participant must be present at the same location'; end if;
  end if;
  return new;
end;
$$;

commit;
