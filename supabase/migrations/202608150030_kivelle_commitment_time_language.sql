begin;

-- Normalize model-proposed plan timestamps against the user's actual language.
-- The model may propose a timestamp for convenience; Kivelle decides whether the user really supplied that precision.
create or replace function public.kivelle_normalize_conversation_plan_time() returns trigger language plpgsql security definer set search_path=public as $$
declare user_text text; proposed timestamptz; zone text; local_day date; window_start timestamptz; window_end timestamptz; phrase text; precision text; explicit_clock boolean; approximate_clock boolean; location_id uuid; plan_id uuid;
begin
  if new.candidate_type not in('plan','plan_create','date','plan_reschedule','reschedule_plan') then return new; end if;
  if not(new.payload ? 'proposedStartsAt') then return new; end if;
  begin proposed:=(new.payload->>'proposedStartsAt')::timestamptz; exception when others then return new; end;
  select content into user_text from public.together_messages where conversation_id=new.conversation_id and role='user' order by created_at desc limit 1;
  if user_text is null then return new; end if;
  location_id:=nullif(new.payload->>'locationId','')::uuid;
  if location_id is null then location_id:=nullif(new.payload->>'proposedLocationId','')::uuid; end if;
  plan_id:=nullif(coalesce(new.payload->>'planId',new.payload->>'targetId'),'')::uuid;
  if location_id is not null then select world.timezone into zone from public.together_locations location join public.together_worlds world on world.id=location.world_id where location.id=location_id; end if;
  if zone is null and plan_id is not null then select coalesce(world_timezone,'UTC') into zone from public.together_shared_plans where id=plan_id; end if;
  if zone is null then select world.timezone into zone from public.together_character_instances instance join public.together_locations location on location.id=instance.current_location_id join public.together_worlds world on world.id=location.world_id where instance.id=new.character_instance_id; end if;
  zone:=coalesce(zone,'UTC');
  explicit_clock:=user_text~*'\m(at|make it)\s*[0-9]{1,2}(:[0-9]{2})?\s*(am|pm)?\M';
  approximate_clock:=user_text~*'\m(around|about|roughly)\s*[0-9]{1,2}(:[0-9]{2})?\s*(am|pm)?\M';
  if explicit_clock and not approximate_clock then new.payload:=new.payload||jsonb_build_object('timePrecision','exact','originalTimeExpression',coalesce(new.payload->>'relativeTime','exact time'));return new; end if;
  if approximate_clock then
    window_start:=proposed-interval '30 minutes';window_end:=proposed+interval '30 minutes';precision:='approximate';phrase:=(regexp_match(user_text,'(?i)(around|about|roughly)\s*[0-9]{1,2}(:[0-9]{2})?\s*(am|pm)?'))[1];
    new.payload:=(new.payload-'proposedStartsAt')||jsonb_build_object('windowStartsAt',window_start,'windowEndsAt',window_end,'timePrecision',precision,'originalTimeExpression',coalesce(phrase,'around that time'),'suggestedStartsAt',proposed);return new;
  end if;
  local_day:=(proposed at time zone zone)::date;
  if user_text~*'\m(morning)\M' then window_start:=(local_day+time '08:00') at time zone zone;window_end:=(local_day+time '12:00') at time zone zone;precision:='daypart';phrase:='morning';
  elsif user_text~*'\m(afternoon)\M' then window_start:=(local_day+time '12:00') at time zone zone;window_end:=(local_day+time '17:00') at time zone zone;precision:='daypart';phrase:='afternoon';
  elsif user_text~*'\m(evening)\M' then window_start:=(local_day+time '17:00') at time zone zone;window_end:=(local_day+time '22:00') at time zone zone;precision:='daypart';phrase:='evening';
  elsif user_text~*'\m(tonight|night)\M' then window_start:=(local_day+time '19:00') at time zone zone;window_end:=(local_day+interval '1 day'+time '00:00') at time zone zone;precision:='daypart';phrase:=case when user_text~*'\mtonight\M' then 'tonight' else 'night' end;
  elsif user_text~*'\m(this weekend|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\M' then window_start:=(local_day+time '09:00') at time zone zone;window_end:=(local_day+time '22:00') at time zone zone;precision:='day';phrase:=(regexp_match(user_text,'(?i)(this weekend|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)'))[1];
  else return new; end if;
  new.payload:=(new.payload-'proposedStartsAt')||jsonb_build_object('windowStartsAt',window_start,'windowEndsAt',window_end,'timePrecision',precision,'originalTimeExpression',coalesce(phrase,new.payload->>'relativeTime','that time'),'suggestedStartsAt',proposed);
  return new;
end $$;
drop trigger if exists together_conversation_action_time_precision on public.together_conversation_actions;
create trigger together_conversation_action_time_precision before insert on public.together_conversation_actions for each row execute function public.kivelle_normalize_conversation_plan_time();

-- Starting a Date is an attendance action. An unscheduled Date becomes an immediate exact commitment;
-- a scheduled Date cannot be started hours early or resurrected after its grace period.
create or replace function public.kivelle_guard_date_commitment_start() returns trigger language plpgsql security definer set search_path=public as $$
declare plan public.together_shared_plans%rowtype;
begin
  if new.status='active' and old.status is distinct from 'active' then
    if new.scheduled_for is null then new.scheduled_for:=now(); end if;
    if new.shared_plan_id is not null then
      select * into plan from public.together_shared_plans where id=new.shared_plan_id;
      if plan.status in('missed','cancelled','completed') then raise exception 'This Date commitment is already over.' using errcode='P0001'; end if;
      if plan.starts_at is not null and now()<plan.starts_at-interval '30 minutes' then raise exception 'This Date is not ready to start yet.' using errcode='P0001'; end if;
      if plan.participation_mode='live' and coalesce(plan.grace_ends_at,plan.starts_at+make_interval(mins=>plan.grace_minutes))<now() then raise exception 'The grace period for this Date has ended.' using errcode='P0001'; end if;
      if plan.companion_state in('absent','cancelled') then raise exception 'Your companion cannot attend this Date.' using errcode='P0001'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists aa_together_date_commitment_start_guard on public.together_date_sessions;
create trigger aa_together_date_commitment_start_guard before update of status,scheduled_for on public.together_date_sessions for each row execute function public.kivelle_guard_date_commitment_start();

commit;
