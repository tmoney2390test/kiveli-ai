begin;

-- Relationship Engine V2: metrics describe feeling; evidence describes lived history;
-- stage changes only through explicit server-owned narrative milestones.
alter table public.together_relationship_states
  add column if not exists stage_entered_at timestamptz,
  add column if not exists dating_started_at timestamptz,
  add column if not exists exclusive_at timestamptz,
  add column if not exists long_term_at timestamptz,
  add column if not exists romance_path_status text not null default 'open',
  add column if not exists relationship_health_cache text not null default 'steady',
  add column if not exists evidence_summary_cache jsonb not null default '{}'::jsonb,
  add column if not exists last_major_milestone_at timestamptz,
  add column if not exists next_milestone_kind text,
  add column if not exists next_milestone_eligible_at timestamptz,
  add column if not exists next_milestone_presentable boolean not null default false,
  add column if not exists relationship_defining_date_session_id uuid references public.together_date_sessions(id) on delete set null,
  add column if not exists dating_invitation_accepted_at timestamptz,
  add column if not exists major_conflict_started_at timestamptz,
  add column if not exists last_repair_completed_at timestamptz;

alter table public.together_relationship_states drop constraint if exists together_relationship_states_romance_path_status_check;
alter table public.together_relationship_states add constraint together_relationship_states_romance_path_status_check check(romance_path_status in('open','friends_only'));
alter table public.together_relationship_states drop constraint if exists together_relationship_states_relationship_health_cache_check;
alter table public.together_relationship_states add constraint together_relationship_states_relationship_health_cache_check check(relationship_health_cache in('strained','uncertain','steady','warm','close'));

update public.together_relationship_states relationship set
  stage_entered_at=coalesce(relationship.stage_entered_at,instance.updated_at,instance.created_at,now()),
  dating_started_at=case when instance.relationship_stage in('dating','exclusive','long_term') then coalesce(relationship.dating_started_at,instance.updated_at,instance.created_at,now()) else relationship.dating_started_at end,
  exclusive_at=case when instance.relationship_stage in('exclusive','long_term') then coalesce(relationship.exclusive_at,instance.updated_at,instance.created_at,now()) else relationship.exclusive_at end,
  long_term_at=case when instance.relationship_stage='long_term' then coalesce(relationship.long_term_at,instance.updated_at,instance.created_at,now()) else relationship.long_term_at end
from public.together_character_instances instance where instance.id=relationship.character_instance_id;

alter table public.together_relationship_milestones drop constraint if exists together_relationship_milestones_kind_check;
alter table public.together_relationship_milestones add constraint together_relationship_milestones_kind_check check(kind in('keep_in_touch','friendship_deepened','romantic_spark','first_date_invitation','dating_start','exclusivity','long_term','repair'));

create table if not exists public.together_relationship_evidence(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  evidence_type text not null check(evidence_type in('meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment','commitment_kept','commitment_missed','repair_completed','future_planning')),
  quality numeric(5,4) not null default .5 check(quality between 0 and 1),
  valence numeric(5,4) not null default 0 check(valence between -1 and 1),
  source_type text not null check(source_type in('message','shared_plan','date_session','trip','moment','milestone','repair','migration')),
  source_id text not null,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(character_instance_id,evidence_type,source_type,source_id)
);
create index if not exists together_relationship_evidence_character_time_idx on public.together_relationship_evidence(character_instance_id,occurred_at desc);
create index if not exists together_relationship_evidence_character_type_idx on public.together_relationship_evidence(character_instance_id,evidence_type,occurred_at desc);
create index if not exists together_relationship_evidence_active_day_idx on public.together_relationship_evidence(character_instance_id,local_date);
alter table public.together_relationship_evidence enable row level security;
drop policy if exists together_relationship_evidence_own_read on public.together_relationship_evidence;
create policy together_relationship_evidence_own_read on public.together_relationship_evidence for select to authenticated using(user_id=auth.uid());
grant select on public.together_relationship_evidence to authenticated;

create or replace function public.kivelle_relationship_local_date(p_at timestamptz,p_timezone text default 'UTC') returns date language plpgsql immutable as $$
begin
  begin return (p_at at time zone coalesce(nullif(p_timezone,''),'UTC'))::date;
  exception when others then return (p_at at time zone 'UTC')::date;
  end;
end $$;

create or replace function public.kivelle_insert_relationship_evidence(
  p_user_id uuid,p_character_instance_id uuid,p_type text,p_source_type text,p_source_id text,
  p_occurred_at timestamptz default now(),p_quality numeric default .5,p_valence numeric default 0,p_timezone text default 'UTC',p_metadata jsonb default '{}'::jsonb
) returns public.together_relationship_evidence language plpgsql security definer set search_path=public as $$
declare continuity uuid; result public.together_relationship_evidence%rowtype;
begin
  select continuity_id into continuity from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id;
  if continuity is null then return result; end if;
  insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
  values(p_user_id,continuity,p_character_instance_id,p_type,greatest(0,least(1,coalesce(p_quality,.5))),greatest(-1,least(1,coalesce(p_valence,0))),p_source_type,p_source_id,coalesce(p_occurred_at,now()),public.kivelle_relationship_local_date(coalesce(p_occurred_at,now()),p_timezone),coalesce(p_metadata,'{}'::jsonb))
  on conflict(character_instance_id,evidence_type,source_type,source_id) do update set
    quality=greatest(public.together_relationship_evidence.quality,excluded.quality),valence=excluded.valence,
    occurred_at=least(public.together_relationship_evidence.occurred_at,excluded.occurred_at),metadata=public.together_relationship_evidence.metadata||excluded.metadata
  returning * into result;
  return result;
end $$;
revoke all on function public.kivelle_insert_relationship_evidence(uuid,uuid,text,text,text,timestamptz,numeric,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_insert_relationship_evidence(uuid,uuid,text,text,text,timestamptz,numeric,numeric,text,jsonb) to service_role;

create or replace function public.kivelle_relationship_progression_state(p_user_id uuid,p_character_instance_id uuid,p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  relationship public.together_relationship_states%rowtype; instance public.together_character_instances%rowtype; config jsonb; profile jsonb;
  stage text; pace text; romance_enabled boolean; friendship_days integer; exclusive_days integer; long_term_days integer;
  romance_trust integer; romance_comfort integer; exclusive_commitment integer; long_term_commitment integer;
  meaningful_count integer:=0; romantic_count integer:=0; active_days integer:=0; progression_interactions integer:=0; shared_count integer:=0; positive_dates integer:=0; trips_count integer:=0; moments_count integer:=0; kept_count integer:=0; missed_count integer:=0; repairs_count integer:=0; future_count integer:=0; unresolved_misses integer:=0; shared_after integer:=0; future_after integer:=0; repairs_after_conflict integer:=0;
  capped_conversations integer:=0; defining_completed boolean:=false; defining_positive boolean:=false; stage_start timestamptz; days_since_stage numeric:=0;
  health text:='steady'; candidate text:=null; to_stage text:=null; eligible boolean:=false; presentable boolean:=false; blockers text[]:='{}'; presentation_blockers text[]:='{}';
  active_commitment boolean:=false; companion_busy boolean:=false; poor_moment boolean:=false;
begin
  select * into relationship from public.together_relationship_states where user_id=p_user_id and character_instance_id=p_character_instance_id;
  select * into instance from public.together_character_instances where user_id=p_user_id and id=p_character_instance_id;
  if relationship.character_instance_id is null or instance.id is null then return jsonb_build_object('eligible',false,'presentable',false,'blockers',jsonb_build_array('relationship_unavailable')); end if;
  select coalesce(version.relationship_config,'{}'::jsonb) into config from public.together_character_versions version where version.id=instance.character_version_id;
  select coalesce(content_preferences,'{}'::jsonb) into profile from public.together_profiles where user_id=p_user_id;
  stage:=instance.relationship_stage;pace:=coalesce(nullif(config->>'pace',''),'balanced');if pace not in('slow','balanced','fast') then pace:='balanced'; end if;
  romance_enabled:=coalesce((profile->>'romanceEnabled')::boolean,true);
  friendship_days:=case pace when 'fast' then 1 when 'slow' then 3 else 2 end;
  exclusive_days:=case pace when 'fast' then 2 when 'slow' then 5 else 3 end;
  long_term_days:=case pace when 'fast' then 5 when 'slow' then 10 else 7 end;
  romance_trust:=round(14+(coalesce((config->>'needsTrustBeforeRomance')::numeric,.5)-.5)*8);
  romance_comfort:=round(18+(coalesce((config->>'needsTrustBeforeRomance')::numeric,.5)-.5)*6);
  exclusive_commitment:=round(28+(coalesce((config->>'needsComfortBeforeCommitment')::numeric,.5)-.5)*8-(coalesce((config->>'exclusivityPreference')::numeric,.5)-.5)*6);
  long_term_commitment:=round(50+(coalesce((config->>'needsComfortBeforeCommitment')::numeric,.5)-.5)*8-(coalesce((config->>'longTermOrientation')::numeric,.5)-.5)*8);

  select
    count(*) filter(where evidence_type='meaningful_conversation'),
    count(*) filter(where evidence_type='romantic_signal'),
    count(distinct local_date) filter(where evidence_type in('meaningful_conversation','shared_plan_completed','date_completed','trip_completed','major_shared_moment','repair_completed')),
    count(*) filter(where evidence_type in('shared_plan_completed','date_completed','trip_completed','major_shared_moment')),
    count(*) filter(where evidence_type='date_completed' and valence>=0),
    count(*) filter(where evidence_type='trip_completed'),
    count(*) filter(where evidence_type='major_shared_moment'),
    count(*) filter(where evidence_type='commitment_kept'),
    count(*) filter(where evidence_type='commitment_missed'),
    count(*) filter(where evidence_type='repair_completed'),
    count(*) filter(where evidence_type='future_planning')
  into meaningful_count,romantic_count,active_days,shared_count,positive_dates,trips_count,moments_count,kept_count,missed_count,repairs_count,future_count
  from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id;

  select coalesce(sum(least(2,day_count)),0)::integer into capped_conversations from(
    select local_date,count(*)::integer day_count from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id and evidence_type='meaningful_conversation' group by local_date
  ) day_counts;
  progression_interactions:=capped_conversations+shared_count+repairs_count;
  select count(*) into unresolved_misses from public.together_missed_plan_resolutions where user_id=p_user_id and character_instance_id=p_character_instance_id and status in('awaiting_explanation','explained','unresolved');

  stage_start:=case stage when 'dating' then coalesce(relationship.dating_started_at,relationship.stage_entered_at) when 'exclusive' then coalesce(relationship.exclusive_at,relationship.stage_entered_at) when 'long_term' then coalesce(relationship.long_term_at,relationship.stage_entered_at) else relationship.stage_entered_at end;
  if stage_start is not null then
    days_since_stage:=greatest(0,extract(epoch from(p_now-stage_start))/86400);
    select count(*) into shared_after from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id and occurred_at>=stage_start and evidence_type in('shared_plan_completed','date_completed','trip_completed','major_shared_moment') and valence>=-.1;
    select count(*) into future_after from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id and occurred_at>=stage_start and evidence_type='future_planning';
  end if;
  if relationship.major_conflict_started_at is not null then select count(*) into repairs_after_conflict from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id and occurred_at>=relationship.major_conflict_started_at and evidence_type='repair_completed'; end if;
  if relationship.relationship_defining_date_session_id is not null then
    select exists(select 1 from public.together_date_sessions where id=relationship.relationship_defining_date_session_id and user_id=p_user_id and character_instance_id=p_character_instance_id and status='completed') into defining_completed;
    select exists(select 1 from public.together_relationship_evidence where user_id=p_user_id and character_instance_id=p_character_instance_id and evidence_type='date_completed' and source_type='date_session' and source_id=relationship.relationship_defining_date_session_id::text and valence>=-.1) into defining_positive;
  end if;

  health:=case when relationship.active_major_conflict or relationship.conflict>45 or unresolved_misses>0 then 'strained' when relationship.conflict>25 or relationship.trust<25 or relationship.respect<25 then 'uncertain' when relationship.trust>=60 and relationship.comfort>=55 and relationship.respect>=50 and relationship.conflict<20 then 'close' when relationship.trust>=35 and relationship.comfort>=30 and relationship.conflict<30 then 'warm' else 'steady' end;

  if relationship.active_major_conflict or relationship.conflict>45 then candidate:='repair';
  elsif stage='stranger' then candidate:='keep_in_touch';if progression_interactions<1 then blockers:=array_append(blockers,'needs_meaningful_interaction');end if;
  elsif stage='acquaintance' then candidate:='friendship_deepened';if relationship.trust<14 then blockers:=array_append(blockers,'needs_more_trust');end if;if relationship.familiarity<15 then blockers:=array_append(blockers,'needs_more_familiarity');end if;if progression_interactions<3 then blockers:=array_append(blockers,'needs_more_shared_history');end if;if active_days<friendship_days then blockers:=array_append(blockers,'needs_more_time');end if;
  elsif stage='friend' then
    if not romance_enabled or relationship.romance_path_status='friends_only' then candidate:=null;
    else candidate:='romantic_spark';if relationship.trust<romance_trust then blockers:=array_append(blockers,'needs_more_trust');end if;if relationship.attraction<18 then blockers:=array_append(blockers,'needs_more_attraction');end if;if relationship.comfort<romance_comfort then blockers:=array_append(blockers,'needs_more_comfort');end if;if romantic_count<2 and positive_dates<1 then blockers:=array_append(blockers,'needs_mutual_romantic_signal');end if;end if;
  elsif stage='flirting' then
    if not romance_enabled or relationship.romance_path_status='friends_only' then candidate:=null;
    elsif relationship.relationship_defining_date_session_id is not null then candidate:='dating_start';if not defining_completed then blockers:=array_append(blockers,'relationship_defining_date_not_completed');end if;if defining_completed and not defining_positive then blockers:=array_append(blockers,'date_needs_repair');end if;
    else candidate:='first_date_invitation';if relationship.familiarity<28 then blockers:=array_append(blockers,'needs_more_familiarity');end if;if relationship.trust<24 then blockers:=array_append(blockers,'needs_more_trust');end if;if relationship.attraction<22 then blockers:=array_append(blockers,'needs_more_attraction');end if;if progression_interactions<5 then blockers:=array_append(blockers,'needs_more_shared_history');end if;end if;
  elsif stage='dating' then candidate:='exclusivity';if relationship.trust<42 then blockers:=array_append(blockers,'needs_more_trust');end if;if relationship.comfort<40 then blockers:=array_append(blockers,'needs_more_comfort');end if;if relationship.romantic_interest<40 then blockers:=array_append(blockers,'needs_more_romantic_interest');end if;if relationship.commitment<exclusive_commitment then blockers:=array_append(blockers,'needs_more_commitment');end if;if relationship.respect<35 then blockers:=array_append(blockers,'needs_more_respect');end if;if relationship.conflict>35 or relationship.active_major_conflict then blockers:=array_append(blockers,'active_conflict');end if;if unresolved_misses>0 then blockers:=array_append(blockers,'unresolved_missed_commitment');end if;if days_since_stage<exclusive_days then blockers:=array_append(blockers,'needs_more_time');end if;if shared_after<2 then blockers:=array_append(blockers,'needs_more_shared_experiences');end if;
  elsif stage='exclusive' then candidate:='long_term';if relationship.trust<58 then blockers:=array_append(blockers,'needs_more_trust');end if;if relationship.comfort<55 then blockers:=array_append(blockers,'needs_more_comfort');end if;if relationship.respect<50 then blockers:=array_append(blockers,'needs_more_respect');end if;if relationship.commitment<long_term_commitment then blockers:=array_append(blockers,'needs_more_commitment');end if;if relationship.conflict>30 or relationship.active_major_conflict then blockers:=array_append(blockers,'active_conflict');end if;if unresolved_misses>0 then blockers:=array_append(blockers,'unresolved_missed_commitment');end if;if days_since_stage<long_term_days then blockers:=array_append(blockers,'needs_more_time');end if;if shared_after<3 then blockers:=array_append(blockers,'needs_more_shared_experiences');end if;if future_after<1 then blockers:=array_append(blockers,'needs_future_planning');end if;if relationship.major_conflict_started_at is not null and relationship.major_conflict_started_at>=coalesce(relationship.exclusive_at,relationship.stage_entered_at,'epoch'::timestamptz) and repairs_after_conflict<1 then blockers:=array_append(blockers,'needs_conflict_repair');end if;
  end if;
  eligible:=candidate is not null and coalesce(array_length(blockers,1),0)=0;
  to_stage:=case candidate when 'keep_in_touch' then 'acquaintance' when 'friendship_deepened' then 'friend' when 'romantic_spark' then 'flirting' when 'dating_start' then 'dating' when 'exclusivity' then 'exclusive' when 'long_term' then 'long_term' else null end;

  if eligible then
    select exists(select 1 from public.together_shared_plans where user_id=p_user_id and character_instance_id=p_character_instance_id and status='active') into active_commitment;
    companion_busy:=instance.current_activity~*'\m(sleep|working|client|meeting|commut|driving|running late|waiting for you|getting ready)';
    poor_moment:=candidate<>'repair' and instance.current_energy='low' and instance.current_mood~*'\m(stress|upset|angry|overwhelmed|exhaust|tired)';
    if active_commitment then presentation_blockers:=array_append(presentation_blockers,'active_commitment');end if;
    if unresolved_misses>0 and candidate<>'repair' then presentation_blockers:=array_append(presentation_blockers,'unresolved_missed_commitment');end if;
    if companion_busy then presentation_blockers:=array_append(presentation_blockers,'companion_busy');end if;
    if poor_moment then presentation_blockers:=array_append(presentation_blockers,'poor_moment');end if;
    if relationship.last_major_milestone_at is not null and relationship.last_major_milestone_at>p_now-interval '6 hours' then presentation_blockers:=array_append(presentation_blockers,'milestone_cooldown');end if;
  end if;
  presentable:=eligible and coalesce(array_length(presentation_blockers,1),0)=0;

  return jsonb_build_object(
    'stage',stage,'health',health,'kind',candidate,'toStage',to_stage,'eligible',eligible,'presentable',presentable,
    'blockers',to_jsonb(blockers||presentation_blockers),
    'evidence',jsonb_build_object('meaningfulConversations',meaningful_count,'romanticSignals',romantic_count,'distinctActiveDays',active_days,'progressionInteractions',progression_interactions,'sharedExperiences',shared_count,'positiveDates',positive_dates,'completedTrips',trips_count,'majorSharedMoments',moments_count,'commitmentsKept',kept_count,'commitmentsMissed',missed_count,'repairsCompleted',repairs_count,'futurePlanning',future_count,'unresolvedMisses',unresolved_misses,'sharedExperiencesAfterStage',shared_after,'futurePlanningAfterStage',future_after,'repairsAfterMajorConflict',repairs_after_conflict,'definingDateCompleted',defining_completed,'definingDatePositive',defining_positive),
    'pacing',jsonb_build_object('pace',pace,'friendshipDays',friendship_days,'exclusiveDays',exclusive_days,'longTermDays',long_term_days,'exclusiveCommitment',exclusive_commitment,'longTermCommitment',long_term_commitment)
  );
end $$;
revoke all on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) to service_role;

create or replace function public.kivelle_evaluate_relationship_progression(p_user_id uuid,p_character_instance_id uuid,p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$
declare state jsonb; kind text; stage text; to_stage text; eligibility_key text; companion_name text; title text; body text; prompt text; choices jsonb; existing public.together_relationship_milestones%rowtype; date_template public.together_date_templates%rowtype; date_session_id uuid; current_world uuid; relationship public.together_relationship_states%rowtype;
begin
  state:=public.kivelle_relationship_progression_state(p_user_id,p_character_instance_id,p_now);kind:=state->>'kind';stage:=state->>'stage';to_stage:=state->>'toStage';
  update public.together_relationship_states set relationship_health_cache=coalesce(state->>'health','steady'),evidence_summary_cache=coalesce(state->'evidence','{}'::jsonb),next_milestone_kind=kind,next_milestone_eligible_at=case when coalesce((state->>'eligible')::boolean,false) then coalesce(next_milestone_eligible_at,p_now) else null end,next_milestone_presentable=coalesce((state->>'presentable')::boolean,false),updated_at=greatest(updated_at,p_now) where user_id=p_user_id and character_instance_id=p_character_instance_id;
  if kind is null or not coalesce((state->>'eligible')::boolean,false) or not coalesce((state->>'presentable')::boolean,false) then return state; end if;
  if exists(select 1 from public.together_relationship_milestones where user_id=p_user_id and character_instance_id=p_character_instance_id and status='pending') then return state; end if;
  select * into relationship from public.together_relationship_states where user_id=p_user_id and character_instance_id=p_character_instance_id;
  eligibility_key:=case when kind='repair' then 'repair:'||stage||':'||coalesce(relationship.major_conflict_started_at::date,p_now::date)::text else kind||':'||stage end;
  select * into existing from public.together_relationship_milestones where user_id=p_user_id and character_instance_id=p_character_instance_id and eligibility_key=eligibility_key;
  if existing.id is not null and existing.status in('accepted','declined','completed') then return state; end if;
  if existing.id is not null and existing.status='deferred' and existing.deferred_until is not null and existing.deferred_until>p_now then return state; end if;
  select template.name into companion_name from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id where instance.id=p_character_instance_id and instance.user_id=p_user_id;

  if kind='first_date_invitation' then
    select location.world_id into current_world from public.together_character_instances instance join public.together_locations location on location.id=instance.current_location_id where instance.id=p_character_instance_id and instance.user_id=p_user_id;
    select template.* into date_template from public.together_date_templates template
    left join public.together_date_sessions session on session.date_template_id=template.id and session.user_id=p_user_id and session.character_instance_id=p_character_instance_id
    where template.active=true and (current_world is null or template.world_id=current_world)
      and (session.id is null or session.status in('locked','deferred'))
      and (jsonb_array_length(coalesce(template.unlock_rules->'allowed_stages','[]'::jsonb))=0 or (template.unlock_rules->'allowed_stages') ? stage)
      and relationship.familiarity>=coalesce((template.unlock_rules->>'familiarity')::integer,0)
      and relationship.trust>=coalesce((template.unlock_rules->>'trust')::integer,0)
      and relationship.attraction>=coalesce((template.unlock_rules->>'attraction')::integer,0)
      and relationship.comfort>=coalesce((template.unlock_rules->>'comfort')::integer,0)
      and (not coalesce((template.unlock_rules->>'no_major_conflict')::boolean,false) or not relationship.active_major_conflict)
    order by template.created_at limit 1;
    if date_template.id is null then
      update public.together_relationship_states set next_milestone_presentable=false,evidence_summary_cache=evidence_summary_cache||jsonb_build_object('presentationBlocker','no_date_available') where character_instance_id=p_character_instance_id;
      return state||jsonb_build_object('presentable',false,'blockers',coalesce(state->'blockers','[]'::jsonb)||jsonb_build_array('no_date_available'));
    end if;
    select id into date_session_id from public.together_date_sessions where user_id=p_user_id and character_instance_id=p_character_instance_id and date_template_id=date_template.id;
    if date_session_id is null then insert into public.together_date_sessions(user_id,character_instance_id,date_template_id,status) values(p_user_id,p_character_instance_id,date_template.id,'locked') returning id into date_session_id; end if;
  end if;

  title:=case kind when 'keep_in_touch' then 'Keep in touch?' when 'friendship_deepened' then 'This is becoming real' when 'romantic_spark' then 'There’s a spark here' when 'first_date_invitation' then coalesce(date_template.name,'Spend time together?') when 'dating_start' then 'Do this again?' when 'exclusivity' then 'What are we doing here?' when 'long_term' then 'This has become part of my life' else 'Something feels unresolved' end;
  body:=case kind when 'keep_in_touch' then 'The moment is ending, but '||coalesce(companion_name,'your companion')||' makes it clear they would like to keep talking.' when 'friendship_deepened' then 'Time together has started to feel less like chance meetings and more like an actual friendship.' when 'romantic_spark' then 'A warm moment lingers, leaving room to decide whether this stays friendship or becomes something more.' when 'first_date_invitation' then coalesce(companion_name,'Your companion')||' is ready to turn the connection into a real shared Date.' when 'dating_start' then 'The Date mattered. '||coalesce(companion_name,'Your companion')||' would like to keep seeing you this way.' when 'exclusivity' then coalesce(companion_name,'Your companion')||' is ready to talk about choosing each other intentionally.' when 'long_term' then 'Your shared history has become steady enough to talk about this as a serious continuing partnership.' else coalesce(companion_name,'Your companion')||' would rather address the tension honestly than pretend it is not there.' end;
  prompt:=case kind when 'repair' then 'How do you want to handle it?' when 'exclusivity' then 'Where do you want this relationship to go?' when 'long_term' then 'Do you want to name what this has become?' else 'How do you meet the moment?' end;
  choices:=case kind when 'repair' then '[{"id":"talk_it_out","label":"Talk it out","tone":"primary"},{"id":"give_space","label":"Give them some space","tone":"secondary"}]'::jsonb when 'romantic_spark' then '[{"id":"accept","label":"Lean into the spark","tone":"primary"},{"id":"stay_friends","label":"Keep this as friendship","tone":"secondary"},{"id":"defer","label":"Not yet","tone":"secondary"}]'::jsonb when 'dating_start' then '[{"id":"accept","label":"I’d like that","tone":"primary"},{"id":"defer","label":"Let’s take it slowly","tone":"secondary"},{"id":"stay_friends","label":"I’d rather stay friends","tone":"secondary"}]'::jsonb when 'exclusivity' then '[{"id":"accept","label":"I want us to be exclusive","tone":"primary"},{"id":"defer","label":"I’m not ready yet","tone":"secondary"}]'::jsonb when 'long_term' then '[{"id":"accept","label":"I feel that too","tone":"primary"},{"id":"defer","label":"Let’s keep growing into it","tone":"secondary"}]'::jsonb when 'first_date_invitation' then '[{"id":"accept","label":"Yes—let’s do it","tone":"primary"},{"id":"defer","label":"Ask me again later","tone":"secondary"}]'::jsonb when 'keep_in_touch' then '[{"id":"accept","label":"I’d like that","tone":"primary"},{"id":"defer","label":"Let’s take it slowly","tone":"secondary"}]'::jsonb else '[{"id":"accept","label":"I feel it too","tone":"primary"},{"id":"defer","label":"Keep getting to know each other","tone":"secondary"}]'::jsonb end;

  if existing.id is not null and existing.status='deferred' then
    update public.together_relationship_milestones set status='pending',chosen_action=null,deferred_until=null,resolved_at=null,title=title,body=body,prompt=prompt,choices=choices,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('engine','relationship_v2','evidence',state->'evidence'),updated_at=p_now where id=existing.id;
  else
    insert into public.together_relationship_milestones(user_id,character_instance_id,kind,from_stage,to_stage,eligibility_key,title,body,prompt,choices,metadata)
    values(p_user_id,p_character_instance_id,kind,stage,to_stage,eligibility_key,title,body,prompt,choices,jsonb_strip_nulls(jsonb_build_object('engine','relationship_v2','presentation_key','relationship.'||kind,'evidence',state->'evidence','date_template_id',date_template.id,'date_session_id',date_session_id)));
  end if;
  insert into public.together_analytics_events(user_id,event_name,properties) values(p_user_id,'relationship_milestone_created',jsonb_build_object('characterInstanceId',p_character_instance_id,'kind',kind,'engine','relationship_v2'));
  return state;
end $$;
revoke all on function public.kivelle_evaluate_relationship_progression(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_evaluate_relationship_progression(uuid,uuid,timestamptz) to service_role;

-- Reject legacy/LLM milestone inserts unless the canonical V2 evaluator agrees that
-- the milestone is eligible and the current life moment is appropriate.
create or replace function public.kivelle_guard_relationship_milestone_insert() returns trigger language plpgsql security definer set search_path=public as $$
declare state jsonb;
begin
  state:=public.kivelle_relationship_progression_state(new.user_id,new.character_instance_id,now());
  if coalesce(state->>'kind','')<>new.kind or not coalesce((state->>'eligible')::boolean,false) or not coalesce((state->>'presentable')::boolean,false) then raise exception 'relationship milestone is not canonically eligible or presentable'; end if;
  return new;
end $$;
drop trigger if exists together_relationship_milestone_v2_guard on public.together_relationship_milestones;
create trigger together_relationship_milestone_v2_guard before insert on public.together_relationship_milestones for each row execute function public.kivelle_guard_relationship_milestone_insert();

-- Stage timestamps are canonical and independent of metric changes.
create or replace function public.kivelle_stamp_relationship_stage() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.relationship_stage is distinct from old.relationship_stage then
    update public.together_relationship_states set stage_entered_at=now(),dating_started_at=case when new.relationship_stage='dating' then coalesce(dating_started_at,now()) else dating_started_at end,exclusive_at=case when new.relationship_stage='exclusive' then coalesce(exclusive_at,now()) else exclusive_at end,long_term_at=case when new.relationship_stage='long_term' then coalesce(long_term_at,now()) else long_term_at end,next_milestone_kind=null,next_milestone_eligible_at=null,next_milestone_presentable=false,updated_at=now() where user_id=new.user_id and character_instance_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists together_character_relationship_stage_stamp on public.together_character_instances;
create trigger together_character_relationship_stage_stamp after update of relationship_stage on public.together_character_instances for each row execute function public.kivelle_stamp_relationship_stage();

create or replace function public.kivelle_track_major_relationship_conflict() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.active_major_conflict or new.conflict>45) and not(coalesce(old.active_major_conflict,false) or coalesce(old.conflict,0)>45) then new.major_conflict_started_at:=now(); end if;
  return new;
end $$;
drop trigger if exists together_relationship_major_conflict_stamp on public.together_relationship_states;
create trigger together_relationship_major_conflict_stamp before update of conflict,active_major_conflict on public.together_relationship_states for each row execute function public.kivelle_track_major_relationship_conflict();

-- Milestone resolution owns explicit relationship declarations and romance-path choices.
create or replace function public.kivelle_relationship_milestone_resolution_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare date_session uuid; timezone text:='UTC';
begin
  if old.status='pending' and new.status in('accepted','declined','completed') then
    update public.together_relationship_states set last_major_milestone_at=now(),next_milestone_kind=null,next_milestone_eligible_at=null,next_milestone_presentable=false,updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;
  end if;
  if new.kind in('romantic_spark','dating_start') and new.chosen_action='stay_friends' and old.status='pending' then
    update public.together_relationship_states set romance_path_status='friends_only',updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;
    if new.kind='dating_start' then update public.together_character_instances set relationship_stage='friend',updated_at=now() where id=new.character_instance_id and user_id=new.user_id and relationship_stage='flirting'; end if;
  elsif new.kind='romantic_spark' and new.chosen_action='accept' and old.status='pending' then update public.together_relationship_states set romance_path_status='open',updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;
  end if;
  if new.kind='first_date_invitation' and new.chosen_action='accept' and old.status='pending' then
    date_session:=nullif(new.metadata->>'date_session_id','')::uuid;
    if date_session is null then select id into date_session from public.together_date_sessions where user_id=new.user_id and character_instance_id=new.character_instance_id and date_template_id=nullif(new.metadata->>'date_template_id','')::uuid order by created_at limit 1; end if;
    if date_session is not null then update public.together_relationship_states set relationship_defining_date_session_id=date_session,dating_invitation_accepted_at=now(),updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id; end if;
  end if;
  if new.kind='repair' and new.chosen_action='talk_it_out' and old.status='pending' and new.status='accepted' then
    select coalesce(profile.experience_timezone,'UTC') into timezone from public.together_profiles profile where profile.user_id=new.user_id;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'repair_completed','milestone',new.id::text,now(),.9,.7,timezone,jsonb_build_object('milestoneKind','repair'));
    update public.together_relationship_states set last_repair_completed_at=now(),updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_milestone_resolution_v2 on public.together_relationship_milestones;
create trigger together_relationship_milestone_resolution_v2 after update of status,chosen_action on public.together_relationship_milestones for each row execute function public.kivelle_relationship_milestone_resolution_v2();

-- Conversation evidence: at most two meaningful-conversation records per local day
-- count toward progression in the evaluator, so message spam cannot speed-run stages.
create or replace function public.kivelle_message_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare timezone text:='UTC'; conversation_kind text; meaningful boolean:=false; romantic boolean:=false; future boolean:=false; current_path text;
begin
  if new.role<>'user' then return new; end if;
  select coalesce(experience_timezone,'UTC') into timezone from public.together_profiles where user_id=new.user_id;
  select kind into conversation_kind from public.together_conversations where id=new.conversation_id;
  meaningful:=char_length(btrim(new.content))>=80 or new.content~*'\m(i feel|i am worried|i''m worried|i''m scared|i am scared|i need to tell you|i''ve never told|thank you for|i was wrong|i''m sorry|my family|my daughter|my son|my dream|my goal|i care about)\M' or (conversation_kind='first_meeting' and char_length(btrim(new.content))>=12);
  romantic:=new.content~*'\m(flirt|kiss|date|romantic|attracted|beautiful|gorgeous|crush|love you|more than friends|feel something|into you)\M';
  future:=new.content~*'\m(our future|someday|next month|next year|holiday|vacation|trip together|travel together|move in|live together|future together|next season)\M';
  if meaningful then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'meaningful_conversation','message',new.id::text,new.created_at,.65,.25,timezone,jsonb_build_object('conversationId',new.conversation_id)); end if;
  if romantic then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'romantic_signal','message',new.id::text,new.created_at,.7,.5,timezone,jsonb_build_object('conversationId',new.conversation_id)); end if;
  if future then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'future_planning','message',new.id::text,new.created_at,.7,.45,timezone,jsonb_build_object('conversationId',new.conversation_id)); end if;
  select romance_path_status into current_path from public.together_relationship_states where user_id=new.user_id and character_instance_id=new.character_instance_id;
  if current_path='friends_only' and new.content~*'(changed my mind|more than friends|want to date|give us a chance|try dating|romantic chance|I want us)' then update public.together_relationship_states set romance_path_status='open',updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id; end if;
  return new;
end $$;

-- Shared commitments create stronger evidence than chat. A scheduled plan more than
-- a day out is future-planning evidence; successful attendance becomes kept history.
create or replace function public.kivelle_plan_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare timezone text; significance numeric;
begin
  timezone:=coalesce(new.world_timezone,'UTC');significance:=greatest(0,least(1,coalesce((new.metadata->>'significance')::numeric,.5)));
  if new.status='scheduled' and new.starts_at is not null and new.starts_at>now()+interval '24 hours' and (tg_op='INSERT' or old.status is distinct from new.status or old.starts_at is distinct from new.starts_at) then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'future_planning','shared_plan',new.id::text,now(),.65,.4,timezone,jsonb_build_object('title',new.title,'startsAt',new.starts_at)); end if;
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'commitment_kept','shared_plan',new.id::text,coalesce(new.completed_at,now()),greatest(.6,significance),.6,timezone,jsonb_build_object('title',new.title));
    if new.activity_key='trip' or new.metadata ? 'tripId' then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'trip_completed','trip',coalesce(new.metadata->>'tripId',new.id::text),coalesce(new.completed_at,now()),greatest(.85,significance),.75,timezone,jsonb_build_object('planId',new.id,'title',new.title));
    elsif new.source<>'date' then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'shared_plan_completed','shared_plan',new.id::text,coalesce(new.completed_at,now()),greatest(.65,significance),.55,timezone,jsonb_build_object('title',new.title)); end if;
  elsif new.status='missed' and (tg_op='INSERT' or old.status is distinct from 'missed') then perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'commitment_missed','shared_plan',new.id::text,coalesce(new.missed_at,now()),greatest(.65,significance),-.7,timezone,jsonb_build_object('title',new.title,'reason',new.miss_reason)); end if;
  perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());
  return new;
end $$;

create or replace function public.kivelle_date_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare raw numeric:=0; valence numeric:=0; timezone text:='UTC'; world_id uuid;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select coalesce(sum(coalesce((relationship_impact->>'trust')::numeric,0)+coalesce((relationship_impact->>'comfort')::numeric,0)+coalesce((relationship_impact->>'affinity')::numeric,0)+coalesce((relationship_impact->>'attraction')::numeric,0)+coalesce((relationship_impact->>'respect')::numeric,0)+coalesce((relationship_impact->>'romantic_interest')::numeric,0)+coalesce((relationship_impact->>'commitment')::numeric,0)-coalesce((relationship_impact->>'conflict')::numeric,0)),0) into raw from public.together_date_choices where date_session_id=new.id and user_id=new.user_id;
    valence:=greatest(-1,least(1,raw/12));
    select template.world_id into world_id from public.together_date_templates template where template.id=new.date_template_id;
    select coalesce(world.timezone,'UTC') into timezone from public.together_worlds world where world.id=world_id;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'date_completed','date_session',new.id::text,coalesce(new.completed_at,now()),.9,valence,timezone,jsonb_build_object('dateTemplateId',new.date_template_id,'relationshipDefining',exists(select 1 from public.together_relationship_states relationship where relationship.character_instance_id=new.character_instance_id and relationship.relationship_defining_date_session_id=new.id)));
  end if;
  return new;
end $$;

create or replace function public.kivelle_moment_relationship_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare timezone text:='UTC'; world_id uuid;
begin
  if new.moment_type not in('date','shared_plan') then
    if new.location_id is not null then select location.world_id into world_id from public.together_locations location where location.id=new.location_id;select coalesce(world.timezone,'UTC') into timezone from public.together_worlds world where world.id=world_id; end if;
    perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'major_shared_moment','moment',new.id::text,new.occurred_at,.8,.55,timezone,jsonb_build_object('momentType',new.moment_type,'title',new.title));
  end if;
  return new;
end $$;

create or replace function public.kivelle_repaired_miss_evidence_v2() returns trigger language plpgsql security definer set search_path=public as $$
declare timezone text:='UTC';
begin
  if new.status='repaired' and old.status is distinct from 'repaired' then select coalesce(experience_timezone,'UTC') into timezone from public.together_profiles where user_id=new.user_id;perform public.kivelle_insert_relationship_evidence(new.user_id,new.character_instance_id,'repair_completed','repair',new.id::text,coalesce(new.resolved_at,now()),.9,.7,timezone,jsonb_build_object('planId',new.plan_id,'missReason',new.miss_reason));update public.together_relationship_states set last_repair_completed_at=coalesce(new.resolved_at,now()),updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;end if;return new;
end $$;

-- Backfill lived history before enabling automatic evaluation triggers.
insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select message.user_id,conversation.continuity_id,message.character_instance_id,'meaningful_conversation',.55,.2,'message',message.id::text,message.created_at,public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'conversationId',conversation.id)
from public.together_messages message join public.together_conversations conversation on conversation.id=message.conversation_id join public.together_profiles profile on profile.user_id=message.user_id
where message.role='user' and (char_length(btrim(message.content))>=80 or message.content~*'\m(i feel|i am worried|i''m worried|i''m scared|i am scared|i need to tell you|i''ve never told|thank you for|i was wrong|i''m sorry|my family|my daughter|my son|my dream|my goal|i care about)\M')
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select message.user_id,conversation.continuity_id,message.character_instance_id,'romantic_signal',.65,.45,'message',message.id::text,message.created_at,public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true)
from public.together_messages message join public.together_conversations conversation on conversation.id=message.conversation_id join public.together_profiles profile on profile.user_id=message.user_id
where message.role='user' and message.content~*'\m(flirt|kiss|date|romantic|attracted|beautiful|gorgeous|crush|love you|more than friends|feel something|into you)\M'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,'commitment_kept',greatest(.6,coalesce((plan.metadata->>'significance')::numeric,.5)),.6,'shared_plan',plan.id::text,coalesce(plan.completed_at,plan.ends_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.completed_at,plan.ends_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'title',plan.title)
from public.together_shared_plans plan where plan.status='completed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;
insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,case when plan.activity_key='trip' or plan.metadata ? 'tripId' then 'trip_completed' else 'shared_plan_completed' end,greatest(.65,coalesce((plan.metadata->>'significance')::numeric,.5)),.55,case when plan.activity_key='trip' or plan.metadata ? 'tripId' then 'trip' else 'shared_plan' end,case when plan.activity_key='trip' or plan.metadata ? 'tripId' then coalesce(plan.metadata->>'tripId',plan.id::text) else plan.id::text end,coalesce(plan.completed_at,plan.ends_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.completed_at,plan.ends_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'title',plan.title)
from public.together_shared_plans plan where plan.status='completed' and plan.source<>'date'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;
insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select plan.user_id,plan.continuity_id,plan.character_instance_id,'commitment_missed',.7,-.7,'shared_plan',plan.id::text,coalesce(plan.missed_at,plan.updated_at),public.kivelle_relationship_local_date(coalesce(plan.missed_at,plan.updated_at),coalesce(plan.world_timezone,'UTC')),jsonb_build_object('backfill',true,'reason',plan.miss_reason)
from public.together_shared_plans plan where plan.status='missed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select session.user_id,session.continuity_id,session.character_instance_id,'date_completed',.9,.4,'date_session',session.id::text,coalesce(session.completed_at,session.updated_at),public.kivelle_relationship_local_date(coalesce(session.completed_at,session.updated_at),coalesce(world.timezone,'UTC')),jsonb_build_object('backfill',true,'dateTemplateId',session.date_template_id)
from public.together_date_sessions session join public.together_date_templates template on template.id=session.date_template_id join public.together_worlds world on world.id=template.world_id where session.status='completed'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select moment.user_id,moment.continuity_id,moment.character_instance_id,'major_shared_moment',.8,.5,'moment',moment.id::text,moment.occurred_at,public.kivelle_relationship_local_date(moment.occurred_at,coalesce(world.timezone,profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'momentType',moment.moment_type)
from public.together_moments moment join public.together_profiles profile on profile.user_id=moment.user_id left join public.together_locations location on location.id=moment.location_id left join public.together_worlds world on world.id=location.world_id where moment.moment_type not in('date','shared_plan')
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

insert into public.together_relationship_evidence(user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,occurred_at,local_date,metadata)
select resolution.user_id,resolution.continuity_id,resolution.character_instance_id,'repair_completed',.9,.7,'repair',resolution.id::text,coalesce(resolution.resolved_at,resolution.updated_at),public.kivelle_relationship_local_date(coalesce(resolution.resolved_at,resolution.updated_at),coalesce(profile.experience_timezone,'UTC')),jsonb_build_object('backfill',true,'planId',resolution.plan_id)
from public.together_missed_plan_resolutions resolution join public.together_profiles profile on profile.user_id=resolution.user_id where resolution.status='repaired'
on conflict(character_instance_id,evidence_type,source_type,source_id) do nothing;

-- Dating is no longer a Date-template side effect. Any canonically designated first
-- Date can lead to the explicit dating_start milestone in any world.
update public.together_date_templates set metadata=metadata #- '{completion_effects,relationship_stage}',updated_at=now() where metadata #>> '{completion_effects,relationship_stage}' is not null;

-- Enable automatic evidence/evaluation after backfill is complete.
drop trigger if exists together_message_relationship_evidence_v2 on public.together_messages;
create trigger together_message_relationship_evidence_v2 after insert on public.together_messages for each row execute function public.kivelle_message_relationship_evidence_v2();
drop trigger if exists together_plan_relationship_evidence_v2 on public.together_shared_plans;
create trigger together_plan_relationship_evidence_v2 after insert or update of status,starts_at,completed_at,missed_at on public.together_shared_plans for each row execute function public.kivelle_plan_relationship_evidence_v2();
drop trigger if exists together_date_relationship_evidence_v2 on public.together_date_sessions;
create trigger together_date_relationship_evidence_v2 after update of status,completed_at on public.together_date_sessions for each row execute function public.kivelle_date_relationship_evidence_v2();
drop trigger if exists together_moment_relationship_evidence_v2 on public.together_moments;
create trigger together_moment_relationship_evidence_v2 after insert on public.together_moments for each row execute function public.kivelle_moment_relationship_evidence_v2();
drop trigger if exists together_repaired_miss_evidence_v2 on public.together_missed_plan_resolutions;
create trigger together_repaired_miss_evidence_v2 after update of status,resolved_at on public.together_missed_plan_resolutions for each row execute function public.kivelle_repaired_miss_evidence_v2();

create or replace function public.kivelle_relationship_state_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());return new;end $$;
drop trigger if exists together_relationship_state_recheck_v2 on public.together_relationship_states;
create trigger together_relationship_state_recheck_v2 after update of trust,comfort,attraction,affinity,familiarity,respect,conflict,romantic_interest,commitment,active_major_conflict,romance_path_status on public.together_relationship_states for each row execute function public.kivelle_relationship_state_recheck_v2();

create or replace function public.kivelle_character_relationship_moment_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.current_mood is distinct from old.current_mood or new.current_activity is distinct from old.current_activity or new.current_energy is distinct from old.current_energy then perform public.kivelle_evaluate_relationship_progression(new.user_id,new.id,now());end if;return new;end $$;
drop trigger if exists together_character_relationship_moment_recheck_v2 on public.together_character_instances;
create trigger together_character_relationship_moment_recheck_v2 after update of current_mood,current_activity,current_energy on public.together_character_instances for each row execute function public.kivelle_character_relationship_moment_recheck_v2();

-- Evidence insertions are the main progression clock. This trigger is intentionally
-- created after historical backfill to avoid repeated evaluation during migration.
create or replace function public.kivelle_relationship_evidence_recheck_v2() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.kivelle_evaluate_relationship_progression(new.user_id,new.character_instance_id,now());return new;end $$;
drop trigger if exists together_relationship_evidence_recheck_v2 on public.together_relationship_evidence;
create trigger together_relationship_evidence_recheck_v2 after insert or update of quality,valence,occurred_at on public.together_relationship_evidence for each row execute function public.kivelle_relationship_evidence_recheck_v2();

-- Existing relationships keep their current stage but immediately receive a V2 health/evidence cache.
do $$ declare row record; begin for row in select user_id,character_instance_id from public.together_relationship_states loop perform public.kivelle_evaluate_relationship_progression(row.user_id,row.character_instance_id,now()); end loop; end $$;

comment on table public.together_relationship_evidence is 'Canonical relationship-history ledger. Metrics describe feeling; evidence records what actually happened; explicit milestones own stage changes.';
comment on column public.together_relationship_states.relationship_health_cache is 'Derived health is separate from stage; an exclusive or long-term relationship can still be strained.';
comment on column public.together_relationship_states.relationship_defining_date_session_id is 'The accepted first-Date path. Completing this Date can create a dating_start milestone in any world.';
comment on column public.together_relationship_states.romance_path_status is 'Explicit romance-path choice. friends_only suppresses romantic milestones until the user clearly reopens the path.';

commit;
