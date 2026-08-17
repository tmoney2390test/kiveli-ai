begin;

-- A SharedPlan is the commitment clock. A SceneSession is the co-present
-- experience that starts only after the user actually arrives.
alter table public.together_scene_sessions
  add column if not exists shared_plan_id uuid
  references public.together_shared_plans(id)
  on delete set null;

create index if not exists together_scene_sessions_shared_plan_idx
  on public.together_scene_sessions(shared_plan_id)
  where shared_plan_id is not null;

create unique index if not exists together_scene_sessions_one_active_plan_idx
  on public.together_scene_sessions(shared_plan_id)
  where shared_plan_id is not null and ended_at is null;

alter table public.together_shared_plans
  add column if not exists participation_level text
    check (participation_level is null or participation_level in ('arrived','brief','participated','meaningful')),
  add column if not exists finalized_at timestamptz,
  add column if not exists scene_episode_id uuid references public.together_scene_episodes(id) on delete set null;

alter table public.together_scene_episodes
  add column if not exists shared_plan_id uuid references public.together_shared_plans(id) on delete set null,
  add column if not exists starting_location_id uuid references public.together_locations(id) on delete set null,
  add column if not exists ending_location_id uuid references public.together_locations(id) on delete set null,
  add column if not exists activity_key text,
  add column if not exists attended_seconds integer not null default 0,
  add column if not exists meaningful_action_count integer not null default 0,
  add column if not exists media_count integer not null default 0;

create unique index if not exists together_scene_episodes_shared_plan_idx
  on public.together_scene_episodes(shared_plan_id)
  where shared_plan_id is not null;
create index if not exists together_scene_episodes_plan_started_idx
  on public.together_scene_episodes(shared_plan_id, started_at desc)
  where shared_plan_id is not null;

alter table public.together_generated_media
  add column if not exists shared_plan_id uuid references public.together_shared_plans(id) on delete set null,
  add column if not exists scene_action_id uuid references public.together_scene_actions(id) on delete set null;
create index if not exists together_generated_media_shared_plan_idx
  on public.together_generated_media(shared_plan_id)
  where shared_plan_id is not null;

-- The summary row remains compatible with the existing API. Segments make
-- re-entry measurable without creating a second canonical attendance row.
create table if not exists public.together_plan_attendance_segments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  plan_id uuid not null references public.together_shared_plans(id) on delete cascade,
  participant_type text not null check (participant_type in ('user','character')),
  character_instance_id uuid references public.together_character_instances(id) on delete cascade,
  joined_at timestamptz not null,
  left_at timestamptz,
  source text not null default 'app',
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_at is null or left_at >= joined_at)
);
create unique index if not exists together_plan_attendance_segments_request_idx
  on public.together_plan_attendance_segments(plan_id,user_id,participant_type,request_id)
  where request_id is not null;
create index if not exists together_plan_attendance_segments_plan_idx
  on public.together_plan_attendance_segments(plan_id,participant_type,joined_at);
alter table public.together_plan_attendance_segments enable row level security;
drop policy if exists together_plan_attendance_segments_own_read on public.together_plan_attendance_segments;
create policy together_plan_attendance_segments_own_read on public.together_plan_attendance_segments
  for select to authenticated using (user_id = auth.uid());
grant select on public.together_plan_attendance_segments to authenticated;

create or replace function public.kivelle_validate_scene_plan_context()
returns trigger language plpgsql set search_path=public as $$
declare
  plan_row record;
begin
  if new.shared_plan_id is null then return new; end if;
  select user_id,continuity_id,character_instance_id,world_id,location_id
    into plan_row
    from public.together_shared_plans
    where id = new.shared_plan_id;
  if plan_row.user_id is null then raise exception 'scene plan does not exist'; end if;
  if plan_row.user_id <> new.user_id
     or plan_row.continuity_id <> new.continuity_id
     or plan_row.character_instance_id <> new.character_instance_id
     or plan_row.world_id <> new.world_id then
    raise exception 'scene and shared plan must belong to the same life';
  end if;
  if tg_op = 'INSERT' and plan_row.location_id is not null and plan_row.location_id <> new.location_id then
    raise exception 'plan scene must begin at the planned location';
  end if;
  return new;
end;
$$;

drop trigger if exists together_scene_sessions_validate_plan_context on public.together_scene_sessions;
create trigger together_scene_sessions_validate_plan_context
  before insert or update of shared_plan_id,location_id,world_id,character_instance_id,continuity_id,user_id
  on public.together_scene_sessions for each row
  execute function public.kivelle_validate_scene_plan_context();

-- This is the only write path needed to turn a commitment into a live
-- experience. It locks the plan, makes attendance idempotent by request id,
-- and creates the scene only when both sides are co-present.
create or replace function public.kivelle_begin_plan_experience(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_plan_id uuid,
  p_request_id text,
  p_now timestamptz default now(),
  p_source text default 'app'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  plan_row record;
  user_attendance record;
  character_attendance record;
  segment_row record;
  scene_row record;
  conversation_id uuid;
  start_at timestamptz;
  grace_at timestamptz;
  companion_present boolean := false;
  scene_id uuid;
begin
  select * into plan_row from public.together_shared_plans
    where id = p_plan_id and user_id = p_user_id and continuity_id = p_continuity_id
      and character_instance_id = p_character_instance_id
    for update;
  if not found then raise exception 'commitment is unavailable'; end if;
  if plan_row.status in ('completed','cancelled') then raise exception 'commitment is already over'; end if;
  if plan_row.status = 'missed' then raise exception 'commitment has already been missed'; end if;
  if plan_row.starts_at is null then raise exception 'commitment time is unresolved'; end if;
  start_at := plan_row.starts_at;
  grace_at := coalesce(plan_row.grace_ends_at, start_at + make_interval(mins => coalesce(plan_row.grace_minutes,30)));
  if p_now < start_at - interval '30 minutes' then raise exception 'commitment is not ready'; end if;
  if coalesce(plan_row.participation_mode,'live') = 'live' and p_now > grace_at then
    raise exception 'commitment grace period has ended';
  end if;

  select * into user_attendance from public.together_plan_attendance
    where plan_id = p_plan_id and user_id = p_user_id and participant_type = 'user'
    for update;
  if not found then
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,joined_at,left_at,source,metadata)
      values(p_user_id,p_continuity_id,p_plan_id,'user',p_now,null,p_source,jsonb_build_object('firstJoinedAt',p_now,'lastJoinedAt',p_now,'joinCount',1,'requestId',p_request_id))
      returning * into user_attendance;
  elsif user_attendance.left_at is not null then
    update public.together_plan_attendance set left_at = null, source = p_source,
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('lastJoinedAt',p_now,'joinCount',coalesce((metadata->>'joinCount')::int,1)+1,'requestId',p_request_id),
      updated_at = p_now where id = user_attendance.id returning * into user_attendance;
  else
    update public.together_plan_attendance set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('lastJoinedAt',coalesce(metadata->>'lastJoinedAt',p_now::text),'requestId',p_request_id), updated_at = p_now
      where id = user_attendance.id returning * into user_attendance;
  end if;

  if not exists(
    select 1 from public.together_plan_attendance_segments
      where plan_id=p_plan_id and user_id=p_user_id and participant_type='user' and left_at is null
  ) then
    insert into public.together_plan_attendance_segments(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,request_id)
      values(p_user_id,p_continuity_id,p_plan_id,'user',null,p_now,p_source,p_request_id)
      on conflict do nothing;
  end if;

  if p_now >= start_at and plan_row.status = 'scheduled' then
    update public.together_shared_plans set status = 'active', updated_at = p_now where id = p_plan_id;
  end if;

  select * into character_attendance from public.together_plan_attendance
    where plan_id = p_plan_id and participant_type = 'character' and character_instance_id = p_character_instance_id
    for update;
  companion_present := found and character_attendance.left_at is null;
  if not companion_present and p_now >= start_at and coalesce(plan_row.companion_state,'expected') not in ('absent','cancelled') then
    update public.together_plan_attendance
      set left_at=null, updated_at=p_now, metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('arrivedAt',coalesce(metadata->>'arrivedAt',p_now::text))
      where plan_id=p_plan_id and participant_type='character' and character_instance_id=p_character_instance_id and left_at is not null
      returning * into character_attendance;
    if found then
      companion_present := true;
    else
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,left_at,source,metadata)
        values(p_user_id,p_continuity_id,p_plan_id,'character',p_character_instance_id,p_now,null,'system',jsonb_build_object('arrivedAt',p_now))
        on conflict do nothing returning * into character_attendance;
      if not found then
        select * into character_attendance from public.together_plan_attendance
          where plan_id = p_plan_id and participant_type = 'character' and character_instance_id = p_character_instance_id
          for update;
      end if;
      companion_present := found and character_attendance.left_at is null;
    end if;
  end if;
  if companion_present and not exists(
    select 1 from public.together_plan_attendance_segments
      where plan_id=p_plan_id and user_id=p_user_id and participant_type='character'
        and character_instance_id=p_character_instance_id and left_at is null
  ) then
    insert into public.together_plan_attendance_segments(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,request_id)
      values(p_user_id,p_continuity_id,p_plan_id,'character',p_character_instance_id,coalesce(character_attendance.joined_at,p_now),'system',null);
  end if;

  select id into conversation_id from public.together_conversations
    where user_id = p_user_id and continuity_id = p_continuity_id and character_instance_id = p_character_instance_id
      and archived_at is null and kind in ('direct','first_meeting')
    order by (id = plan_row.source_conversation_id) desc, updated_at desc nulls last, created_at desc
    limit 1;

  if companion_present then
    select * into scene_row from public.together_scene_sessions
      where user_id = p_user_id and continuity_id = p_continuity_id and shared_plan_id = p_plan_id and ended_at is null
      order by started_at desc limit 1 for update;
    if not found then
      insert into public.together_scene_sessions(user_id,continuity_id,character_instance_id,conversation_id,shared_plan_id,world_id,location_id,source,activity_key,participant_instance_ids,started_at,expected_end_at,state)
        values(p_user_id,p_continuity_id,p_character_instance_id,conversation_id,p_plan_id,plan_row.world_id,plan_row.location_id,'shared_plan',plan_row.activity_key,array[p_character_instance_id],p_now,plan_row.ends_at,jsonb_build_object('planId',p_plan_id,'focus',plan_row.activity_key,'currentActivityKey',plan_row.activity_key,'activity',jsonb_build_object('type',plan_row.activity_key,'actions',jsonb_build_array()),'entryReason','shared_plan'))
        returning * into scene_row;
    end if;
    scene_id := scene_row.id;
  end if;

  return jsonb_build_object('planId',p_plan_id,'sceneId',scene_id,'conversationId',conversation_id,'userJoinedAt',user_attendance.joined_at,'companionPresent',companion_present,'early',p_now < start_at,'requestId',p_request_id);
end;
$$;

grant execute on function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) to service_role;

commit;
