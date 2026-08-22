begin;

alter table public.together_conversation_events drop constraint if exists together_conversation_events_event_type_check;
alter table public.together_conversation_events add constraint together_conversation_events_event_type_check
  check(event_type in('plan_proposed','plan_created','plan_rescheduled','plan_cancelled','plan_completed','plan_joined','plan_switched','plan_missed','plan_repaired','plan_late','date_unlocked','moment_created','story_updated','voice_call'));

-- Complete the attended plan and activate its replacement in one database
-- transaction. The replacement is staged and validated by the Edge Function
-- before this RPC; any failure here leaves the original experience untouched.
create or replace function public.kivelle_switch_plan_experience(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_from_plan_id uuid,
  p_to_plan_id uuid,
  p_scene_id uuid,
  p_request_id text,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  from_plan public.together_shared_plans%rowtype;
  to_plan public.together_shared_plans%rowtype;
  finish_result jsonb;
  begin_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));

  select * into from_plan from public.together_shared_plans
    where id=p_from_plan_id and user_id=p_user_id and continuity_id=p_continuity_id
      and character_instance_id=p_character_instance_id
    for update;
  if not found then raise exception 'current plan is unavailable'; end if;

  select * into to_plan from public.together_shared_plans
    where id=p_to_plan_id and user_id=p_user_id and continuity_id=p_continuity_id
      and character_instance_id=p_character_instance_id
    for update;
  if not found then raise exception 'replacement plan is unavailable'; end if;
  if coalesce(to_plan.metadata->>'replacesPlanId','')<>p_from_plan_id::text then
    raise exception 'replacement plan does not match current plan';
  end if;

  -- A network retry after the transaction committed is a successful retry,
  -- not a second switch.
  if from_plan.status='completed' and to_plan.status='active' then
    return jsonb_build_object('switched',true,'idempotent',true,'fromPlanId',p_from_plan_id,'toPlanId',p_to_plan_id);
  end if;
  if from_plan.source='date' then raise exception 'date experience owns completion'; end if;
  if from_plan.status<>'active' then raise exception 'current plan is not active'; end if;
  if to_plan.status<>'scheduled' then raise exception 'replacement plan is not ready'; end if;

  finish_result:=public.kivelle_finish_plan_experience(
    p_user_id,p_continuity_id,p_character_instance_id,p_from_plan_id,
    p_scene_id,p_request_id||':end','user_ended',p_now
  );
  if not coalesce((finish_result->>'transitioned')::boolean,false) then
    raise exception 'current plan could not be completed';
  end if;

  begin_result:=public.kivelle_begin_plan_experience(
    p_user_id,p_continuity_id,p_character_instance_id,p_to_plan_id,
    p_request_id||':start',p_now,'switch'
  );

  update public.together_shared_plans
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'switchState','active','switchedAt',p_now,'switchRequestId',p_request_id
    ),updated_at=p_now
    where id=p_to_plan_id;

  update public.together_conversation_events
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'switchedToPlanId',p_to_plan_id,'switchRequestId',p_request_id
    )
    where user_id=p_user_id and entity_type='shared_plan'
      and entity_id=p_from_plan_id and event_type='plan_completed';

  return jsonb_build_object(
    'switched',true,'idempotent',false,'fromPlanId',p_from_plan_id,
    'toPlanId',p_to_plan_id,'finish',finish_result,'begin',begin_result
  );
end;
$$;

revoke all on function public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz) to service_role;

commit;
