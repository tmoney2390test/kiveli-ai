begin;

-- Canonical progression evaluator. All local variables are prefixed so existing
-- production rows cannot hit ambiguous PL/pgSQL identifier resolution.
create or replace function public.kivelle_relationship_progression_state(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_relationship public.together_relationship_states%rowtype;
  v_instance public.together_character_instances%rowtype;
  v_config jsonb:='{}'::jsonb;
  v_profile jsonb:='{}'::jsonb;
  v_stage text;
  v_pace text:='balanced';
  v_romance_enabled boolean:=true;
  v_friendship_days integer:=2;
  v_exclusive_days integer:=3;
  v_long_term_days integer:=7;
  v_romance_trust integer:=14;
  v_romance_comfort integer:=18;
  v_exclusive_commitment integer:=28;
  v_long_term_commitment integer:=50;
  v_meaningful_count integer:=0;
  v_romantic_count integer:=0;
  v_active_days integer:=0;
  v_progression_interactions integer:=0;
  v_shared_count integer:=0;
  v_positive_dates integer:=0;
  v_trips_count integer:=0;
  v_moments_count integer:=0;
  v_kept_count integer:=0;
  v_missed_count integer:=0;
  v_repairs_count integer:=0;
  v_future_count integer:=0;
  v_unresolved_misses integer:=0;
  v_shared_after integer:=0;
  v_future_after integer:=0;
  v_repairs_after_conflict integer:=0;
  v_capped_conversations integer:=0;
  v_defining_completed boolean:=false;
  v_defining_positive boolean:=false;
  v_stage_start timestamptz;
  v_days_since_stage numeric:=0;
  v_health text:='steady';
  v_candidate text;
  v_to_stage text;
  v_eligible boolean:=false;
  v_presentable boolean:=false;
  v_blockers text[]:='{}';
  v_presentation_blockers text[]:='{}';
  v_active_commitment boolean:=false;
  v_companion_busy boolean:=false;
  v_poor_moment boolean:=false;
begin
  select relationship.* into v_relationship
  from public.together_relationship_states relationship
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
  select instance.* into v_instance
  from public.together_character_instances instance
  where instance.user_id=p_user_id and instance.id=p_character_instance_id;
  if v_relationship.character_instance_id is null or v_instance.id is null then
    return jsonb_build_object('eligible',false,'presentable',false,'blockers',jsonb_build_array('relationship_unavailable'));
  end if;

  select coalesce(version.relationship_config,'{}'::jsonb) into v_config
  from public.together_character_versions version where version.id=v_instance.character_version_id;
  select coalesce(profile.content_preferences,'{}'::jsonb) into v_profile
  from public.together_profiles profile where profile.user_id=p_user_id;

  v_stage:=v_instance.relationship_stage;
  v_pace:=coalesce(nullif(v_config->>'pace',''),'balanced');
  if v_pace not in('slow','balanced','fast') then v_pace:='balanced'; end if;
  v_romance_enabled:=coalesce((v_profile->>'romanceEnabled')::boolean,true);
  v_friendship_days:=case v_pace when 'fast' then 1 when 'slow' then 3 else 2 end;
  v_exclusive_days:=case v_pace when 'fast' then 2 when 'slow' then 5 else 3 end;
  v_long_term_days:=case v_pace when 'fast' then 5 when 'slow' then 10 else 7 end;
  v_romance_trust:=round(14+(coalesce((v_config->>'needsTrustBeforeRomance')::numeric,.5)-.5)*8);
  v_romance_comfort:=round(18+(coalesce((v_config->>'needsTrustBeforeRomance')::numeric,.5)-.5)*6);
  v_exclusive_commitment:=round(28+(coalesce((v_config->>'needsComfortBeforeCommitment')::numeric,.5)-.5)*8-(coalesce((v_config->>'exclusivityPreference')::numeric,.5)-.5)*6);
  v_long_term_commitment:=round(50+(coalesce((v_config->>'needsComfortBeforeCommitment')::numeric,.5)-.5)*8-(coalesce((v_config->>'longTermOrientation')::numeric,.5)-.5)*8);

  select
    count(*) filter(where evidence.evidence_type='meaningful_conversation'),
    count(*) filter(where evidence.evidence_type='romantic_signal'),
    count(distinct evidence.local_date) filter(where evidence.evidence_type in('meaningful_conversation','shared_plan_completed','date_completed','trip_completed','major_shared_moment','repair_completed')),
    count(*) filter(where evidence.evidence_type in('shared_plan_completed','date_completed','trip_completed','major_shared_moment')),
    count(*) filter(where evidence.evidence_type='date_completed' and evidence.valence>=-.1),
    count(*) filter(where evidence.evidence_type='trip_completed'),
    count(*) filter(where evidence.evidence_type='major_shared_moment'),
    count(*) filter(where evidence.evidence_type='commitment_kept'),
    count(*) filter(where evidence.evidence_type='commitment_missed'),
    count(*) filter(where evidence.evidence_type='repair_completed'),
    count(*) filter(where evidence.evidence_type='future_planning')
  into v_meaningful_count,v_romantic_count,v_active_days,v_shared_count,v_positive_dates,
    v_trips_count,v_moments_count,v_kept_count,v_missed_count,v_repairs_count,v_future_count
  from public.together_relationship_evidence evidence
  where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id;

  select coalesce(sum(least(2,day_count)),0)::integer into v_capped_conversations
  from(
    select evidence.local_date,count(*)::integer as day_count
    from public.together_relationship_evidence evidence
    where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id and evidence.evidence_type='meaningful_conversation'
    group by evidence.local_date
  ) daily;
  v_progression_interactions:=v_capped_conversations+v_shared_count+v_repairs_count;

  select count(*) into v_unresolved_misses
  from public.together_missed_plan_resolutions resolution
  where resolution.user_id=p_user_id and resolution.character_instance_id=p_character_instance_id
    and resolution.status in('awaiting_explanation','explained','unresolved');

  v_stage_start:=case v_stage
    when 'dating' then coalesce(v_relationship.dating_started_at,v_relationship.stage_entered_at)
    when 'exclusive' then coalesce(v_relationship.exclusive_at,v_relationship.stage_entered_at)
    when 'long_term' then coalesce(v_relationship.long_term_at,v_relationship.stage_entered_at)
    else v_relationship.stage_entered_at end;
  if v_stage_start is not null then
    v_days_since_stage:=greatest(0,extract(epoch from(p_now-v_stage_start))/86400);
    select count(*) into v_shared_after
    from public.together_relationship_evidence evidence
    where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
      and evidence.occurred_at>=v_stage_start
      and evidence.evidence_type in('shared_plan_completed','date_completed','trip_completed','major_shared_moment')
      and evidence.valence>=-.1;
    select count(*) into v_future_after
    from public.together_relationship_evidence evidence
    where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
      and evidence.occurred_at>=v_stage_start and evidence.evidence_type='future_planning';
  end if;
  if v_relationship.major_conflict_started_at is not null then
    select count(*) into v_repairs_after_conflict
    from public.together_relationship_evidence evidence
    where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
      and evidence.occurred_at>=v_relationship.major_conflict_started_at and evidence.evidence_type='repair_completed';
  end if;
  if v_relationship.relationship_defining_date_session_id is not null then
    select exists(
      select 1 from public.together_date_sessions session
      where session.id=v_relationship.relationship_defining_date_session_id and session.user_id=p_user_id
        and session.character_instance_id=p_character_instance_id and session.status='completed'
    ) into v_defining_completed;
    select exists(
      select 1 from public.together_relationship_evidence evidence
      where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
        and evidence.evidence_type='date_completed' and evidence.source_type='date_session'
        and evidence.source_id=v_relationship.relationship_defining_date_session_id::text and evidence.valence>=-.1
    ) into v_defining_positive;
  end if;

  v_health:=case
    when v_relationship.active_major_conflict or v_relationship.conflict>45 or v_unresolved_misses>0 then 'strained'
    when v_relationship.conflict>25 or v_relationship.trust<25 or v_relationship.respect<25 then 'uncertain'
    when v_relationship.trust>=60 and v_relationship.comfort>=55 and v_relationship.respect>=50 and v_relationship.conflict<20 then 'close'
    when v_relationship.trust>=35 and v_relationship.comfort>=30 and v_relationship.conflict<30 then 'warm'
    else 'steady' end;

  if v_relationship.active_major_conflict or v_relationship.conflict>45 then
    v_candidate:='repair';
  elsif v_stage='stranger' then
    v_candidate:='keep_in_touch';
    if v_progression_interactions<1 then v_blockers:=array_append(v_blockers,'needs_meaningful_interaction'); end if;
  elsif v_stage='acquaintance' then
    v_candidate:='friendship_deepened';
    if v_relationship.trust<14 then v_blockers:=array_append(v_blockers,'needs_more_trust'); end if;
    if v_relationship.familiarity<15 then v_blockers:=array_append(v_blockers,'needs_more_familiarity'); end if;
    if v_progression_interactions<3 then v_blockers:=array_append(v_blockers,'needs_more_shared_history'); end if;
    if v_active_days<v_friendship_days then v_blockers:=array_append(v_blockers,'needs_more_time'); end if;
  elsif v_stage='friend' then
    if not v_romance_enabled or v_relationship.romance_path_status='friends_only' then
      v_candidate:=null;
    else
      v_candidate:='romantic_spark';
      if v_relationship.trust<v_romance_trust then v_blockers:=array_append(v_blockers,'needs_more_trust'); end if;
      if v_relationship.attraction<18 then v_blockers:=array_append(v_blockers,'needs_more_attraction'); end if;
      if v_relationship.comfort<v_romance_comfort then v_blockers:=array_append(v_blockers,'needs_more_comfort'); end if;
      if v_romantic_count<2 and v_positive_dates<1 then v_blockers:=array_append(v_blockers,'needs_mutual_romantic_signal'); end if;
    end if;
  elsif v_stage='flirting' then
    if not v_romance_enabled or v_relationship.romance_path_status='friends_only' then
      v_candidate:=null;
    elsif v_relationship.relationship_defining_date_session_id is not null then
      v_candidate:='dating_start';
      if not v_defining_completed then v_blockers:=array_append(v_blockers,'relationship_defining_date_not_completed'); end if;
      if v_defining_completed and not v_defining_positive then v_blockers:=array_append(v_blockers,'date_needs_repair'); end if;
    else
      v_candidate:='first_date_invitation';
      if v_relationship.familiarity<28 then v_blockers:=array_append(v_blockers,'needs_more_familiarity'); end if;
      if v_relationship.trust<24 then v_blockers:=array_append(v_blockers,'needs_more_trust'); end if;
      if v_relationship.attraction<22 then v_blockers:=array_append(v_blockers,'needs_more_attraction'); end if;
      if v_progression_interactions<5 then v_blockers:=array_append(v_blockers,'needs_more_shared_history'); end if;
    end if;
  elsif v_stage='dating' then
    v_candidate:='exclusivity';
    if v_relationship.trust<42 then v_blockers:=array_append(v_blockers,'needs_more_trust'); end if;
    if v_relationship.comfort<40 then v_blockers:=array_append(v_blockers,'needs_more_comfort'); end if;
    if v_relationship.romantic_interest<40 then v_blockers:=array_append(v_blockers,'needs_more_romantic_interest'); end if;
    if v_relationship.commitment<v_exclusive_commitment then v_blockers:=array_append(v_blockers,'needs_more_commitment'); end if;
    if v_relationship.respect<35 then v_blockers:=array_append(v_blockers,'needs_more_respect'); end if;
    if v_relationship.conflict>35 or v_relationship.active_major_conflict then v_blockers:=array_append(v_blockers,'active_conflict'); end if;
    if v_unresolved_misses>0 then v_blockers:=array_append(v_blockers,'unresolved_missed_commitment'); end if;
    if v_days_since_stage<v_exclusive_days then v_blockers:=array_append(v_blockers,'needs_more_time'); end if;
    if v_shared_after<2 then v_blockers:=array_append(v_blockers,'needs_more_shared_experiences'); end if;
  elsif v_stage='exclusive' then
    v_candidate:='long_term';
    if v_relationship.trust<58 then v_blockers:=array_append(v_blockers,'needs_more_trust'); end if;
    if v_relationship.comfort<55 then v_blockers:=array_append(v_blockers,'needs_more_comfort'); end if;
    if v_relationship.respect<50 then v_blockers:=array_append(v_blockers,'needs_more_respect'); end if;
    if v_relationship.commitment<v_long_term_commitment then v_blockers:=array_append(v_blockers,'needs_more_commitment'); end if;
    if v_relationship.conflict>30 or v_relationship.active_major_conflict then v_blockers:=array_append(v_blockers,'active_conflict'); end if;
    if v_unresolved_misses>0 then v_blockers:=array_append(v_blockers,'unresolved_missed_commitment'); end if;
    if v_days_since_stage<v_long_term_days then v_blockers:=array_append(v_blockers,'needs_more_time'); end if;
    if v_shared_after<3 then v_blockers:=array_append(v_blockers,'needs_more_shared_experiences'); end if;
    if v_future_after<1 then v_blockers:=array_append(v_blockers,'needs_future_planning'); end if;
    if v_relationship.major_conflict_started_at is not null
      and v_relationship.major_conflict_started_at>=coalesce(v_relationship.exclusive_at,v_relationship.stage_entered_at,'epoch'::timestamptz)
      and v_repairs_after_conflict<1 then v_blockers:=array_append(v_blockers,'needs_conflict_repair'); end if;
  end if;

  v_eligible:=v_candidate is not null and coalesce(array_length(v_blockers,1),0)=0;
  v_to_stage:=case v_candidate
    when 'keep_in_touch' then 'acquaintance'
    when 'friendship_deepened' then 'friend'
    when 'romantic_spark' then 'flirting'
    when 'dating_start' then 'dating'
    when 'exclusivity' then 'exclusive'
    when 'long_term' then 'long_term'
    else null end;

  if v_eligible then
    select exists(
      select 1 from public.together_shared_plans plan
      where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id and plan.status='active'
    ) into v_active_commitment;
    v_companion_busy:=v_instance.current_activity~*'\m(sleep|working|client|meeting|commut|driving|running late|waiting for you|getting ready)';
    v_poor_moment:=v_candidate<>'repair' and v_instance.current_energy='low' and v_instance.current_mood~*'\m(stress|upset|angry|overwhelmed|exhaust|tired)';
    if v_active_commitment then v_presentation_blockers:=array_append(v_presentation_blockers,'active_commitment'); end if;
    if v_unresolved_misses>0 and v_candidate<>'repair' then v_presentation_blockers:=array_append(v_presentation_blockers,'unresolved_missed_commitment'); end if;
    if v_companion_busy then v_presentation_blockers:=array_append(v_presentation_blockers,'companion_busy'); end if;
    if v_poor_moment then v_presentation_blockers:=array_append(v_presentation_blockers,'poor_moment'); end if;
    if v_relationship.last_major_milestone_at is not null and v_relationship.last_major_milestone_at>p_now-interval '6 hours' then
      v_presentation_blockers:=array_append(v_presentation_blockers,'milestone_cooldown');
    end if;
  end if;
  v_presentable:=v_eligible and coalesce(array_length(v_presentation_blockers,1),0)=0;

  return jsonb_build_object(
    'stage',v_stage,'health',v_health,'kind',v_candidate,'toStage',v_to_stage,
    'eligible',v_eligible,'presentable',v_presentable,'blockers',to_jsonb(v_blockers||v_presentation_blockers),
    'evidence',jsonb_build_object(
      'meaningfulConversations',v_meaningful_count,'romanticSignals',v_romantic_count,
      'distinctActiveDays',v_active_days,'progressionInteractions',v_progression_interactions,
      'sharedExperiences',v_shared_count,'positiveDates',v_positive_dates,'completedTrips',v_trips_count,
      'majorSharedMoments',v_moments_count,'commitmentsKept',v_kept_count,'commitmentsMissed',v_missed_count,
      'repairsCompleted',v_repairs_count,'futurePlanning',v_future_count,'unresolvedMisses',v_unresolved_misses,
      'sharedExperiencesAfterStage',v_shared_after,'futurePlanningAfterStage',v_future_after,
      'repairsAfterMajorConflict',v_repairs_after_conflict,'definingDateCompleted',v_defining_completed,
      'definingDatePositive',v_defining_positive
    ),
    'pacing',jsonb_build_object('pace',v_pace,'friendshipDays',v_friendship_days,'exclusiveDays',v_exclusive_days,'longTermDays',v_long_term_days,'exclusiveCommitment',v_exclusive_commitment,'longTermCommitment',v_long_term_commitment)
  );
end $$;
revoke all on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) to service_role;

create or replace function public.kivelle_evaluate_relationship_progression(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state jsonb;
  v_kind text;
  v_stage text;
  v_to_stage text;
  v_eligibility_key text;
  v_companion_name text;
  v_title text;
  v_body text;
  v_prompt text;
  v_choices jsonb;
  v_existing public.together_relationship_milestones%rowtype;
  v_date_template public.together_date_templates%rowtype;
  v_date_session_id uuid;
  v_current_world_id uuid;
  v_relationship public.together_relationship_states%rowtype;
begin
  v_state:=public.kivelle_relationship_progression_state(p_user_id,p_character_instance_id,p_now);
  v_kind:=v_state->>'kind';v_stage:=v_state->>'stage';v_to_stage:=v_state->>'toStage';

  update public.together_relationship_states relationship set
    relationship_health_cache=coalesce(v_state->>'health','steady'),
    evidence_summary_cache=coalesce(v_state->'evidence','{}'::jsonb),
    next_milestone_kind=v_kind,
    next_milestone_eligible_at=case when coalesce((v_state->>'eligible')::boolean,false) then coalesce(relationship.next_milestone_eligible_at,p_now) else null end,
    next_milestone_presentable=coalesce((v_state->>'presentable')::boolean,false),
    updated_at=greatest(relationship.updated_at,p_now)
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;

  if v_kind is null or not coalesce((v_state->>'eligible')::boolean,false) or not coalesce((v_state->>'presentable')::boolean,false) then return v_state; end if;
  if exists(select 1 from public.together_relationship_milestones milestone where milestone.user_id=p_user_id and milestone.character_instance_id=p_character_instance_id and milestone.status='pending') then return v_state; end if;

  select relationship.* into v_relationship from public.together_relationship_states relationship
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
  v_eligibility_key:=case when v_kind='repair' then 'repair:'||v_stage||':'||coalesce(v_relationship.major_conflict_started_at::date,p_now::date)::text else v_kind||':'||v_stage end;

  select milestone.* into v_existing
  from public.together_relationship_milestones milestone
  where milestone.user_id=p_user_id and milestone.character_instance_id=p_character_instance_id
    and milestone.eligibility_key=v_eligibility_key;
  if v_existing.id is not null and v_existing.status in('accepted','declined','completed') then return v_state; end if;
  if v_existing.id is not null and v_existing.status='deferred' and v_existing.deferred_until is not null and v_existing.deferred_until>p_now then return v_state; end if;

  select template.name into v_companion_name
  from public.together_character_instances instance
  join public.together_character_templates template on template.id=instance.character_template_id
  where instance.id=p_character_instance_id and instance.user_id=p_user_id;

  if v_kind='first_date_invitation' then
    select location.world_id into v_current_world_id
    from public.together_character_instances instance
    join public.together_locations location on location.id=instance.current_location_id
    where instance.id=p_character_instance_id and instance.user_id=p_user_id;

    select template.* into v_date_template
    from public.together_date_templates template
    left join public.together_date_sessions session on session.date_template_id=template.id
      and session.user_id=p_user_id and session.character_instance_id=p_character_instance_id
    where template.active=true and (v_current_world_id is null or template.world_id=v_current_world_id)
      and (session.id is null or session.status in('locked','deferred'))
      and (
        jsonb_typeof(template.unlock_rules->'allowed_stages') is distinct from 'array'
        or jsonb_array_length(template.unlock_rules->'allowed_stages')=0
        or (template.unlock_rules->'allowed_stages') ? v_stage
      )
      and v_relationship.familiarity>=coalesce(nullif(template.unlock_rules->>'familiarity','')::integer,0)
      and v_relationship.trust>=coalesce(nullif(template.unlock_rules->>'trust','')::integer,0)
      and v_relationship.attraction>=coalesce(nullif(template.unlock_rules->>'attraction','')::integer,0)
      and v_relationship.comfort>=coalesce(nullif(template.unlock_rules->>'comfort','')::integer,0)
      and (not coalesce(nullif(template.unlock_rules->>'no_major_conflict','')::boolean,false) or not v_relationship.active_major_conflict)
    order by template.created_at limit 1;

    if v_date_template.id is null then
      update public.together_relationship_states relationship set
        next_milestone_presentable=false,
        evidence_summary_cache=relationship.evidence_summary_cache||jsonb_build_object('presentationBlocker','no_date_available')
      where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
      return v_state||jsonb_build_object('presentable',false,'blockers',coalesce(v_state->'blockers','[]'::jsonb)||jsonb_build_array('no_date_available'));
    end if;

    select session.id into v_date_session_id
    from public.together_date_sessions session
    where session.user_id=p_user_id and session.character_instance_id=p_character_instance_id and session.date_template_id=v_date_template.id;
    if v_date_session_id is null then
      insert into public.together_date_sessions(user_id,character_instance_id,date_template_id,status)
      values(p_user_id,p_character_instance_id,v_date_template.id,'locked') returning id into v_date_session_id;
    end if;
  end if;

  v_title:=case v_kind
    when 'keep_in_touch' then 'Keep in touch?'
    when 'friendship_deepened' then 'This is becoming real'
    when 'romantic_spark' then 'There’s a spark here'
    when 'first_date_invitation' then coalesce(v_date_template.name,'Spend time together?')
    when 'dating_start' then 'Do this again?'
    when 'exclusivity' then 'What are we doing here?'
    when 'long_term' then 'This has become part of my life'
    else 'Something feels unresolved' end;
  v_body:=case v_kind
    when 'keep_in_touch' then 'The moment is ending, but '||coalesce(v_companion_name,'your companion')||' makes it clear they would like to keep talking.'
    when 'friendship_deepened' then 'Time together has started to feel less like chance meetings and more like an actual friendship.'
    when 'romantic_spark' then 'A warm moment lingers, leaving room to decide whether this stays friendship or becomes something more.'
    when 'first_date_invitation' then coalesce(v_companion_name,'Your companion')||' is ready to turn the connection into a real shared Date.'
    when 'dating_start' then 'The Date mattered. '||coalesce(v_companion_name,'Your companion')||' would like to keep seeing you this way.'
    when 'exclusivity' then coalesce(v_companion_name,'Your companion')||' is ready to talk about choosing each other intentionally.'
    when 'long_term' then 'Your shared history has become steady enough to talk about this as a serious continuing partnership.'
    else coalesce(v_companion_name,'Your companion')||' would rather address the tension honestly than pretend it is not there.' end;
  v_prompt:=case v_kind
    when 'repair' then 'How do you want to handle it?'
    when 'exclusivity' then 'Where do you want this relationship to go?'
    when 'long_term' then 'Do you want to name what this has become?'
    else 'How do you meet the moment?' end;
  v_choices:=case v_kind
    when 'repair' then '[{"id":"talk_it_out","label":"Talk it out","tone":"primary"},{"id":"give_space","label":"Give them some space","tone":"secondary"}]'::jsonb
    when 'romantic_spark' then '[{"id":"accept","label":"Lean into the spark","tone":"primary"},{"id":"stay_friends","label":"Keep this as friendship","tone":"secondary"},{"id":"defer","label":"Not yet","tone":"secondary"}]'::jsonb
    when 'dating_start' then '[{"id":"accept","label":"I’d like that","tone":"primary"},{"id":"defer","label":"Let’s take it slowly","tone":"secondary"},{"id":"stay_friends","label":"I’d rather stay friends","tone":"secondary"}]'::jsonb
    when 'exclusivity' then '[{"id":"accept","label":"I want us to be exclusive","tone":"primary"},{"id":"defer","label":"I’m not ready yet","tone":"secondary"}]'::jsonb
    when 'long_term' then '[{"id":"accept","label":"I feel that too","tone":"primary"},{"id":"defer","label":"Let’s keep growing into it","tone":"secondary"}]'::jsonb
    when 'first_date_invitation' then '[{"id":"accept","label":"Yes—let’s do it","tone":"primary"},{"id":"defer","label":"Ask me again later","tone":"secondary"}]'::jsonb
    when 'keep_in_touch' then '[{"id":"accept","label":"I’d like that","tone":"primary"},{"id":"defer","label":"Let’s take it slowly","tone":"secondary"}]'::jsonb
    else '[{"id":"accept","label":"I feel it too","tone":"primary"},{"id":"defer","label":"Keep getting to know each other","tone":"secondary"}]'::jsonb end;

  if v_existing.id is not null and v_existing.status='deferred' then
    update public.together_relationship_milestones milestone set
      status='pending',chosen_action=null,deferred_until=null,resolved_at=null,
      title=v_title,body=v_body,prompt=v_prompt,choices=v_choices,
      metadata=coalesce(milestone.metadata,'{}'::jsonb)||jsonb_build_object('engine','relationship_v2','evidence',v_state->'evidence'),
      updated_at=p_now
    where milestone.id=v_existing.id;
  else
    insert into public.together_relationship_milestones(
      user_id,character_instance_id,kind,from_stage,to_stage,eligibility_key,title,body,prompt,choices,metadata
    ) values(
      p_user_id,p_character_instance_id,v_kind,v_stage,v_to_stage,v_eligibility_key,v_title,v_body,v_prompt,v_choices,
      jsonb_strip_nulls(jsonb_build_object('engine','relationship_v2','presentation_key','relationship.'||v_kind,'evidence',v_state->'evidence','date_template_id',v_date_template.id,'date_session_id',v_date_session_id))
    );
  end if;
  insert into public.together_analytics_events(user_id,event_name,properties)
  values(p_user_id,'relationship_milestone_created',jsonb_build_object('characterInstanceId',p_character_instance_id,'kind',v_kind,'engine','relationship_v2'));
  return v_state;
end $$;
revoke all on function public.kivelle_evaluate_relationship_progression(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_evaluate_relationship_progression(uuid,uuid,timestamptz) to service_role;

-- Legacy dialogue may still attempt to insert its old milestone proposal. It can no
-- longer bypass the canonical V2 evidence and personal-state evaluator.
create or replace function public.kivelle_guard_relationship_milestone_insert() returns trigger language plpgsql security definer set search_path=public as $$
declare v_state jsonb;
begin
  v_state:=public.kivelle_relationship_progression_state(new.user_id,new.character_instance_id,now());
  if coalesce(v_state->>'kind','')<>new.kind
    or not coalesce((v_state->>'eligible')::boolean,false)
    or not coalesce((v_state->>'presentable')::boolean,false) then
    raise exception 'relationship milestone is not canonically eligible or presentable';
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_milestone_v2_guard on public.together_relationship_milestones;
create trigger together_relationship_milestone_v2_guard before insert on public.together_relationship_milestones
for each row execute function public.kivelle_guard_relationship_milestone_insert();

create or replace function public.kivelle_stamp_relationship_stage() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.relationship_stage is distinct from old.relationship_stage then
    update public.together_relationship_states relationship set
      stage_entered_at=now(),
      dating_started_at=case when new.relationship_stage='dating' then coalesce(relationship.dating_started_at,now()) else relationship.dating_started_at end,
      exclusive_at=case when new.relationship_stage='exclusive' then coalesce(relationship.exclusive_at,now()) else relationship.exclusive_at end,
      long_term_at=case when new.relationship_stage='long_term' then coalesce(relationship.long_term_at,now()) else relationship.long_term_at end,
      next_milestone_kind=null,next_milestone_eligible_at=null,next_milestone_presentable=false,updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists together_character_relationship_stage_stamp on public.together_character_instances;
create trigger together_character_relationship_stage_stamp after update of relationship_stage on public.together_character_instances
for each row execute function public.kivelle_stamp_relationship_stage();

create or replace function public.kivelle_track_major_relationship_conflict() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.active_major_conflict or new.conflict>45)
    and not(coalesce(old.active_major_conflict,false) or coalesce(old.conflict,0)>45) then
    new.major_conflict_started_at:=now();
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_major_conflict_stamp on public.together_relationship_states;
create trigger together_relationship_major_conflict_stamp before update of conflict,active_major_conflict on public.together_relationship_states
for each row execute function public.kivelle_track_major_relationship_conflict();

create or replace function public.kivelle_relationship_milestone_resolution_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_date_session_id uuid;
  v_timezone text:='UTC';
begin
  if old.status='pending' and new.status in('accepted','declined','completed') then
    update public.together_relationship_states relationship set
      last_major_milestone_at=now(),next_milestone_kind=null,next_milestone_eligible_at=null,next_milestone_presentable=false,updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  end if;

  if new.kind in('romantic_spark','dating_start') and new.chosen_action='stay_friends' and old.status='pending' then
    update public.together_relationship_states relationship set romance_path_status='friends_only',updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
    if new.kind='dating_start' then
      update public.together_character_instances instance set relationship_stage='friend',updated_at=now()
      where instance.id=new.character_instance_id and instance.user_id=new.user_id and instance.relationship_stage='flirting';
    end if;
  elsif new.kind='romantic_spark' and new.chosen_action='accept' and old.status='pending' then
    update public.together_relationship_states relationship set romance_path_status='open',updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  end if;

  if new.kind='first_date_invitation' and new.chosen_action='accept' and old.status='pending' then
    begin v_date_session_id:=nullif(new.metadata->>'date_session_id','')::uuid; exception when invalid_text_representation then v_date_session_id:=null; end;
    if v_date_session_id is null then
      select session.id into v_date_session_id
      from public.together_date_sessions session
      where session.user_id=new.user_id and session.character_instance_id=new.character_instance_id
        and session.date_template_id=nullif(new.metadata->>'date_template_id','')::uuid
      order by session.created_at limit 1;
    end if;
    if v_date_session_id is not null then
      update public.together_relationship_states relationship set
        relationship_defining_date_session_id=v_date_session_id,dating_invitation_accepted_at=now(),updated_at=now()
      where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
    end if;
  end if;

  if new.kind='repair' and new.chosen_action='talk_it_out' and old.status='pending' and new.status='accepted' then
    select coalesce(profile.experience_timezone,'UTC') into v_timezone from public.together_profiles profile where profile.user_id=new.user_id;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'repair_completed','milestone',new.id::text,now(),.9,.7,v_timezone,jsonb_build_object('milestoneKind','repair'));
    update public.together_relationship_states relationship set last_repair_completed_at=now(),updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_milestone_resolution_v2 on public.together_relationship_milestones;
create trigger together_relationship_milestone_resolution_v2 after update of status,chosen_action on public.together_relationship_milestones
for each row execute function public.kivelle_relationship_milestone_resolution_v2();

-- Future-oriented user language and explicit reopening of a friendship-only romance
-- path are captured directly. Meaningful/romantic conversation evidence is emitted
-- from the already server-classified relationship update below.
create or replace function public.kivelle_message_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_timezone text:='UTC';v_current_path text;
begin
  if new.role<>'user' then return new; end if;
  select coalesce(profile.experience_timezone,'UTC') into v_timezone from public.together_profiles profile where profile.user_id=new.user_id;
  if new.content~*'\m(our future|someday|next month|next year|holiday|vacation|trip together|travel together|move in|live together|future together|next season)\M' then
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'future_planning','message',new.id::text,new.created_at,.7,.45,v_timezone,jsonb_build_object('conversationId',new.conversation_id));
  end if;
  select relationship.romance_path_status into v_current_path from public.together_relationship_states relationship
  where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  if v_current_path='friends_only' and new.content~*'(changed my mind|more than friends|want to date|give us a chance|try dating|romantic chance|I want us)' then
    update public.together_relationship_states relationship set romance_path_status='open',updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  end if;
  return new;
end $$;

create or replace function public.kivelle_relationship_state_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_timezone text:='UTC';v_delta jsonb;
begin
  if new.interaction_turn_count>coalesce(old.interaction_turn_count,0) then
    select coalesce(profile.experience_timezone,'UTC') into v_timezone from public.together_profiles profile where profile.user_id=new.user_id;
    if new.last_interaction_quality='meaningful' then
      perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'meaningful_conversation','message','interaction:'||new.interaction_turn_count::text,new.updated_at,.7,.3,v_timezone,jsonb_build_object('interactionTurn',new.interaction_turn_count,'quality',new.last_interaction_quality));
    end if;
    v_delta:=coalesce(new.last_relationship_delta,'{}'::jsonb);
    if coalesce((v_delta->>'attraction')::numeric,0)>0 or coalesce((v_delta->>'romantic_interest')::numeric,0)>0 or coalesce((v_delta->>'commitment')::numeric,0)>0 then
      perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'romantic_signal','message','interaction:'||new.interaction_turn_count::text,new.updated_at,.75,.5,v_timezone,jsonb_build_object('interactionTurn',new.interaction_turn_count,'delta',v_delta));
    end if;
  end if;
  perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());
  return new;
end $$;

create or replace function public.kivelle_plan_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_timezone text;v_significance numeric;v_became_completed boolean:=false;v_became_missed boolean:=false;v_became_scheduled boolean:=false;
begin
  v_timezone:=coalesce(new.world_timezone,'UTC');
  v_significance:=greatest(0,least(1,coalesce((new.metadata->>'significance')::numeric,.5)));
  if tg_op='INSERT' then
    v_became_completed:=new.status='completed';v_became_missed:=new.status='missed';v_became_scheduled:=new.status='scheduled';
  else
    v_became_completed:=new.status='completed' and old.status is distinct from 'completed';
    v_became_missed:=new.status='missed' and old.status is distinct from 'missed';
    v_became_scheduled:=new.status='scheduled' and (old.status is distinct from 'scheduled' or old.starts_at is distinct from new.starts_at);
  end if;
  if v_became_scheduled and new.starts_at is not null and new.starts_at>now()+interval '24 hours' then
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'future_planning','shared_plan',new.id::text,now(),.65,.4,v_timezone,jsonb_build_object('title',new.title,'startsAt',new.starts_at));
  end if;
  if v_became_completed then
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'commitment_kept','shared_plan',new.id::text,coalesce(new.completed_at,now()),greatest(.6,v_significance),.6,v_timezone,jsonb_build_object('title',new.title));
    if new.activity_key='trip' or new.metadata ? 'tripId' then
      perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'trip_completed','trip',coalesce(new.metadata->>'tripId',new.id::text),coalesce(new.completed_at,now()),greatest(.85,v_significance),.75,v_timezone,jsonb_build_object('planId',new.id,'title',new.title));
    elsif new.source<>'date' then
      perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'shared_plan_completed','shared_plan',new.id::text,coalesce(new.completed_at,now()),greatest(.65,v_significance),.55,v_timezone,jsonb_build_object('title',new.title));
    end if;
  elsif v_became_missed then
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'commitment_missed','shared_plan',new.id::text,coalesce(new.missed_at,now()),greatest(.65,v_significance),-.7,v_timezone,jsonb_build_object('title',new.title,'reason',new.miss_reason));
  end if;
  perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());
  return new;
end $$;

create or replace function public.kivelle_date_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_raw numeric:=0;v_valence numeric:=0;v_timezone text:='UTC';v_world_id uuid;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select coalesce(sum(
      coalesce((choice.relationship_impact->>'trust')::numeric,0)+coalesce((choice.relationship_impact->>'comfort')::numeric,0)+
      coalesce((choice.relationship_impact->>'affinity')::numeric,0)+coalesce((choice.relationship_impact->>'attraction')::numeric,0)+
      coalesce((choice.relationship_impact->>'respect')::numeric,0)+coalesce((choice.relationship_impact->>'romantic_interest')::numeric,0)+
      coalesce((choice.relationship_impact->>'commitment')::numeric,0)-coalesce((choice.relationship_impact->>'conflict')::numeric,0)
    ),0) into v_raw
    from public.together_date_choices choice where choice.date_session_id=new.id and choice.user_id=new.user_id;
    v_valence:=greatest(-1,least(1,v_raw/12));
    select template.world_id into v_world_id from public.together_date_templates template where template.id=new.date_template_id;
    select coalesce(world.timezone,'UTC') into v_timezone from public.together_worlds world where world.id=v_world_id;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'date_completed','date_session',new.id::text,coalesce(new.completed_at,now()),.9,v_valence,v_timezone,jsonb_build_object('dateTemplateId',new.date_template_id,'relationshipDefining',exists(select 1 from public.together_relationship_states relationship where relationship.character_instance_id=new.character_instance_id and relationship.relationship_defining_date_session_id=new.id)));
    perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());
  end if;
  return new;
end $$;

create or replace function public.kivelle_moment_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_timezone text:='UTC';v_world_id uuid;
begin
  if new.moment_type not in('date','shared_plan') then
    if new.location_id is not null then
      select location.world_id into v_world_id from public.together_locations location where location.id=new.location_id;
      select coalesce(world.timezone,'UTC') into v_timezone from public.together_worlds world where world.id=v_world_id;
    end if;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'major_shared_moment','moment',new.id::text,new.occurred_at,.8,.55,v_timezone,jsonb_build_object('momentType',new.moment_type,'title',new.title));
  end if;
  return new;
end $$;

create or replace function public.kivelle_repaired_miss_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare v_timezone text:='UTC';
begin
  if new.status='repaired' and old.status is distinct from 'repaired' then
    select coalesce(profile.experience_timezone,'UTC') into v_timezone from public.together_profiles profile where profile.user_id=new.user_id;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'repair_completed','repair',new.id::text,coalesce(new.resolved_at,now()),.9,.7,v_timezone,jsonb_build_object('planId',new.plan_id,'missReason',new.miss_reason));
    update public.together_relationship_states relationship set last_repair_completed_at=coalesce(new.resolved_at,now()),updated_at=now()
    where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id;
  end if;
  return new;
end $$;

-- Backfill existing history conservatively. This does not change anyone's current
-- relationship stage; it only gives the new engine evidence for future milestones.
insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select message.user_id,conversation.continuity_id,message.character_instance_id,'meaningful_conversation',.55,.2,'message',message.id::text,message.created_at,public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'conversationId',conversation.id)
from public.together_messages message
join public.together_conversations conversation on conversation.id=message.conversation_id
join public.together_profiles profile on profile.user_id=message.user_id
where message.role='user' and (char_length(btrim(message.content))>=80 or message.content~*'\m(i feel|i am worried|i''m worried|i''m scared|i am scared|i need to tell you|i''ve never told|thank you for|i was wrong|i''m sorry|my family|my daughter|my son|my dream|my goal|i care about)\M')
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select message.user_id,conversation.continuity_id,message.character_instance_id,'romantic_signal',.65,.45,'message',message.id::text,message.created_at,public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true)
from public.together_messages message
join public.together_conversations conversation on conversation.id=message.conversation_id
join public.together_profiles profile on profile.user_id=message.user_id
where message.role='user' and message.content~*'\m(flirt|kiss|date|romantic|attracted|beautiful|gorgeous|crush|love you|more than friends|feel something|into you)\M'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select message.user_id,conversation.continuity_id,message.character_instance_id,'future_planning',.6,.4,'message',message.id::text,message.created_at,public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true)
from public.together_messages message
join public.together_conversations conversation on conversation.id=message.conversation_id
join public.together_profiles profile on profile.user_id=message.user_id
where message.role='user' and message.content~*'\m(our future|someday|next month|next year|holiday|vacation|trip together|travel together|move in|live together|future together|next season)\M'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,'future_planning',.6,.4,'shared_plan',plan.id::text,plan.created_at,public.kivelle_relationship_local_date(plan.created_at,coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'title',plan.title,'startsAt',plan.starts_at)
from public.together_shared_plans plan where plan.status='scheduled' and plan.starts_at>plan.created_at+interval '24 hours'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,'commitment_kept',greatest(.6,coalesce((plan.metadata->>'significance')::numeric,.5)),.6,'shared_plan',plan.id::text,coalesce(plan.completed_at,plan.ends_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.completed_at,plan.ends_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'title',plan.title)
from public.together_shared_plans plan where plan.status='completed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,
  case when plan.activity_key='trip' or plan.metadata ? 'tripId' then 'trip_completed' else 'shared_plan_completed' end,
  greatest(.65,coalesce((plan.metadata->>'significance')::numeric,.5)),.55,
  case when plan.activity_key='trip' or plan.metadata ? 'tripId' then 'trip' else 'shared_plan' end,
  case when plan.activity_key='trip' or plan.metadata ? 'tripId' then coalesce(plan.metadata->>'tripId',plan.id::text) else plan.id::text end,
  coalesce(plan.completed_at,plan.ends_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.completed_at,plan.ends_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'title',plan.title)
from public.together_shared_plans plan where plan.status='completed' and plan.source<>'date'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,'commitment_missed',.7,-.7,'shared_plan',plan.id::text,coalesce(plan.missed_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.missed_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'reason',plan.miss_reason)
from public.together_shared_plans plan where plan.status='missed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select session.user_id,session.continuity_id,session.character_instance_id,'date_completed',.9,.4,'date_session',session.id::text,coalesce(session.completed_at,session.updated_at),public.kivelle_relationship_local_date(coalesce(session.completed_at,session.updated_at),coalesce(world.timezone,'UTC')),jsonb_build_object('backfill',true,'dateTemplateId',session.date_template_id)
from public.together_date_sessions session
join public.together_date_templates template on template.id=session.date_template_id
join public.together_worlds world on world.id=template.world_id
where session.status='completed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select moment.user_id,moment.continuity_id,moment.character_instance_id,'major_shared_moment',.8,.5,'moment',moment.id::text,moment.occurred_at,public.kivelle_relationship_local_date(moment.occurred_at,coalesce(world.timezone,profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'momentType',moment.moment_type)
from public.together_moments moment
join public.together_profiles profile on profile.user_id=moment.user_id
left join public.together_locations location on location.id=moment.location_id
left join public.together_worlds world on world.id=location.world_id
where moment.moment_type not in('date','shared_plan')
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select resolution.user_id,resolution.continuity_id,resolution.character_instance_id,'repair_completed',.9,.7,'repair',resolution.id::text,coalesce(resolution.resolved_at,resolution.updated_at),public.kivelle_relationship_local_date(coalesce(resolution.resolved_at,resolution.updated_at),coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'planId',resolution.plan_id)
from public.together_missed_plan_resolutions resolution
join public.together_profiles profile on profile.user_id=resolution.user_id
where resolution.status='repaired'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

-- Recover the accepted first-Date choice for users who already crossed that milestone
-- before V2, without changing their current stage.
update public.together_relationship_states relationship set
  relationship_defining_date_session_id=session.id,
  dating_invitation_accepted_at=coalesce(relationship.dating_invitation_accepted_at,milestone.resolved_at,milestone.updated_at)
from public.together_relationship_milestones milestone
join public.together_date_sessions session on session.user_id=milestone.user_id and session.character_instance_id=milestone.character_instance_id
  and session.date_template_id=nullif(milestone.metadata->>'date_template_id','')::uuid
where milestone.user_id=relationship.user_id and milestone.character_instance_id=relationship.character_instance_id
  and milestone.kind='first_date_invitation' and milestone.status='accepted'
  and relationship.relationship_defining_date_session_id is null;

-- Enable runtime evidence only after backfill so a production migration does not
-- repeatedly evaluate partially backfilled relationships.
drop trigger if exists together_message_relationship_evidence_v2 on public.together_messages;
create trigger together_message_relationship_evidence_v2 after insert on public.together_messages
for each row execute function public.kivelle_message_relationship_evidence_v2();

drop trigger if exists together_relationship_state_evidence_v2 on public.together_relationship_states;
create trigger together_relationship_state_evidence_v2 after update of
  trust,comfort,attraction,affinity,familiarity,respect,conflict,romantic_interest,commitment,
  active_major_conflict,romance_path_status,interaction_turn_count,last_interaction_quality,last_relationship_delta
on public.together_relationship_states for each row execute function public.kivelle_relationship_state_evidence_v2();

drop trigger if exists together_plan_relationship_evidence_v2 on public.together_shared_plans;
create trigger together_plan_relationship_evidence_v2 after insert or update of status,starts_at,completed_at,missed_at on public.together_shared_plans
for each row execute function public.kivelle_plan_relationship_evidence_v2();

drop trigger if exists together_date_relationship_evidence_v2 on public.together_date_sessions;
create trigger together_date_relationship_evidence_v2 after update of status,completed_at on public.together_date_sessions
for each row execute function public.kivelle_date_relationship_evidence_v2();

drop trigger if exists together_moment_relationship_evidence_v2 on public.together_moments;
create trigger together_moment_relationship_evidence_v2 after insert on public.together_moments
for each row execute function public.kivelle_moment_relationship_evidence_v2();

drop trigger if exists together_repaired_miss_evidence_v2 on public.together_missed_plan_resolutions;
create trigger together_repaired_miss_evidence_v2 after update of status,resolved_at on public.together_missed_plan_resolutions
for each row execute function public.kivelle_repaired_miss_evidence_v2();

create or replace function public.kivelle_character_relationship_moment_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.current_mood is distinct from old.current_mood or new.current_activity is distinct from old.current_activity or new.current_energy is distinct from old.current_energy then
    perform public.kivelle_evaluate_relationship_progression(new.user_id,new.id,now());
  end if;
  return new;
end $$;
drop trigger if exists together_character_relationship_moment_recheck_v2 on public.together_character_instances;
create trigger together_character_relationship_moment_recheck_v2 after update of current_mood,current_activity,current_energy on public.together_character_instances
for each row execute function public.kivelle_character_relationship_moment_recheck_v2();

create or replace function public.kivelle_relationship_evidence_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());
  return new;
end $$;
drop trigger if exists together_relationship_evidence_recheck_v2 on public.together_relationship_evidence;
create trigger together_relationship_evidence_recheck_v2 after insert or update of quality,valence,occurred_at on public.together_relationship_evidence
for each row execute function public.kivelle_relationship_evidence_recheck_v2();

-- Existing users retain their current stage; V2 only derives health and future readiness.
do $$
declare v_row record;
begin
  for v_row in select relationship.user_id,relationship.character_instance_id from public.together_relationship_states relationship loop
    perform public.kivelle_evaluate_relationship_progression(v_row.user_id,v_row.character_instance_id,now());
  end loop;
end $$;

commit;
