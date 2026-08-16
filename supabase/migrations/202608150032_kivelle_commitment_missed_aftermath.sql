begin;

create or replace function public.kivelle_close_missed_commitment() returns trigger language plpgsql security definer set search_path=public as $$
declare location_name text; character_name text; narrative text; significance numeric; occurred_at timestamptz;
begin
  if new.status<>'missed' or old.status is not distinct from 'missed' then return new; end if;
  select name into location_name from public.together_locations where id=new.location_id;
  select template.name into character_name from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id where instance.id=new.character_instance_id;
  occurred_at:=coalesce(new.missed_at,now());significance:=greatest(.78,least(1,coalesce((new.metadata->>'significance')::numeric,.55)));
  update public.together_life_events set ends_at=least(coalesce(ends_at,occurred_at),occurred_at),user_should_know=false where character_instance_id=new.character_instance_id and simulation_key='commitment:waiting:'||new.id::text;
  update public.together_proactive_messages set status='cancelled',updated_at=now() where life_event_id in(select id from public.together_life_events where character_instance_id=new.character_instance_id and simulation_key='commitment:waiting:'||new.id::text) and status='queued';
  narrative:=case new.miss_reason
    when 'user_absent' then coalesce(character_name,'Your companion')||' waited at '||coalesce(location_name,'the planned place')||', but you did not join before the grace period ended.'
    when 'character_absent' then coalesce(character_name,'Your companion')||' could not make '||new.title||coalesce(case when new.companion_reason is not null then ': '||new.companion_reason else '' end,'')||'. This does not count against you.'
    when 'system_failure' then new.title||' was interrupted by a Kivelle system problem. This does not count against your relationship.'
    when 'connection_failure' then new.title||' could not be completed because the connection failed. This does not count against your relationship.'
    else new.title||' did not happen.' end;
  insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key,shared_plan_id)
  values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_missed',case when new.miss_reason='user_absent' then 'You missed '||new.title else new.title||' did not happen' end,narrative,array[new.character_instance_id],new.location_id,significance,occurred_at,occurred_at+interval '60 minutes','{}'::jsonb,true,false,jsonb_build_object('canonicalPlanId',new.id,'missReason',new.miss_reason,'commitmentBeat','missed'),'commitment:missed:'||new.id::text,new.id)
  on conflict(shared_plan_id) where shared_plan_id is not null do update set title=excluded.title,narrative_summary=excluded.narrative_summary,significance=excluded.significance,starts_at=excluded.starts_at,ends_at=excluded.ends_at,user_should_know=true,metadata=excluded.metadata;
  return new;
end $$;
drop trigger if exists together_shared_plan_missed_aftermath on public.together_shared_plans;
create trigger together_shared_plan_missed_aftermath after update of status,miss_reason,missed_at on public.together_shared_plans for each row execute function public.kivelle_close_missed_commitment();

-- System recovery can explicitly attribute a failed live commitment without blaming the user.
create or replace function public.kivelle_mark_commitment_failure(p_plan_id uuid,p_reason text,p_detail text default null,p_now timestamptz default now()) returns public.together_shared_plans language plpgsql security definer set search_path=public as $$
declare plan_row public.together_shared_plans%rowtype;
begin
  if p_reason not in('system_failure','connection_failure') then raise exception 'Only technical failure reasons are allowed'; end if;
  update public.together_shared_plans set status='missed',missed_at=coalesce(missed_at,p_now),miss_reason=p_reason,companion_reason=nullif(btrim(p_detail),''),updated_at=p_now where id=p_plan_id and status in('scheduled','active') returning * into plan_row;
  if plan_row.id is null then select * into plan_row from public.together_shared_plans where id=p_plan_id; end if;
  if plan_row.id is not null then
    insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata,resolved_at)
    values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',p_reason,'{}'::jsonb,jsonb_build_object('technicalDetail',p_detail,'noRelationshipPenalty',true),p_now)
    on conflict(plan_id) do update set status='resolved',miss_reason=p_reason,impact_applied='{}'::jsonb,metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,resolved_at=p_now,updated_at=p_now;
  end if;
  return plan_row;
end $$;
revoke all on function public.kivelle_mark_commitment_failure(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_mark_commitment_failure(uuid,text,text,timestamptz) to service_role;

-- Authored life events can make the companion late or absent, but only when content explicitly says so.
create or replace function public.kivelle_apply_life_event_commitment_impact() returns trigger language plpgsql security definer set search_path=public as $$
declare impact text; plan_id uuid; eta timestamptz;
begin
  impact:=nullif(new.metadata->>'commitmentImpact','');
  if impact not in('late','absent','cancelled') then return new; end if;
  select plan.id into plan_id from public.together_shared_plans plan where plan.user_id=new.user_id and plan.character_instance_id=new.character_instance_id and plan.status in('scheduled','active') and plan.starts_at is not null and plan.starts_at<=coalesce(new.ends_at,new.starts_at+interval '4 hours')+interval '2 hours' and plan.ends_at>=new.starts_at-interval '2 hours' order by abs(extract(epoch from(plan.starts_at-new.starts_at))) limit 1;
  if plan_id is null then return new; end if;
  if impact='late' then eta:=coalesce(new.ends_at,new.starts_at+interval '30 minutes'); end if;
  perform public.kivelle_mark_character_commitment_exception(plan_id,impact,coalesce(new.narrative_summary,new.title),eta);
  return new;
end $$;
drop trigger if exists together_life_event_commitment_impact on public.together_life_events;
create trigger together_life_event_commitment_impact after insert or update of metadata,starts_at,ends_at on public.together_life_events for each row execute function public.kivelle_apply_life_event_commitment_impact();

commit;
