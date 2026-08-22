begin;

-- The original function used relationship_stage as both a PL/pgSQL variable
-- and an unqualified column. PostgreSQL raises 42702 only when a stale live
-- plan reaches this branch, which made unrelated call context creation fail.
create or replace function public.kivelle_progress_shared_plans_core(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
)
returns setof public.together_shared_plans
language plpgsql
security definer
set search_path=public
as $$
declare
  plan_row public.together_shared_plans%rowtype;
  memory_id uuid;
  plan_significance numeric;
  plan_summary text;
  prior_misses integer;
  penalty integer;
  current_relationship_stage text;
  impact jsonb;
  miss_kind text;
begin
  for plan_row in
    select * from public.together_shared_plans
    where user_id=p_user_id and character_instance_id=p_character_instance_id
      and status='scheduled' and starts_at is not null and starts_at<=p_now and ends_at>p_now
    order by starts_at for update
  loop
    if plan_row.companion_state in('absent','cancelled') then
      miss_kind:=case when plan_row.companion_state='cancelled' then 'cancelled' else 'character_absent' end;
      update public.together_shared_plans
      set status=case when miss_kind='cancelled' then 'cancelled' else 'missed' end,
          missed_at=case when miss_kind='cancelled' then missed_at else p_now end,
          miss_reason=miss_kind,
          cancelled_at=case when miss_kind='cancelled' then coalesce(cancelled_at,p_now) else cancelled_at end,
          updated_at=p_now
      where id=plan_row.id;
      insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',miss_kind,'{}'::jsonb,jsonb_build_object('companionReason',plan_row.companion_reason,'noUserPenalty',true))
      on conflict(plan_id) do nothing;
      continue;
    end if;
    if plan_row.companion_state='expected'
      or (plan_row.companion_state='late' and plan_row.companion_eta_at is not null and plan_row.companion_eta_at<=p_now)
    then
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,'character',plan_row.character_instance_id,case when plan_row.companion_state='late' then plan_row.companion_eta_at else plan_row.starts_at end,'system',jsonb_build_object('companionState',plan_row.companion_state))
      on conflict do nothing;
    end if;
    update public.together_shared_plans
    set status='active',grace_ends_at=coalesce(grace_ends_at,starts_at+make_interval(mins=>grace_minutes)),updated_at=p_now
    where id=plan_row.id and status='scheduled';
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_started',jsonb_build_object('planId',plan_row.id,'source',plan_row.source))
    on conflict do nothing;
  end loop;

  for plan_row in
    update public.together_shared_plans plan
    set status='missed',missed_at=coalesce(plan.missed_at,p_now),miss_reason='user_absent',updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id
      and plan.status='active' and plan.participation_mode='live'
      and coalesce(plan.grace_ends_at,plan.starts_at+make_interval(mins=>plan.grace_minutes))<=p_now
      and exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='character')
      and not exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user')
    returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    select count(*) into prior_misses
    from public.together_shared_plans previous
    where previous.user_id=plan_row.user_id and previous.character_instance_id=plan_row.character_instance_id
      and previous.status='missed' and previous.miss_reason='user_absent' and previous.id<>plan_row.id;
    select instance.relationship_stage into current_relationship_stage
    from public.together_character_instances as instance
    where instance.id=plan_row.character_instance_id;
    penalty:=1+case when plan_significance>=.65 then 1 else 0 end
      +case when plan_significance>=.85 then 1 else 0 end
      +case when current_relationship_stage in('dating','exclusive','long_term') then 1 else 0 end
      +least(2,prior_misses);
    impact:=jsonb_build_object('trust',-least(5,penalty),'respect',-least(4,greatest(1,penalty-1)),'conflict',least(5,penalty),'affinity',case when plan_significance>=.75 then -1 else 0 end);
    update public.together_relationship_states
    set trust=greatest(0,trust-least(5,penalty)),respect=greatest(0,respect-least(4,greatest(1,penalty-1))),
        conflict=least(100,conflict+least(5,penalty)),affinity=greatest(0,affinity+case when plan_significance>=.75 then -1 else 0 end),
        last_relationship_delta=impact,recent_direction='strained',updated_at=p_now
    where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id;
    insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata)
    values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'awaiting_explanation','user_absent',impact,jsonb_build_object('priorMisses',prior_misses,'significance',plan_significance,'waitedMinutes',greatest(0,extract(epoch from(p_now-plan_row.starts_at))/60)::integer))
    on conflict(plan_id) do update
    set status='awaiting_explanation',miss_reason='user_absent',impact_applied=excluded.impact_applied,
        metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,updated_at=p_now;
    if plan_row.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_missed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'status','missed','missReason','user_absent','locationId',plan_row.location_id))
      on conflict do nothing;
    end if;
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_missed',jsonb_build_object('planId',plan_row.id,'reason','user_absent','priorMisses',prior_misses));
  end loop;

  for plan_row in
    update public.together_shared_plans plan
    set status='completed',completed_at=coalesce(plan.completed_at,p_now),updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id
      and plan.status='active' and plan.ends_at<=p_now
      and (plan.participation_mode<>'live' or exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user'))
    returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    plan_summary:=coalesce(nullif(plan_row.metadata->>'completionSummary',''),'User and their companion spent time together for '||plan_row.title||'.');
    if plan_row.source='date' then
      insert into public.together_analytics_events(user_id,event_name,properties)
      values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source','date','effectsOwnedBy','date_session'));
      continue;
    end if;
    if plan_row.legacy_life_event_id is not null then
      update public.together_life_events
      set event_type='shared_plan_completed',title=plan_row.title,narrative_summary=plan_summary,starts_at=plan_row.starts_at,
          ends_at=plan_row.ends_at,location_id=plan_row.location_id,significance=plan_significance,user_should_know=true,
          metadata=metadata||jsonb_build_object('canonicalPlanId',plan_row.id,'completedAt',p_now)
      where id=plan_row.legacy_life_event_id;
    else
      insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,shared_plan_id)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'shared_plan_completed',plan_row.title,plan_summary,array[plan_row.character_instance_id],plan_row.location_id,plan_significance,plan_row.starts_at,plan_row.ends_at,jsonb_build_object('sharedActivity',plan_row.activity_key),true,plan_significance>=.65,jsonb_build_object('canonicalPlanId',plan_row.id,'source',plan_row.source),plan_row.id)
      on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
    end if;
    if plan_significance>=.42 then
      insert into public.together_memories(user_id,continuity_id,character_instance_id,memory_type,canonical_text,dedupe_key,importance,confidence,sensitivity_category,status,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'episodic',plan_summary,'shared-plan:'||plan_row.id::text,plan_significance,.95,'none','active',jsonb_build_object('sharedPlanId',plan_row.id,'locationId',plan_row.location_id))
      on conflict(character_instance_id,dedupe_key) do update
      set canonical_text=excluded.canonical_text,importance=greatest(public.together_memories.importance,excluded.importance),updated_at=p_now
      returning id into memory_id;
    end if;
    if plan_significance>=.5 then
      update public.together_relationship_states
      set affinity=least(100,affinity+1),familiarity=least(100,familiarity+1),last_interaction_quality='shared_experience',
          last_relationship_delta='{"affinity":1,"familiarity":1}'::jsonb,recent_direction='improving',updated_at=p_now
      where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id;
    end if;
    if plan_significance>=.72 then
      insert into public.together_moments(user_id,continuity_id,character_instance_id,title,occurred_at,location_id,summary,participant_instance_ids,linked_memory_ids,relationship_impact,media,moment_type,shared_plan_id)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.title,plan_row.ends_at,plan_row.location_id,plan_summary,array[plan_row.character_instance_id],case when memory_id is null then '{}'::uuid[] else array[memory_id] end,'{"affinity":1,"familiarity":1}'::jsonb,'[]'::jsonb,'shared_plan',plan_row.id)
      on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
    end if;
    if plan_row.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_completed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'endsAt',plan_row.ends_at,'status','completed','locationId',plan_row.location_id))
      on conflict do nothing;
    end if;
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source',plan_row.source));
  end loop;

  return query
  select * from public.together_shared_plans
  where user_id=p_user_id and character_instance_id=p_character_instance_id
  order by starts_at nulls last,created_at;
end
$$;

revoke all on function public.kivelle_progress_shared_plans_core(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_progress_shared_plans_core(uuid,uuid,timestamptz) to service_role;

comment on function public.kivelle_progress_shared_plans_core(uuid,uuid,timestamptz) is
  'Advances canonical shared-plan attendance and outcomes without ambiguous relationship-stage resolution.';

commit;
