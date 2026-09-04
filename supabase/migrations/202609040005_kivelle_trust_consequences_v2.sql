begin;

-- Reuse the canonical relationship-history ledger for negative trust events
-- and repairs. The unique source key makes message retries idempotent.
alter table public.together_relationship_evidence
  drop constraint if exists together_relationship_evidence_evidence_type_check;
alter table public.together_relationship_evidence
  add constraint together_relationship_evidence_evidence_type_check check(evidence_type in(
    'meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment',
    'commitment_kept','commitment_missed','repair_completed','future_planning','shared_experience','playful_competition',
    'support','vulnerability','affection','romantic_tension','conflict','repair','boundary_respected','boundary_ignored',
    'trust_consequence','trust_repair'
  ));

create or replace function public.kivelle_apply_trust_consequence_v2(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_source_id text,
  p_kind text,
  p_severity text,
  p_confidence numeric,
  p_reason_code text,
  p_evidence_basis text,
  p_event_source text,
  p_repairable boolean default true,
  p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_continuity_id uuid;
  v_existing_id uuid;
  v_evidence_id uuid;
  v_requested_delta integer;
  v_used_loss integer:=0;
  v_remaining_loss integer;
  v_applied_delta integer;
  v_new_trust integer;
  v_timezone text:='UTC';
begin
  if p_user_id is null or p_character_instance_id is null or nullif(btrim(p_source_id),'') is null then
    return jsonb_build_object('applied',false,'reason','invalid_source');
  end if;
  if p_kind not in('hostility','contempt','deception','manipulation','boundary_violation','confidence_breach','vulnerability_dismissal','threat','broken_promise')
    or p_severity not in('minor','moderate','serious','major')
    or p_evidence_basis not in('explicit_user_language','canonical_context')
    or p_event_source not in('deterministic','model')
    or coalesce(p_confidence,0)<.8 then
    return jsonb_build_object('applied',false,'reason','unverified_event');
  end if;

  select instance.continuity_id into v_continuity_id
  from public.together_character_instances instance
  where instance.id=p_character_instance_id and instance.user_id=p_user_id;
  if v_continuity_id is null then return jsonb_build_object('applied',false,'reason','relationship_not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-trust:'||p_character_instance_id::text,0));

  select evidence.id into v_existing_id
  from public.together_relationship_evidence evidence
  where evidence.character_instance_id=p_character_instance_id
    and evidence.evidence_type='trust_consequence'
    and evidence.source_type='message'
    and evidence.source_id=btrim(p_source_id)
  limit 1;
  if v_existing_id is not null then return jsonb_build_object('applied',false,'reason','duplicate','evidenceId',v_existing_id); end if;

  -- Model-classified events are deliberately capped at four points. Only a
  -- deterministic rule may apply the eight-point major consequence.
  v_requested_delta:=case p_severity
    when 'minor' then -1
    when 'moderate' then -2
    when 'serious' then -4
    else case when p_event_source='deterministic' then -8 else -4 end
  end;
  select coalesce(sum(case
    when evidence.metadata->>'appliedTrustDelta'~'^-[0-9]+$' then -(evidence.metadata->>'appliedTrustDelta')::integer
    else 0 end),0)::integer into v_used_loss
  from public.together_relationship_evidence evidence
  where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
    and evidence.evidence_type='trust_consequence'
    and evidence.occurred_at>=coalesce(p_occurred_at,now())-interval '24 hours';
  v_remaining_loss:=greatest(0,8-v_used_loss);
  v_applied_delta:=-least(abs(v_requested_delta),v_remaining_loss);
  select coalesce((select profile.experience_timezone from public.together_profiles profile where profile.user_id=p_user_id limit 1),'UTC') into v_timezone;

  insert into public.together_relationship_evidence(
    user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata
  ) values(
    p_user_id,v_continuity_id,p_character_instance_id,'trust_consequence',least(1,greatest(0,p_confidence)),v_applied_delta::numeric/10,
    'message',btrim(p_source_id),coalesce(p_occurred_at,now()),public.kivelle_relationship_local_date(coalesce(p_occurred_at,now()),v_timezone),
    jsonb_build_object('kind',p_kind,'severity',p_severity,'reasonCode',left(coalesce(nullif(btrim(p_reason_code),''),p_kind),80),
      'evidenceBasis',p_evidence_basis,'repairable',coalesce(p_repairable,true),'classifierSource',p_event_source,
      'requestedTrustDelta',v_requested_delta,'appliedTrustDelta',v_applied_delta,'repairStatus','open','ruleVersion','trust_consequences_v2')
  ) returning id into v_evidence_id;

  if v_applied_delta<0 then
    update public.together_relationship_states relationship set
      trust=greatest(0,least(100,relationship.trust+v_applied_delta)),
      last_relationship_delta=coalesce(relationship.last_relationship_delta,'{}'::jsonb)||jsonb_build_object('trust',v_applied_delta),
      recent_direction='strained',
      updated_at=coalesce(p_occurred_at,now())
    where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id
    returning relationship.trust into v_new_trust;
  else
    select relationship.trust into v_new_trust from public.together_relationship_states relationship
    where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
  end if;
  return jsonb_build_object('applied',v_applied_delta<0,'reason',case when v_applied_delta<0 then 'applied' else 'daily_cap' end,
    'evidenceId',v_evidence_id,'trustDelta',v_applied_delta,'trust',v_new_trust);
end $$;

create or replace function public.kivelle_apply_trust_repair_v2(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_source_id text,
  p_confidence numeric,
  p_apology boolean,
  p_accountability boolean,
  p_corrective_action boolean,
  p_reason_code text,
  p_occurred_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_continuity_id uuid;
  v_existing_id uuid;
  v_target public.together_relationship_evidence%rowtype;
  v_lost integer;
  v_restore integer;
  v_factor numeric;
  v_evidence_id uuid;
  v_new_trust integer;
  v_timezone text:='UTC';
begin
  if p_user_id is null or p_character_instance_id is null or nullif(btrim(p_source_id),'') is null
    or coalesce(p_confidence,0)<.8 or not coalesce(p_apology,false)
    or (not coalesce(p_accountability,false) and not coalesce(p_corrective_action,false)) then
    return jsonb_build_object('applied',false,'reason','insufficient_repair');
  end if;
  select instance.continuity_id into v_continuity_id from public.together_character_instances instance
  where instance.id=p_character_instance_id and instance.user_id=p_user_id;
  if v_continuity_id is null then return jsonb_build_object('applied',false,'reason','relationship_not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-trust:'||p_character_instance_id::text,0));
  select evidence.id into v_existing_id from public.together_relationship_evidence evidence
  where evidence.character_instance_id=p_character_instance_id and evidence.evidence_type='trust_repair'
    and evidence.source_type='message' and evidence.source_id=btrim(p_source_id) limit 1;
  if v_existing_id is not null then return jsonb_build_object('applied',false,'reason','duplicate','evidenceId',v_existing_id); end if;

  select evidence.* into v_target from public.together_relationship_evidence evidence
  where evidence.user_id=p_user_id and evidence.character_instance_id=p_character_instance_id
    and evidence.evidence_type='trust_consequence'
    and coalesce((evidence.metadata->>'repairable')::boolean,true)
    and coalesce(evidence.metadata->>'repairStatus','open')='open'
    and coalesce((evidence.metadata->>'appliedTrustDelta')::integer,0)<0
  order by evidence.occurred_at desc limit 1;
  if v_target.id is null then return jsonb_build_object('applied',false,'reason','nothing_to_repair'); end if;

  v_lost:=abs((v_target.metadata->>'appliedTrustDelta')::integer);
  v_factor:=case when p_accountability and p_corrective_action then .65 when p_corrective_action then .5 else .4 end;
  v_restore:=least(4,v_lost,greatest(1,round(v_lost*v_factor)::integer));
  select coalesce((select profile.experience_timezone from public.together_profiles profile where profile.user_id=p_user_id limit 1),'UTC') into v_timezone;
  insert into public.together_relationship_evidence(
    user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata
  ) values(
    p_user_id,v_continuity_id,p_character_instance_id,'trust_repair',least(1,greatest(0,p_confidence)),v_restore::numeric/10,
    'message',btrim(p_source_id),coalesce(p_occurred_at,now()),public.kivelle_relationship_local_date(coalesce(p_occurred_at,now()),v_timezone),
    jsonb_build_object('targetEvidenceId',v_target.id,'apology',p_apology,'accountability',p_accountability,
      'correctiveAction',p_corrective_action,'reasonCode',left(coalesce(nullif(btrim(p_reason_code),''),'repair_attempt'),80),
      'restoredTrust',v_restore,'ruleVersion','trust_consequences_v2')
  ) returning id into v_evidence_id;
  update public.together_relationship_evidence set metadata=metadata||jsonb_build_object(
    'repairStatus',case when v_restore>=v_lost then 'repaired' else 'partial' end,'repairedBy',v_evidence_id,'restoredTrust',v_restore
  ) where id=v_target.id;
  update public.together_relationship_states relationship set
    trust=least(100,relationship.trust+v_restore),conflict=greatest(0,relationship.conflict-greatest(1,v_restore)),
    last_relationship_delta=coalesce(relationship.last_relationship_delta,'{}'::jsonb)||jsonb_build_object('trust',v_restore,'conflict',-greatest(1,v_restore)),
    recent_direction='repairing',last_repair_completed_at=coalesce(p_occurred_at,now()),updated_at=coalesce(p_occurred_at,now())
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id
  returning relationship.trust into v_new_trust;
  return jsonb_build_object('applied',true,'reason','repair_applied','evidenceId',v_evidence_id,
    'targetEvidenceId',v_target.id,'trustDelta',v_restore,'trust',v_new_trust);
end $$;

revoke all on function public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamptz) to service_role;
revoke all on function public.kivelle_apply_trust_repair_v2(uuid,uuid,text,numeric,boolean,boolean,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_apply_trust_repair_v2(uuid,uuid,text,numeric,boolean,boolean,boolean,text,timestamptz) to service_role;

comment on function public.kivelle_apply_trust_consequence_v2 is 'Atomically records and applies one bounded, idempotent, high-confidence trust consequence without storing message content.';
comment on function public.kivelle_apply_trust_repair_v2 is 'Applies one evidence-backed partial repair to the latest open trust consequence; repeated apologies cannot farm trust.';

commit;
