begin;

-- Keep the core eligibility calculation installed in 035 as a raw implementation,
-- then normalize stage-aware health and post-repair presentation timing here.
alter function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz)
  rename to kivelle_relationship_progression_state_raw;

create or replace function public.kivelle_relationship_progression_state(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state jsonb;
  v_relationship public.together_relationship_states%rowtype;
  v_stage text;
  v_health text:='steady';
  v_unresolved_misses integer:=0;
begin
  v_state:=public.kivelle_relationship_progression_state_raw(p_user_id,p_character_instance_id,p_now);
  select relationship.* into v_relationship
  from public.together_relationship_states relationship
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
  select instance.relationship_stage into v_stage
  from public.together_character_instances instance
  where instance.user_id=p_user_id and instance.id=p_character_instance_id;
  if v_relationship.character_instance_id is null or v_stage is null then return v_state; end if;

  v_unresolved_misses:=coalesce((v_state #>> '{evidence,unresolvedMisses}')::integer,0);
  v_health:=case
    when v_relationship.active_major_conflict or v_relationship.conflict>45 or v_unresolved_misses>0 then 'strained'
    when v_relationship.conflict>25
      or (v_stage in('friend','flirting','dating','exclusive','long_term') and (v_relationship.trust<25 or v_relationship.respect<25)) then 'uncertain'
    when v_relationship.trust>=60 and v_relationship.comfort>=55 and v_relationship.respect>=50 and v_relationship.conflict<20 then 'close'
    when v_relationship.trust>=35 and v_relationship.comfort>=30 and v_relationship.conflict<30 then 'warm'
    else 'steady' end;
  v_state:=jsonb_set(v_state,'{health}',to_jsonb(v_health),true);

  -- A successful repair should have room to breathe before a new declaration such
  -- as exclusivity or long-term is surfaced.
  if coalesce((v_state->>'eligible')::boolean,false)
    and coalesce(v_state->>'kind','')<>'repair'
    and v_relationship.last_repair_completed_at is not null
    and v_relationship.last_repair_completed_at>p_now-interval '6 hours' then
    v_state:=jsonb_set(v_state,'{presentable}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,'{blockers}',coalesce(v_state->'blockers','[]'::jsonb)||jsonb_build_array('repair_cooldown'),true);
  end if;
  return v_state;
end $$;
revoke all on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) to service_role;
revoke all on function public.kivelle_relationship_progression_state_raw(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state_raw(uuid,uuid,timestamptz) to service_role;

-- Home/life simulation always advances last_simulated_at. Use that as a cheap clock
-- to reconsider a milestone whose only blocker was timing, even when mood/activity
-- text did not happen to change on that refresh.
create or replace function public.kivelle_character_relationship_moment_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.last_simulated_at is distinct from old.last_simulated_at
    or new.current_mood is distinct from old.current_mood
    or new.current_activity is distinct from old.current_activity
    or new.current_energy is distinct from old.current_energy then
    perform public.kivelle_evaluate_relationship_progression(new.user_id,new.id,now());
  end if;
  return new;
end $$;
drop trigger if exists together_character_relationship_moment_recheck_v2 on public.together_character_instances;
create trigger together_character_relationship_moment_recheck_v2
  after update of current_mood,current_activity,current_energy,last_simulated_at on public.together_character_instances
  for each row execute function public.kivelle_character_relationship_moment_recheck_v2();

-- If a real, positive Date immediately preceded the mutual romantic-spark choice,
-- that Date can be the relationship-defining first Date. Kivelle does not force the
-- couple to repeat an experience solely to satisfy a database sequence.
create or replace function public.kivelle_attach_recent_date_to_romantic_spark() returns trigger language plpgsql security definer set search_path=public as $$
declare v_date_session_id uuid;
begin
  if old.status='pending' and new.status='accepted' and new.kind='romantic_spark' and new.chosen_action='accept' then
    if exists(select 1 from public.together_relationship_states relationship where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id and relationship.relationship_defining_date_session_id is null) then
      select evidence.source_id::uuid into v_date_session_id
      from public.together_relationship_evidence evidence
      where evidence.user_id=new.user_id and evidence.character_instance_id=new.character_instance_id
        and evidence.evidence_type='date_completed' and evidence.source_type='date_session'
        and evidence.valence>=-.1 and evidence.occurred_at>=now()-interval '24 hours'
      order by evidence.occurred_at desc limit 1;
      if v_date_session_id is not null then
        update public.together_relationship_states relationship set
          relationship_defining_date_session_id=v_date_session_id,
          dating_invitation_accepted_at=coalesce(relationship.dating_invitation_accepted_at,now()),
          updated_at=now()
        where relationship.user_id=new.user_id and relationship.character_instance_id=new.character_instance_id
          and relationship.relationship_defining_date_session_id is null;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_recent_date_spark_v2 on public.together_relationship_milestones;
create trigger together_relationship_recent_date_spark_v2
  after update of status,chosen_action on public.together_relationship_milestones
  for each row execute function public.kivelle_attach_recent_date_to_romantic_spark();

-- Refresh cached health/readiness through the normalized wrapper after installing it.
do $$
declare v_row record;
begin
  for v_row in select relationship.user_id,relationship.character_instance_id from public.together_relationship_states relationship loop
    perform public.kivelle_evaluate_relationship_progression(v_row.user_id,v_row.character_instance_id,now());
  end loop;
end $$;

commit;
