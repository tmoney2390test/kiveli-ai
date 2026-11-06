begin;

-- Only the authenticated edge handler calls this transaction. The caller's
-- user/continuity and conversation scope are checked again under the plan lock.
create or replace function public.kivelli_change_plan_activity(
  p_user_id uuid, p_continuity_id uuid, p_plan_id uuid,
  p_conversation_id uuid, p_activity text, p_request_id text,
  p_activity_state jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  target public.together_shared_plans%rowtype;
  prior jsonb;
  label text := btrim(regexp_replace(p_activity, '\s+', ' ', 'g'));
  stamp timestamptz := now();
begin
  if label is null or char_length(label) not between 1 and 120
     or p_request_id is null or char_length(p_request_id) not between 8 and 120 then
    raise exception 'ACTIVITY_INVALID';
  end if;
  select * into target from public.together_shared_plans
    where id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not exists(select 1 from public.together_conversations c
    where c.id=p_conversation_id and c.user_id=p_user_id and c.continuity_id=p_continuity_id and c.archived_at is null
      and (target.source_conversation_id=c.id or (target.source_conversation_id is null and c.kind='direct' and c.character_instance_id=target.character_instance_id))) then
    raise exception 'PLAN_CONVERSATION_MISMATCH';
  end if;
  select metadata into prior from public.together_conversation_events
    where user_id=p_user_id and conversation_id=p_conversation_id and entity_id=p_plan_id
      and event_type='plan_rescheduled' and metadata->>'activityRequestId'=p_request_id limit 1;
  if found then
    if prior->>'activityKey' is distinct from label then raise exception 'ACTIVITY_REQUEST_REUSED'; end if;
    return target.character_instance_id;
  end if;
  if target.status<>'active' or target.source='date' or target.ends_at<=stamp
     or not exists(select 1 from public.together_plan_attendance where plan_id=p_plan_id and user_id=p_user_id and participant_type='user' and left_at is null)
     or not exists(select 1 from public.together_scene_sessions where shared_plan_id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id and ended_at is null) then
    raise exception 'PLAN_NOT_ACTIVE';
  end if;
  update public.together_shared_plans set activity_key=label,title=label,updated_at=stamp,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('activityChangedAt',stamp)
    where id=p_plan_id;
  update public.together_scene_sessions set activity_key=label,updated_at=stamp,
    state=coalesce(state,'{}'::jsonb)||jsonb_build_object('focus',label,'currentActivityKey',label,'activity',p_activity_state)
    where shared_plan_id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id and ended_at is null;
  update public.together_conversations c set updated_at=stamp,
    metadata=jsonb_set(c.metadata,'{activeScene}',(c.metadata->'activeScene')||jsonb_build_object('activityKey',label,'updatedAt',stamp))
    where c.user_id=p_user_id and c.continuity_id=p_continuity_id
      and exists(select 1 from public.together_scene_sessions s where s.shared_plan_id=p_plan_id and s.user_id=p_user_id and s.ended_at is null and s.id::text=c.metadata->'activeScene'->>'sceneSessionId');
  insert into public.together_conversation_events(user_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
    values(p_user_id,target.character_instance_id,p_conversation_id,'plan_rescheduled','shared_plan',p_plan_id,
      jsonb_build_object('activityChanged',true,'activityRequestId',p_request_id,'activityKey',label,'previousActivityKey',target.activity_key,'title',label,'locationId',target.location_id,'startsAt',target.starts_at,'endsAt',target.ends_at,'status',target.status));
  return target.character_instance_id;
end;
$$;
revoke all on function public.kivelli_change_plan_activity(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelli_change_plan_activity(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
commit;
