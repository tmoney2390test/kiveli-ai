begin;

alter table public.together_character_instances
  add column if not exists schedule_pause jsonb;

-- Service-only mutation. The API supplies authenticated ownership and a
-- server-resolved routine snapshot, never client location/activity claims.
create or replace function public.kivelle_set_schedule_pause(
  p_user_id uuid, p_continuity_id uuid, p_conversation_id uuid,
  p_paused boolean, p_confirmation text, p_expected_paused_at text,
  p_snapshot jsonb default null
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  companion public.together_character_instances;
  companion_id uuid;
  pause_state jsonb;
  now_at timestamptz := clock_timestamp();
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'SCHEDULE_NOT_AUTHORIZED';
  end if;
  if p_paused is null or p_confirmation is distinct from
    (case when p_paused then 'pause_schedule' else 'resume_schedule' end) then
    raise exception 'SCHEDULE_CONFIRMATION_REQUIRED';
  end if;
  select c.character_instance_id into companion_id from public.together_conversations c
    where c.id=p_conversation_id and c.user_id=p_user_id and c.continuity_id=p_continuity_id
      and c.kind in ('direct','first_meeting') and c.archived_at is null;
  if companion_id is null then raise exception 'SCHEDULE_CONVERSATION_NOT_FOUND'; end if;
  select * into companion from public.together_character_instances
    where id=companion_id and user_id=p_user_id and continuity_id=p_continuity_id for update;
  if not found then raise exception 'SCHEDULE_COMPANION_NOT_FOUND'; end if;
  if (companion.schedule_pause->>'pausedAt') is distinct from p_expected_paused_at then
    raise exception 'SCHEDULE_STATE_CHANGED';
  end if;
  if p_paused = (companion.schedule_pause is not null) then
    return jsonb_build_object('characterInstanceId',companion.id,'schedulePause',companion.schedule_pause);
  end if;
  if p_paused then
    if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
      or coalesce(length(p_snapshot->>'activity'),0) not between 1 and 1000
      or coalesce(length(p_snapshot->>'activityKey'),0) not between 1 and 200
      or coalesce(p_snapshot->>'interruptibility','') not in ('open','limited','busy','unavailable')
      or coalesce(p_snapshot->>'state','') not in ('active','working','relaxing','sleeping','traveling','busy') then
      raise exception 'SCHEDULE_SNAPSHOT_INVALID';
    end if;
    if p_snapshot->>'locationId' is not null and not exists (
      select 1 from public.together_locations where id=(p_snapshot->>'locationId')::uuid
    ) then raise exception 'SCHEDULE_LOCATION_INVALID'; end if;
    pause_state := jsonb_build_object('version',1,'pausedAt',now_at,'locationId',p_snapshot->'locationId',
      'activity',p_snapshot->>'activity','activityKey',p_snapshot->>'activityKey',
      'interruptibility',p_snapshot->>'interruptibility','state',p_snapshot->>'state');
  end if;
  update public.together_character_instances set schedule_pause=pause_state,
    last_simulated_at=now_at,last_event_simulated_at=now_at,updated_at=now_at
    where id=companion.id and user_id=p_user_id;
  return jsonb_build_object('characterInstanceId',companion.id,'schedulePause',pause_state);
end $$;

revoke all on function public.kivelle_set_schedule_pause(uuid,uuid,uuid,boolean,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_set_schedule_pause(uuid,uuid,uuid,boolean,text,text,jsonb) to service_role;
comment on column public.together_character_instances.schedule_pause is
  'Private routine hold. Plans/scenes override it while active; null resumes current schedule without replaying missed routine events.';

commit;
