begin;

-- A shared-plan scene is authoritative present-tense co-presence. The
-- character instance row intentionally remains schedule-owned, so its last
-- materialized location must not veto joining the location promised by an
-- active plan.
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
      select 1
      from public.together_shared_plans plan
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
        and plan.character_instance_id=new.character_instance_id
        and plan.world_id=scene_world
        and plan.location_id=scene_location
        and plan.status in ('scheduled','active')
    ) then
      raise exception 'plan scene participant must have active plan attendance';
    end if;
  elsif scene_ended_at is null then
    if instance_world is distinct from scene_world then
      raise exception 'scene participant must be present in the same world';
    end if;
    if instance_location is distinct from scene_location then
      raise exception 'scene participant must be present at the same location';
    end if;
  end if;
  return new;
end;
$$;

-- One transactional repair seam is shared by plan start and by reads that
-- encounter a scene created by the older, interrupted two-step start path.
create or replace function public.kivelle_reconcile_plan_scene_participant(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_plan_id uuid,
  p_scene_id uuid,
  p_now timestamptz default now()
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  scene_row record;
  participant_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_character_instance_id::text,0));

  select * into scene_row
  from public.together_scene_sessions
  where id=p_scene_id
    and user_id=p_user_id
    and continuity_id=p_continuity_id
    and character_instance_id=p_character_instance_id
    and shared_plan_id=p_plan_id
    and ended_at is null
  for update;
  if not found then raise exception 'active plan scene is unavailable'; end if;

  if not exists(
    select 1
    from public.together_shared_plans plan
    join public.together_plan_attendance attendance
      on attendance.plan_id=plan.id
     and attendance.user_id=plan.user_id
     and attendance.continuity_id=plan.continuity_id
     and attendance.participant_type='character'
     and attendance.character_instance_id=p_character_instance_id
     and attendance.left_at is null
    where plan.id=p_plan_id
      and plan.user_id=p_user_id
      and plan.continuity_id=p_continuity_id
      and plan.character_instance_id=p_character_instance_id
      and plan.world_id=scene_row.world_id
      and plan.location_id=scene_row.location_id
      and plan.status in ('scheduled','active')
  ) then
    raise exception 'active plan attendance is unavailable';
  end if;

  -- A prior ended scene or multi-character guest appearance can leave an
  -- active participant row behind. Joining the explicit user commitment is
  -- the new authoritative presence and closes that stale witness interval.
  update public.together_scene_participants
  set left_at=greatest(p_now,joined_at),updated_at=p_now,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('leftReason','joined_shared_plan','nextSceneId',p_scene_id)
  where character_instance_id=p_character_instance_id
    and scene_session_id<>p_scene_id
    and left_at is null;

  insert into public.together_scene_participants(
    user_id,continuity_id,scene_session_id,character_instance_id,role,
    joined_at,left_at,witnessed_from_sequence,witnessed_to_sequence,metadata,updated_at
  ) values(
    p_user_id,p_continuity_id,p_scene_id,p_character_instance_id,'primary_companion',
    coalesce(scene_row.started_at,p_now),null,1,null,
    jsonb_build_object('canonicalPrimary',true,'contextVersion',1,'entryReason','shared_plan'),p_now
  )
  on conflict(scene_session_id,character_instance_id) do update set
    role='primary_companion',left_at=null,witnessed_to_sequence=null,updated_at=p_now,
    metadata=coalesce(public.together_scene_participants.metadata,'{}'::jsonb)
      ||jsonb_build_object('canonicalPrimary',true,'contextVersion',1,'entryReason','shared_plan')
  returning id into participant_id;

  return participant_id;
end;
$$;

revoke all on function public.kivelle_reconcile_plan_scene_participant(uuid,uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_plan_scene_participant(uuid,uuid,uuid,uuid,uuid,timestamptz) to service_role;

-- Keep attendance, plan activation, scene creation, and companion membership
-- inside one transaction. Any participant failure now rolls the whole start
-- back instead of returning a half-started plan.
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
  scene_row record;
  conversation_id uuid;
  start_at timestamptz;
  grace_at timestamptz;
  companion_present boolean := false;
  scene_id uuid;
begin
  select * into plan_row from public.together_shared_plans
    where id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id
      and character_instance_id=p_character_instance_id
    for update;
  if not found then raise exception 'commitment is unavailable'; end if;
  if plan_row.status in ('completed','cancelled') then raise exception 'commitment is already over'; end if;
  if plan_row.status='missed' then raise exception 'commitment has already been missed'; end if;
  if plan_row.starts_at is null then raise exception 'commitment time is unresolved'; end if;
  start_at:=plan_row.starts_at;
  grace_at:=coalesce(plan_row.grace_ends_at,start_at+make_interval(mins=>coalesce(plan_row.grace_minutes,30)));
  if p_now<start_at-interval '30 minutes' then raise exception 'commitment is not ready'; end if;
  if coalesce(plan_row.participation_mode,'live')='live' and p_now>grace_at then
    raise exception 'commitment grace period has ended';
  end if;

  select * into user_attendance from public.together_plan_attendance
    where plan_id=p_plan_id and user_id=p_user_id and participant_type='user'
    for update;
  if not found then
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,joined_at,left_at,source,metadata)
      values(p_user_id,p_continuity_id,p_plan_id,'user',p_now,null,p_source,jsonb_build_object('firstJoinedAt',p_now,'lastJoinedAt',p_now,'joinCount',1,'requestId',p_request_id))
      returning * into user_attendance;
  elsif user_attendance.left_at is not null then
    update public.together_plan_attendance set left_at=null,source=p_source,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('lastJoinedAt',p_now,'joinCount',coalesce((metadata->>'joinCount')::int,1)+1,'requestId',p_request_id),
      updated_at=p_now where id=user_attendance.id returning * into user_attendance;
  else
    update public.together_plan_attendance
      set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('lastJoinedAt',coalesce(metadata->>'lastJoinedAt',p_now::text),'requestId',p_request_id),updated_at=p_now
      where id=user_attendance.id returning * into user_attendance;
  end if;

  if not exists(
    select 1 from public.together_plan_attendance_segments
    where plan_id=p_plan_id and user_id=p_user_id and participant_type='user' and left_at is null
  ) then
    insert into public.together_plan_attendance_segments(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,request_id)
      values(p_user_id,p_continuity_id,p_plan_id,'user',null,p_now,p_source,p_request_id)
      on conflict do nothing;
  end if;

  if p_now>=start_at and plan_row.status='scheduled' then
    update public.together_shared_plans set status='active',updated_at=p_now where id=p_plan_id;
    plan_row.status:='active';
  end if;

  select * into character_attendance from public.together_plan_attendance
    where plan_id=p_plan_id and participant_type='character' and character_instance_id=p_character_instance_id
    for update;
  companion_present:=found and character_attendance.left_at is null;
  if not companion_present and p_now>=start_at and coalesce(plan_row.companion_state,'expected') not in ('absent','cancelled') then
    update public.together_plan_attendance
      set left_at=null,updated_at=p_now,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('arrivedAt',coalesce(metadata->>'arrivedAt',p_now::text))
      where plan_id=p_plan_id and participant_type='character' and character_instance_id=p_character_instance_id and left_at is not null
      returning * into character_attendance;
    if found then
      companion_present:=true;
    else
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,left_at,source,metadata)
        values(p_user_id,p_continuity_id,p_plan_id,'character',p_character_instance_id,p_now,null,'system',jsonb_build_object('arrivedAt',p_now))
        on conflict do nothing returning * into character_attendance;
      if not found then
        select * into character_attendance from public.together_plan_attendance
          where plan_id=p_plan_id and participant_type='character' and character_instance_id=p_character_instance_id
          for update;
      end if;
      companion_present:=found and character_attendance.left_at is null;
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
    where user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=p_character_instance_id
      and archived_at is null and kind in ('direct','first_meeting')
    order by (id=plan_row.source_conversation_id) desc,updated_at desc nulls last,created_at desc
    limit 1;

  if companion_present then
    select * into scene_row from public.together_scene_sessions
      where user_id=p_user_id and continuity_id=p_continuity_id and shared_plan_id=p_plan_id and ended_at is null
      order by started_at desc limit 1 for update;
    if not found then
      insert into public.together_scene_sessions(user_id,continuity_id,character_instance_id,conversation_id,shared_plan_id,world_id,location_id,source,activity_key,participant_instance_ids,started_at,expected_end_at,state)
        values(p_user_id,p_continuity_id,p_character_instance_id,conversation_id,p_plan_id,plan_row.world_id,plan_row.location_id,'shared_plan',plan_row.activity_key,array[p_character_instance_id],p_now,plan_row.ends_at,jsonb_build_object('planId',p_plan_id,'focus',plan_row.activity_key,'currentActivityKey',plan_row.activity_key,'activity',jsonb_build_object('type',plan_row.activity_key,'actions',jsonb_build_array()),'entryReason','shared_plan'))
        returning * into scene_row;
    end if;
    scene_id:=scene_row.id;
    perform public.kivelle_reconcile_plan_scene_participant(
      p_user_id,p_continuity_id,p_character_instance_id,p_plan_id,scene_id,p_now
    );
  end if;

  return jsonb_build_object('planId',p_plan_id,'sceneId',scene_id,'conversationId',conversation_id,'userJoinedAt',user_attendance.joined_at,'companionPresent',companion_present,'early',p_now<start_at,'requestId',p_request_id);
end;
$$;

revoke all on function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) to service_role;

commit;
