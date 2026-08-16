begin;

create or replace function public.kivelle_sync_commitment_specialization() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if pg_trigger_depth()>1 then return new; end if;
  if new.source='date' then
    update public.together_date_sessions session set
      scheduled_for=case when new.status in('missed','cancelled') then null else new.starts_at end,
      status=case
        when new.status='scheduled' then 'upcoming'
        when new.status='active' then 'active'
        when new.status='completed' then 'completed'
        when new.status in('missed','cancelled') then 'deferred'
        else session.status end,
      completed_at=case when new.status='completed' then coalesce(session.completed_at,new.completed_at,now()) else session.completed_at end,
      state=coalesce(session.state,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
        'commitmentStatus',new.status,
        'commitmentMissed',case when new.status='missed' then true else null end,
        'missReason',case when new.status='missed' then new.miss_reason else null end,
        'missedPlanId',case when new.status='missed' then new.id else null end,
        'commitmentCancelled',case when new.status='cancelled' then true else null end
      )),
      updated_at=now()
    where session.shared_plan_id=new.id and session.user_id=new.user_id;
  end if;
  if new.activity_key='trip' then
    update public.together_trips trip set
      starts_at=new.starts_at,
      ends_at=new.ends_at,
      status=case
        when new.status='cancelled' then 'cancelled'
        when new.status='completed' then 'completed'
        else trip.status end,
      metadata=coalesce(trip.metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('commitmentStatus',new.status,'missReason',new.miss_reason)),
      updated_at=now()
    where trip.shared_plan_id=new.id and trip.user_id=new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists together_shared_plan_specialization_sync on public.together_shared_plans;
create trigger together_shared_plan_specialization_sync after update of starts_at,ends_at,status,miss_reason on public.together_shared_plans for each row execute function public.kivelle_sync_commitment_specialization();

commit;
