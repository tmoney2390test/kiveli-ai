begin;

-- The media finalizer accepts images up to 20 MB. Keep Storage aligned so a
-- completed high-quality provider image is not rejected during delivery.
update storage.buckets
set file_size_limit=20*1024*1024
where id='together-user-media' and coalesce(file_size_limit,0)<20*1024*1024;

-- Immediate plans can record attendance before the plan's status changes to
-- active. The existing attendance trigger therefore has nothing to cancel at
-- that instant, while the later plan trigger creates a stale waiting message.
-- This after-trigger intentionally sorts after together_shared_plan_life_beats
-- and closes any waiting beat whenever canonical user attendance already
-- exists.
create or replace function public.kivelle_cleanup_arrived_plan_waiting()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  waiting_event_id uuid;
  arrived_at timestamptz;
begin
  if new.status<>'active' then return new; end if;

  select min(joined_at) into arrived_at
  from public.together_plan_attendance
  where plan_id=new.id and user_id=new.user_id and participant_type='user';

  if arrived_at is null then return new; end if;

  select id into waiting_event_id
  from public.together_life_events
  where character_instance_id=new.character_instance_id
    and simulation_key='commitment:waiting:'||new.id::text
  limit 1;

  if waiting_event_id is not null then
    update public.together_life_events
    set ends_at=least(coalesce(ends_at,arrived_at),arrived_at),user_should_know=false
    where id=waiting_event_id;

    update public.together_proactive_messages
    set status='cancelled',updated_at=now()
    where life_event_id=waiting_event_id and status='queued';
  end if;

  return new;
end
$$;

drop trigger if exists zzz_together_shared_plan_arrival_cleanup
  on public.together_shared_plans;
create trigger zzz_together_shared_plan_arrival_cleanup
after insert or update of status
on public.together_shared_plans
for each row execute function public.kivelle_cleanup_arrived_plan_waiting();

-- Repair any already queued waiting check-ins whose user has arrived. Sent
-- messages remain historical; this only prevents future contradictory sends.
update public.together_proactive_messages proactive
set status='cancelled',updated_at=now()
where proactive.status='queued'
  and exists(
    select 1
    from public.together_life_events event
    join public.together_shared_plans plan
      on plan.id=(event.metadata->>'canonicalPlanId')::uuid
    join public.together_plan_attendance attendance
      on attendance.plan_id=plan.id
     and attendance.user_id=plan.user_id
     and attendance.participant_type='user'
    where event.id=proactive.life_event_id
      and event.event_type='commitment_waiting'
  );

comment on function public.kivelle_cleanup_arrived_plan_waiting()
  is 'Cancels plan waiting beats and queued check-ins when canonical user attendance already exists.';

commit;
