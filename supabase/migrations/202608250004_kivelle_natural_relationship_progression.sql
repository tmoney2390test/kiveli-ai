begin;

-- Preserve the canonical evaluator chain and add a natural-conversation route
-- for Acquaintance -> Friend. The existing shared-history route remains valid.
do $$
begin
  if to_regprocedure('public.kivelle_relationship_progression_state_pre_natural_v3(uuid,uuid,timestamp with time zone)') is null then
    alter function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz)
      rename to kivelle_relationship_progression_state_pre_natural_v3;
  end if;
end $$;

create or replace function public.kivelle_relationship_progression_state(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_result jsonb;
  v_relationship public.together_relationship_states%rowtype;
  v_instance public.together_character_instances%rowtype;
  v_config jsonb:='{}'::jsonb;
  v_pace text:='balanced';
  v_friendship_days integer:=2;
  v_natural_engagement numeric:=12;
  v_natural_turns integer:=9;
  v_natural_familiarity numeric:=12;
  v_progression_interactions integer:=0;
  v_active_days integer:=0;
  v_unresolved_misses integer:=0;
  v_natural_path boolean:=false;
  v_history_path boolean:=false;
  v_eligible boolean:=false;
  v_presentable boolean:=false;
  v_active_commitment boolean:=false;
  v_companion_busy boolean:=false;
  v_poor_moment boolean:=false;
  v_blockers text[]:='{}';
  v_path text;
begin
  v_result:=public.kivelle_relationship_progression_state_pre_natural_v3(
    p_user_id,p_character_instance_id,p_now
  );

  select relationship.* into v_relationship
  from public.together_relationship_states relationship
  where relationship.user_id=p_user_id
    and relationship.character_instance_id=p_character_instance_id;

  select instance.* into v_instance
  from public.together_character_instances instance
  where instance.user_id=p_user_id and instance.id=p_character_instance_id;

  if v_relationship.character_instance_id is null
    or v_instance.id is null
    or v_instance.relationship_stage is distinct from 'acquaintance' then
    return v_result;
  end if;

  select coalesce(version.relationship_config,'{}'::jsonb) into v_config
  from public.together_character_versions version
  where version.id=v_instance.character_version_id;
  v_pace:=coalesce(nullif(v_config->>'pace',''),'balanced');
  if v_pace not in('slow','balanced','fast') then v_pace:='balanced'; end if;

  if v_pace='fast' then
    v_friendship_days:=1;
    v_natural_engagement:=10;
    v_natural_turns:=7;
    v_natural_familiarity:=11;
  elsif v_pace='slow' then
    v_friendship_days:=3;
    v_natural_engagement:=15;
    v_natural_turns:=12;
    v_natural_familiarity:=14;
  end if;

  v_progression_interactions:=coalesce((v_result #>> '{evidence,progressionInteractions}')::integer,0);
  v_active_days:=coalesce((v_result #>> '{evidence,distinctActiveDays}')::integer,0);
  v_unresolved_misses:=coalesce((v_result #>> '{evidence,unresolvedMisses}')::integer,0);

  v_natural_path:=v_relationship.familiarity>=v_natural_familiarity
    and v_relationship.engagement_score>=v_natural_engagement
    and v_relationship.genuine_back_and_forth_turns>=v_natural_turns;
  v_history_path:=v_relationship.familiarity>=15
    and v_progression_interactions>=3
    and v_active_days>=v_friendship_days;
  v_eligible:=v_relationship.trust>=14 and (v_natural_path or v_history_path);
  v_path:=case when v_natural_path then 'natural_conversation'
    when v_history_path then 'shared_history' else null end;

  if v_relationship.trust<14 then
    v_blockers:=array_append(v_blockers,'needs_more_trust');
  end if;
  if not v_natural_path and not v_history_path then
    if v_relationship.familiarity<least(v_natural_familiarity,15) then
      v_blockers:=array_append(v_blockers,'needs_more_familiarity');
    end if;
    if v_relationship.engagement_score<v_natural_engagement
      or v_relationship.genuine_back_and_forth_turns<v_natural_turns then
      v_blockers:=array_append(v_blockers,'needs_more_reciprocal_turns');
    end if;
    if v_progression_interactions<3 then
      v_blockers:=array_append(v_blockers,'needs_more_shared_history');
    end if;
    if v_active_days<v_friendship_days then
      v_blockers:=array_append(v_blockers,'needs_more_time');
    end if;
  end if;

  if v_eligible then
    select exists(
      select 1 from public.together_shared_plans plan
      where plan.user_id=p_user_id
        and plan.character_instance_id=p_character_instance_id
        and plan.status='active'
    ) into v_active_commitment;
    v_companion_busy:=v_instance.current_activity~*'\m(sleep|working|client|meeting|commut|driving|running late|waiting for you|getting ready)';
    v_poor_moment:=v_instance.current_energy='low'
      and v_instance.current_mood~*'\m(stress|upset|angry|overwhelmed|exhaust|tired)';
    if v_active_commitment then v_blockers:=array_append(v_blockers,'active_commitment'); end if;
    if v_unresolved_misses>0 then v_blockers:=array_append(v_blockers,'unresolved_missed_commitment'); end if;
    if v_companion_busy then v_blockers:=array_append(v_blockers,'companion_busy'); end if;
    if v_poor_moment then v_blockers:=array_append(v_blockers,'poor_moment'); end if;
    if v_relationship.last_major_milestone_at is not null
      and v_relationship.last_major_milestone_at>p_now-interval '6 hours' then
      v_blockers:=array_append(v_blockers,'milestone_cooldown');
    end if;
    if v_relationship.last_repair_completed_at is not null
      and v_relationship.last_repair_completed_at>p_now-interval '6 hours' then
      v_blockers:=array_append(v_blockers,'repair_cooldown');
    end if;
  end if;
  v_presentable:=v_eligible and not (v_blockers && array[
    'active_commitment','unresolved_missed_commitment','companion_busy',
    'poor_moment','milestone_cooldown','repair_cooldown'
  ]::text[]);

  v_result:=jsonb_set(v_result,'{eligible}',to_jsonb(v_eligible),true);
  v_result:=jsonb_set(v_result,'{presentable}',to_jsonb(v_presentable),true);
  v_result:=jsonb_set(v_result,'{blockers}',to_jsonb(v_blockers),true);
  v_result:=jsonb_set(v_result,'{evidence,engagementScore}',to_jsonb(v_relationship.engagement_score),true);
  v_result:=jsonb_set(v_result,'{evidence,genuineBackAndForthTurns}',to_jsonb(v_relationship.genuine_back_and_forth_turns),true);
  v_result:=jsonb_set(v_result,'{evidence,friendshipPath}',to_jsonb(coalesce(v_path,'not_ready')),true);
  v_result:=jsonb_set(v_result,'{pacing,naturalConversationEngagement}',to_jsonb(v_natural_engagement),true);
  v_result:=jsonb_set(v_result,'{pacing,naturalConversationTurns}',to_jsonb(v_natural_turns),true);
  v_result:=jsonb_set(v_result,'{pacing,naturalConversationFamiliarity}',to_jsonb(v_natural_familiarity),true);
  return v_result;
end $$;

revoke all on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) to service_role;
revoke all on function public.kivelle_relationship_progression_state_pre_natural_v3(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state_pre_natural_v3(uuid,uuid,timestamptz) to service_role;

comment on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz)
  is 'Canonical relationship progression with shared-history and sustained natural-conversation paths to friendship.';

-- Existing acquaintances should receive the same corrected evaluation as the
-- next chat turn; this creates eligibility, never silently changes their stage.
do $$
declare v_row record;
begin
  for v_row in
    select relationship.user_id,relationship.character_instance_id
    from public.together_relationship_states relationship
    join public.together_character_instances instance
      on instance.id=relationship.character_instance_id
    where instance.relationship_stage='acquaintance'
  loop
    perform public.kivelle_evaluate_relationship_progression(
      v_row.user_id,v_row.character_instance_id,now()
    );
  end loop;
end $$;

commit;
