-- All Calder commitments, including dates, share this serialized reservation check.
-- The existing Date trigger creates/updates its shared plan in the same transaction.
create or replace function public.kivelle_guard_calder_reservation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare actor uuid; quote jsonb; reserved_start timestamptz; reserved_end timestamptz;
begin
  if new.world_id is distinct from '31740169-035e-5b10-8c9d-98b206e9f24b'::uuid then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('calder-reservations:'||new.user_id::text||':'||new.continuity_id::text,0));
  if new.status not in ('proposed','scheduled','active') then return new; end if;
  for actor in select distinct unnest(coalesce(new.participant_instance_ids,array[new.character_instance_id])) loop
    quote:=coalesce(new.metadata->'travelReservationsByParticipant'->actor::text,new.metadata,'{}'::jsonb);
    reserved_start:=least(new.starts_at,coalesce((quote->>'travelReservationStartsAt')::timestamptz,new.starts_at));
    reserved_end:=greatest(new.ends_at,coalesce((quote->>'travelReservationEndsAt')::timestamptz,new.ends_at));
    if reserved_start is null or reserved_end is null or reserved_end<=reserved_start then
      raise exception 'Invalid Calder reservation interval' using errcode='22023';
    end if;
    if exists (
      select 1 from public.together_shared_plans p
      cross join lateral (select coalesce(p.metadata->'travelReservationsByParticipant'->actor::text,p.metadata,'{}'::jsonb) as value) q
      where p.user_id=new.user_id and p.continuity_id=new.continuity_id and p.id<>new.id
        and p.status in ('proposed','scheduled','active')
        and actor=any(coalesce(p.participant_instance_ids,array[p.character_instance_id]))
        and not (coalesce(new.metadata->>'switchState','')='staged' and coalesce(new.metadata->>'immediate','')='true' and p.id::text=coalesce(new.metadata->>'replacesPlanId',''))
        and least(p.starts_at,coalesce((q.value->>'travelReservationStartsAt')::timestamptz,p.starts_at))<reserved_end
        and greatest(p.ends_at,coalesce((q.value->>'travelReservationEndsAt')::timestamptz,p.ends_at))>reserved_start
    ) then raise exception 'CALDER_RESERVATION_CONFLICT: another commitment or its travel occupies this time' using errcode='23P01'; end if;
  end loop;
  return new;
end $$;
revoke all on function public.kivelle_guard_calder_reservation() from public,anon,authenticated;
grant execute on function public.kivelle_guard_calder_reservation() to service_role;
create trigger zzzz_calder_reservation_guard before insert or update of status,starts_at,ends_at,location_id,world_id,metadata,participant_instance_ids
on public.together_shared_plans for each row execute function public.kivelle_guard_calder_reservation();

-- Keep the common Date commitment synchronized with the reserved scene and journeys.
create or replace function public.kivelle_sync_date_commitment() returns trigger language plpgsql security definer set search_path=public as $$
declare template_row public.together_date_templates%rowtype; plan_id uuid; duration_minutes integer; plan_status text; tz text; plan_end timestamptz; travel_metadata jsonb;
begin
  if pg_trigger_depth()>1 then return new; end if;
  if new.scheduled_for is null or new.status not in('upcoming','active','completed') then
    if new.shared_plan_id is not null and new.status='deferred' then update public.together_shared_plans set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now(),miss_reason='cancelled' where id=new.shared_plan_id and status in('proposed','scheduled'); end if;
    return new;
  end if;
  select * into template_row from public.together_date_templates where id=new.date_template_id;
  if template_row.id is null or template_row.location_id is null then return new; end if;
  select timezone into tz from public.together_worlds where id=template_row.world_id;
  duration_minutes:=greatest(60,least(360,coalesce((template_row.metadata->>'durationMinutes')::integer,180)));
  plan_end:=new.scheduled_for+make_interval(mins=>duration_minutes);
  travel_metadata:='{}'::jsonb;
  if template_row.world_id='31740169-035e-5b10-8c9d-98b206e9f24b'::uuid then
    plan_end:=coalesce((new.state->>'reservedDateEndsAt')::timestamptz,coalesce(new.started_at,new.scheduled_for)+interval '90 minutes');
    duration_minutes:=greatest(1,ceil(extract(epoch from (plan_end-new.scheduled_for))/60)::integer);
    travel_metadata:=jsonb_strip_nulls(jsonb_build_object('travelReservationStartsAt',new.state->>'travelReservationStartsAt','travelReservationEndsAt',new.state->>'travelReservationEndsAt'));
  end if;
  plan_status:=case new.status when 'active' then 'active' when 'completed' then 'completed' else 'scheduled' end;
  if new.shared_plan_id is null then
    insert into public.together_shared_plans(user_id,continuity_id,character_instance_id,title,activity_key,world_id,location_id,starts_at,ends_at,window_starts_at,window_ends_at,time_precision,world_timezone,user_timezone,participation_mode,grace_minutes,grace_ends_at,status,source,metadata,completed_at)
    select new.user_id,new.continuity_id,new.character_instance_id,template_row.name,'date',template_row.world_id,template_row.location_id,new.scheduled_for,plan_end,new.scheduled_for,plan_end,'exact',coalesce(tz,'UTC'),coalesce(profile.experience_timezone,'UTC'),'live',30,new.scheduled_for+interval '30 minutes',plan_status,'date',travel_metadata||jsonb_build_object('dateSessionId',new.id,'dateTemplateId',new.date_template_id,'durationMinutes',duration_minutes,'significance',.85,'completionSummary','User and their companion shared '||template_row.name||'.'),case when new.status='completed' then coalesce(new.completed_at,now()) end
    from public.together_profiles profile where profile.user_id=new.user_id returning id into plan_id;
    new.shared_plan_id:=plan_id;
  else
    update public.together_shared_plans set title=template_row.name,world_id=template_row.world_id,location_id=template_row.location_id,starts_at=new.scheduled_for,ends_at=plan_end,metadata=coalesce(metadata,'{}'::jsonb)||travel_metadata,window_starts_at=new.scheduled_for,window_ends_at=plan_end,time_precision='exact',world_timezone=coalesce(tz,'UTC'),status=plan_status,grace_ends_at=new.scheduled_for+make_interval(mins=>grace_minutes),completed_at=case when new.status='completed' then coalesce(new.completed_at,now()) else completed_at end,updated_at=now() where id=new.shared_plan_id and user_id=new.user_id;
  end if;
  if new.status in('active','completed') and new.shared_plan_id is not null then
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata) values(new.user_id,new.continuity_id,new.shared_plan_id,'character',new.character_instance_id,coalesce(new.started_at,new.scheduled_for,now()),'date','{"automatic":true}'::jsonb) on conflict do nothing;
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata) values(new.user_id,new.continuity_id,new.shared_plan_id,'user',null,coalesce(new.started_at,now()),'date','{"dateStart":true}'::jsonb) on conflict do nothing;
  end if;
  return new;
end $$;
