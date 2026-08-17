begin;

alter table public.together_shared_plans
  add column if not exists completion_reason text;

alter table public.together_shared_plans
  drop constraint if exists together_shared_plans_completion_reason_check;
alter table public.together_shared_plans
  add constraint together_shared_plans_completion_reason_check
  check (
    completion_reason is null
    or completion_reason in (
      'elapsed',
      'user_ended',
      'date_completed',
      'trip_completed',
      'system_reconciled'
    )
  );

comment on column public.together_shared_plans.completion_reason is
  'Why a canonical commitment became completed. completed_at is the actual/scheduled ending boundary; finalized_at is when Kivelle reconciled it.';

update public.together_shared_plans
set completion_reason = case
  when source = 'date' then 'date_completed'
  when completed_at is not null and ends_at is not null and completed_at < ends_at - interval '1 minute' then 'user_ended'
  else 'system_reconciled'
end
where status = 'completed' and completion_reason is null;

-- Repair history for experiences finalized by the earlier V2 helper before
-- completion artifacts were guaranteed by the same transaction.
insert into public.together_life_events(
  user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,
  participant_instance_ids,location_id,significance,starts_at,ends_at,
  resulting_state_changes,user_should_know,proactive_message_appropriate,
  metadata,shared_plan_id
)
select
  plan.user_id,plan.continuity_id,plan.character_instance_id,'shared_plan_completed',
  plan.title,
  coalesce(nullif(plan.metadata->'planExperience'->>'summary',''),nullif(plan.metadata->>'completionSummary',''),plan.title||' became part of your shared history.'),
  array[plan.character_instance_id],plan.location_id,
  greatest(0,least(1,coalesce((plan.metadata->>'significance')::numeric,.45))),
  plan.starts_at,coalesce(plan.completed_at,plan.ends_at),
  jsonb_build_object('sharedActivity',plan.activity_key),true,
  greatest(0,least(1,coalesce((plan.metadata->>'significance')::numeric,.45)))>=.65,
  jsonb_build_object('canonicalPlanId',plan.id,'source',plan.source,'completionReason',plan.completion_reason,'backfilled',true),
  plan.id
from public.together_shared_plans plan
where plan.status='completed' and plan.source<>'date'
  and not exists(select 1 from public.together_life_events event where event.shared_plan_id=plan.id)
on conflict(shared_plan_id) where shared_plan_id is not null do nothing;

insert into public.together_conversation_events(
  user_id,continuity_id,character_instance_id,conversation_id,
  event_type,entity_type,entity_id,metadata,created_at
)
select
  plan.user_id,plan.continuity_id,plan.character_instance_id,plan.source_conversation_id,
  'plan_completed','shared_plan',plan.id,
  jsonb_build_object(
    'title',plan.title,'startsAt',plan.starts_at,'endsAt',coalesce(plan.completed_at,plan.ends_at),
    'scheduledEndsAt',plan.ends_at,'status','completed','locationId',plan.location_id,
    'completionReason',plan.completion_reason,'backfilled',true
  ),
  coalesce(plan.completed_at,plan.updated_at)
from public.together_shared_plans plan
where plan.status='completed' and plan.source_conversation_id is not null
  and not exists(
    select 1 from public.together_conversation_events event
    where event.entity_type='shared_plan' and event.entity_id=plan.id and event.event_type='plan_completed'
  );

create or replace function public.kivelle_fill_plan_completion_reason()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status = 'completed' and new.completion_reason is null then
    new.completion_reason := case
      when new.source = 'date' then 'date_completed'
      when new.completed_at is not null and new.ends_at is not null
        and new.completed_at < new.ends_at - interval '1 minute' then 'user_ended'
      else 'elapsed'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists together_shared_plans_fill_completion_reason
  on public.together_shared_plans;
create trigger together_shared_plans_fill_completion_reason
  before insert or update of status,completed_at,completion_reason
  on public.together_shared_plans
  for each row execute function public.kivelle_fill_plan_completion_reason();

create index if not exists together_shared_plans_completion_boundary_idx
  on public.together_shared_plans(continuity_id,ends_at)
  where status in ('scheduled','active') and ends_at is not null;

-- Ends the canonical shared experience in one transaction. Narrative
-- consolidation remains asynchronous enrichment, but the plan, scene, and
-- attendance can never disagree about whether the experience is still live.
create or replace function public.kivelle_finish_plan_experience(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_plan_id uuid,
  p_scene_id uuid default null,
  p_request_id text default null,
  p_completion_reason text default 'user_ended',
  p_completed_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  plan_row public.together_shared_plans%rowtype;
  scene_row public.together_scene_sessions%rowtype;
  user_attendance public.together_plan_attendance%rowtype;
  character_attendance public.together_plan_attendance%rowtype;
  canonical_end timestamptz;
  end_state jsonb;
  settled_status text;
  settled_reason text;
begin
  if p_completion_reason not in ('user_ended','elapsed','system_reconciled') then
    raise exception 'invalid plan completion reason';
  end if;

  select * into plan_row
  from public.together_shared_plans
  where id = p_plan_id
    and user_id = p_user_id
    and continuity_id = p_continuity_id
    and character_instance_id = p_character_instance_id
  for update;

  if not found then raise exception 'commitment is unavailable'; end if;
  if plan_row.status = 'completed' then
    return jsonb_build_object(
      'transitioned',false,
      'planId',plan_row.id,
      'completedAt',plan_row.completed_at,
      'completionReason',plan_row.completion_reason
    );
  end if;
  if plan_row.status in ('cancelled','missed') then
    raise exception 'commitment is already over';
  end if;
  if plan_row.source = 'date' then
    raise exception 'date experience owns completion';
  end if;
  if plan_row.starts_at is null or plan_row.ends_at is null then
    raise exception 'commitment time is unresolved';
  end if;

  select * into user_attendance
  from public.together_plan_attendance
  where plan_id = p_plan_id and user_id = p_user_id and participant_type = 'user'
  for update;

  select * into character_attendance
  from public.together_plan_attendance
  where plan_id = p_plan_id and participant_type = 'character'
    and character_instance_id = p_character_instance_id
  for update;

  if p_completion_reason <> 'user_ended' and user_attendance.id is null then
    return jsonb_build_object(
      'transitioned',false,
      'requiresProgress',true,
      'planId',plan_row.id
    );
  end if;

  -- A user who arrived but whose companion never did did not complete a
  -- shared experience. Settle it without relationship penalty instead of
  -- manufacturing co-presence from user attendance alone.
  if p_completion_reason <> 'user_ended' and character_attendance.id is null then
    canonical_end := plan_row.ends_at;
    settled_status := case when plan_row.companion_state = 'cancelled' then 'cancelled' else 'missed' end;
    settled_reason := case when plan_row.companion_state = 'cancelled' then 'cancelled' else 'character_absent' end;
    update public.together_scene_sessions
    set ended_at = greatest(started_at,canonical_end),
        state = coalesce(state,'{}'::jsonb) || jsonb_build_object('windingDown',true,'expiredAt',canonical_end,'completionReason',settled_reason),
        updated_at = now()
    where shared_plan_id = p_plan_id and user_id = p_user_id and ended_at is null;
    update public.together_plan_attendance
    set left_at = greatest(joined_at,canonical_end), updated_at = now()
    where plan_id = p_plan_id and user_id = p_user_id and left_at is null;
    update public.together_plan_attendance_segments
    set left_at = greatest(joined_at,canonical_end), updated_at = now()
    where plan_id = p_plan_id and user_id = p_user_id and left_at is null;
    update public.together_shared_plans
    set status = settled_status,
        missed_at = case when settled_status = 'missed' then canonical_end else missed_at end,
        miss_reason = settled_reason,
        cancelled_at = case when settled_status = 'cancelled' then coalesce(cancelled_at,canonical_end) else cancelled_at end,
        updated_at = now()
    where id = p_plan_id;
    insert into public.together_missed_plan_resolutions(
      user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,
      impact_applied,metadata,resolved_at
    ) values (
      p_user_id,p_continuity_id,p_plan_id,p_character_instance_id,'resolved',settled_reason,
      '{}'::jsonb,jsonb_build_object('noUserPenalty',true,'settledAtPlanEnd',true),canonical_end
    ) on conflict(plan_id) do update set
      status='resolved',miss_reason=excluded.miss_reason,impact_applied='{}'::jsonb,
      metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,
      resolved_at=canonical_end,updated_at=now();
    if plan_row.source_conversation_id is not null then
      insert into public.together_conversation_events(
        user_id,continuity_id,character_instance_id,conversation_id,
        event_type,entity_type,entity_id,metadata
      ) values (
        p_user_id,p_continuity_id,p_character_instance_id,plan_row.source_conversation_id,
        case when settled_status='cancelled' then 'plan_cancelled' else 'plan_missed' end,
        'shared_plan',p_plan_id,
        jsonb_build_object('title',plan_row.title,'status',settled_status,'missReason',settled_reason,'locationId',plan_row.location_id,'noUserPenalty',true)
      );
    end if;
    return jsonb_build_object(
      'transitioned',false,'settled',true,'status',settled_status,
      'planId',plan_row.id,'completedAt',canonical_end
    );
  end if;

  if p_completion_reason = 'user_ended' then
    if p_completed_at < plan_row.starts_at then
      raise exception 'commitment has not started';
    end if;
    if p_completed_at >= plan_row.ends_at then
      raise exception 'commitment has elapsed';
    end if;
    if user_attendance.id is null or user_attendance.left_at is not null
      or character_attendance.id is null or character_attendance.left_at is not null then
      raise exception 'active attendance is required';
    end if;
    select * into scene_row
    from public.together_scene_sessions
    where shared_plan_id = p_plan_id and user_id = p_user_id
      and continuity_id = p_continuity_id
      and character_instance_id = p_character_instance_id
      and ended_at is null
      and (p_scene_id is null or id = p_scene_id)
    order by started_at desc
    limit 1
    for update;
    if not found then raise exception 'active plan scene is required'; end if;
    canonical_end := p_completed_at;
  else
    if p_completed_at < plan_row.ends_at then
      raise exception 'commitment has not elapsed';
    end if;
    if user_attendance.id is null then
      return jsonb_build_object(
        'transitioned',false,
        'requiresProgress',true,
        'planId',plan_row.id
      );
    end if;
    canonical_end := plan_row.ends_at;
    select * into scene_row
    from public.together_scene_sessions
    where shared_plan_id = p_plan_id and user_id = p_user_id
      and continuity_id = p_continuity_id
      and character_instance_id = p_character_instance_id
      and ended_at is null
    order by started_at desc
    limit 1
    for update;
  end if;

  if scene_row.id is not null then
    end_state := coalesce(scene_row.state,'{}'::jsonb)
      || jsonb_build_object('windingDown',true,'completionReason',p_completion_reason)
      || case when p_completion_reason = 'user_ended'
        then jsonb_build_object('wrappedUpAt',canonical_end)
        else jsonb_build_object('expiredAt',canonical_end)
      end;
    update public.together_scene_sessions
    set ended_at = greatest(started_at,canonical_end),
        state = end_state,
        updated_at = now()
    where id = scene_row.id and ended_at is null;
  end if;

  update public.together_plan_attendance
  set left_at = greatest(joined_at,canonical_end),
      metadata = coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object('completionReason',p_completion_reason,'endRequestId',p_request_id),
      updated_at = now()
  where plan_id = p_plan_id and user_id = p_user_id and left_at is null;

  update public.together_plan_attendance_segments
  set left_at = greatest(joined_at,canonical_end), updated_at = now()
  where plan_id = p_plan_id and user_id = p_user_id and left_at is null;

  update public.together_shared_plans
  set status = 'completed',
      completed_at = canonical_end,
      finalized_at = now(),
      completion_reason = p_completion_reason,
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'planExperience',coalesce(metadata->'planExperience','{}'::jsonb)
          || jsonb_build_object(
            'completionReason',p_completion_reason,
            'completedAt',canonical_end,
            'endRequestId',p_request_id
          )
      ),
      updated_at = now()
  where id = p_plan_id;

  if plan_row.source <> 'date' then
    insert into public.together_life_events(
      user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,
      participant_instance_ids,location_id,significance,starts_at,ends_at,
      resulting_state_changes,user_should_know,proactive_message_appropriate,
      metadata,shared_plan_id
    ) values (
      p_user_id,p_continuity_id,p_character_instance_id,'shared_plan_completed',
      plan_row.title,
      coalesce(nullif(plan_row.metadata->>'completionSummary',''),plan_row.title||' became part of your shared history.'),
      array[p_character_instance_id],plan_row.location_id,
      greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45))),
      plan_row.starts_at,canonical_end,
      jsonb_build_object('sharedActivity',plan_row.activity_key),true,
      greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)))>=.65,
      jsonb_build_object('canonicalPlanId',plan_row.id,'source',plan_row.source,'completionReason',p_completion_reason),
      plan_row.id
    ) on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
  end if;

  if coalesce(plan_row.source_conversation_id,scene_row.conversation_id) is not null then
    insert into public.together_conversation_events(
      user_id,continuity_id,character_instance_id,conversation_id,
      event_type,entity_type,entity_id,metadata
    ) values (
      p_user_id,p_continuity_id,p_character_instance_id,coalesce(plan_row.source_conversation_id,scene_row.conversation_id),
      'plan_completed','shared_plan',plan_row.id,
      jsonb_build_object(
        'title',plan_row.title,'startsAt',plan_row.starts_at,'endsAt',canonical_end,
        'scheduledEndsAt',plan_row.ends_at,'status','completed',
        'locationId',plan_row.location_id,'completionReason',p_completion_reason
      )
    );
  end if;

  return jsonb_build_object(
    'transitioned',true,
    'planId',p_plan_id,
    'sceneId',scene_row.id,
    'completedAt',canonical_end,
    'completionReason',p_completion_reason
  );
end;
$$;

revoke all on function public.kivelle_finish_plan_experience(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) from public;
grant execute on function public.kivelle_finish_plan_experience(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) to service_role;

commit;
