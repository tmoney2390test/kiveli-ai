begin;

-- Commitment-adjacent life beats let normal life surfaces reflect getting ready,
-- travelling to the plan, and actually waiting rather than pretending the user arrived.
create or replace function public.kivelle_sync_commitment_life_beats() returns trigger language plpgsql security definer set search_path=public as $$
declare location_name text; waiting_event_id uuid; conversation_id uuid;
begin
  if new.starts_at is null then return new; end if;
  select name into location_name from public.together_locations where id=new.location_id;
  if new.status='scheduled' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_prep','Getting ready for '||new.title,'getting ready for '||new.title,array[new.character_instance_id],new.location_id,.58,new.starts_at-interval '60 minutes',new.starts_at-interval '20 minutes','{}'::jsonb,false,false,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','prep'),'commitment:prep:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,metadata=excluded.metadata;
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_en_route','Heading to '||new.title,'heading to '||coalesce(location_name,new.title),array[new.character_instance_id],new.location_id,.64,new.starts_at-interval '20 minutes',new.starts_at,'{}'::jsonb,false,false,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','en_route'),'commitment:en-route:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,metadata=excluded.metadata;
  end if;
  if new.status='active' and new.participation_mode='live' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_waiting','Waiting for you','waiting for you at '||coalesce(location_name,new.title),array[new.character_instance_id],new.location_id,.92,new.starts_at,coalesce(new.grace_ends_at,new.starts_at+make_interval(mins=>new.grace_minutes)),'{}'::jsonb,true,true,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','waiting'),'commitment:waiting:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,user_should_know=true,metadata=excluded.metadata returning id into waiting_event_id;
    if waiting_event_id is null then select id into waiting_event_id from public.together_life_events where character_instance_id=new.character_instance_id and simulation_key='commitment:waiting:'||new.id::text; end if;
    select id into conversation_id from public.together_conversations where user_id=new.user_id and character_instance_id=new.character_instance_id and archived_at is null order by last_message_at desc nulls last,created_at desc limit 1;
    if conversation_id is not null and not exists(select 1 from public.together_proactive_messages where user_id=new.user_id and character_instance_id=new.character_instance_id and life_event_id=waiting_event_id and status in('queued','sent','opened')) then
      insert into public.together_proactive_messages(user_id,character_instance_id,life_event_id,content,reason,status,eligible_at,expires_at,conversation_id)
      values(new.user_id,new.character_instance_id,waiting_event_id,'Are you still coming?','Waiting at '||coalesce(location_name,new.title),'queued',new.starts_at+interval '15 minutes',coalesce(new.grace_ends_at,new.starts_at+make_interval(mins=>new.grace_minutes)),conversation_id);
    end if;
  end if;
  if new.companion_state='late' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_late','Running late',coalesce(new.companion_reason,'running late for '||new.title),array[new.character_instance_id],new.location_id,.78,greatest(now(),new.starts_at-interval '30 minutes'),coalesce(new.companion_eta_at,new.starts_at+interval '30 minutes'),'{}'::jsonb,true,true,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','late','eta',new.companion_eta_at),'commitment:late:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set ends_at=excluded.ends_at,narrative_summary=excluded.narrative_summary,user_should_know=true,metadata=excluded.metadata;
    if new.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(new.user_id,new.continuity_id,new.character_instance_id,new.source_conversation_id,'plan_late','shared_plan',new.id,jsonb_build_object('title',new.title,'eta',new.companion_eta_at,'reason',new.companion_reason)) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists together_shared_plan_life_beats on public.together_shared_plans;
create trigger together_shared_plan_life_beats after insert or update of starts_at,ends_at,status,location_id,companion_state,companion_eta_at on public.together_shared_plans for each row execute function public.kivelle_sync_commitment_life_beats();

-- Arriving ends the waiting beat and cancels the waiting check-in if it has not been sent.
create or replace function public.kivelle_commitment_attendance_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
declare waiting_event_id uuid;
begin
  if new.participant_type<>'user' then return new; end if;
  select id into waiting_event_id from public.together_life_events where character_instance_id=(select character_instance_id from public.together_shared_plans where id=new.plan_id) and simulation_key='commitment:waiting:'||new.plan_id::text limit 1;
  if waiting_event_id is not null then
    update public.together_life_events set ends_at=least(coalesce(ends_at,new.joined_at),new.joined_at),user_should_know=false where id=waiting_event_id;
    update public.together_proactive_messages set status='cancelled',updated_at=now() where life_event_id=waiting_event_id and status='queued';
  end if;
  return new;
end $$;
drop trigger if exists together_plan_attendance_cleanup on public.together_plan_attendance;
create trigger together_plan_attendance_cleanup after insert or update of joined_at on public.together_plan_attendance for each row execute function public.kivelle_commitment_attendance_cleanup();

-- A normal Chat explanation can repair a missed commitment without requiring a special form.
-- The message is user-authored truth; the trigger never invents a reason.
create or replace function public.kivelle_capture_missed_commitment_explanation() returns trigger language plpgsql security definer set search_path=public as $$
declare resolution public.together_missed_plan_resolutions%rowtype; apology boolean; credible boolean; repair boolean; dismissive boolean; lost_trust integer; lost_respect integer; added_conflict integer; trust_restore integer; respect_restore integer; conflict_restore integer; next_status text;
begin
  if new.role<>'user' then return new; end if;
  select * into resolution from public.together_missed_plan_resolutions where user_id=new.user_id and character_instance_id=new.character_instance_id and status in('awaiting_explanation','unresolved') order by created_at desc limit 1 for update;
  if resolution.id is null or resolution.miss_reason<>'user_absent' then return new; end if;
  apology:=new.content~*'\m(sorry|apolog(y|ize|ise|ized|ised)|my fault|feel awful)\M';
  credible:=new.content~*'\m(emergency|hospital|sick|ill|daughter|son|child|family|accident|work emergency|car broke|phone died|lost service|connection|internet|power outage)\M';
  repair:=new.content~*'(make it up|make this right|reschedule|another time|try again|can we still|new date|new time)';
  dismissive:=new.content~*'(whatever|not a big deal|calm down|who cares|get over it)';
  if not(apology or credible or repair or dismissive) then return new; end if;
  lost_trust:=greatest(0,-coalesce((resolution.impact_applied->>'trust')::integer,0));lost_respect:=greatest(0,-coalesce((resolution.impact_applied->>'respect')::integer,0));added_conflict:=greatest(0,coalesce((resolution.impact_applied->>'conflict')::integer,0));
  if dismissive then trust_restore:=0;respect_restore:=-1;conflict_restore:=1;next_status:='unresolved';
  elsif apology and repair then trust_restore:=least(lost_trust,2);respect_restore:=least(lost_respect,1);conflict_restore:=-least(added_conflict,3);next_status:='repaired';
  else trust_restore:=case when apology or credible then least(lost_trust,1) else 0 end;respect_restore:=0;conflict_restore:=case when apology then -least(added_conflict,1) else 0 end;next_status:='explained'; end if;
  update public.together_relationship_states set trust=greatest(0,least(100,trust+trust_restore)),respect=greatest(0,least(100,respect+respect_restore)),conflict=greatest(0,least(100,conflict+conflict_restore)),affinity=greatest(0,least(100,affinity+case when apology and repair then 1 else 0 end)),last_relationship_delta=jsonb_build_object('trust',trust_restore,'respect',respect_restore,'conflict',conflict_restore,'affinity',case when apology and repair then 1 else 0 end),recent_direction=case when next_status='repaired' then 'repairing' when dismissive then 'strained' else recent_direction end,updated_at=now() where user_id=new.user_id and character_instance_id=new.character_instance_id;
  update public.together_missed_plan_resolutions set status=next_status,explanation=new.content,explained_at=now(),repair_attempted_at=case when repair then now() else repair_attempted_at end,resolved_at=case when next_status='repaired' then now() else resolved_at end,repair_impact=jsonb_build_object('trust',trust_restore,'respect',respect_restore,'conflict',conflict_restore,'affinity',case when apology and repair then 1 else 0 end),metadata=metadata||jsonb_build_object('explanationSource','chat','sourceMessageId',new.id,'signals',jsonb_build_object('apology',apology,'credibleReason',credible,'attemptedRepair',repair,'dismissive',dismissive)),updated_at=now() where id=resolution.id;
  if next_status='repaired' then
    insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
    values(new.user_id,(select continuity_id from public.together_shared_plans where id=resolution.plan_id),new.character_instance_id,new.conversation_id,'plan_repaired','shared_plan',resolution.plan_id,jsonb_build_object('source','chat','messageId',new.id)) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists together_message_missed_commitment_repair on public.together_messages;
create trigger together_message_missed_commitment_repair after insert on public.together_messages for each row execute function public.kivelle_capture_missed_commitment_explanation();

commit;
