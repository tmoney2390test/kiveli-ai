begin;

-- A scheduled group plan needs social state before physical attendance begins.
-- Attendance continues to mean canonical co-presence; this table represents
-- the invitation/RSVP lifecycle shown in chat and survives app restarts.
create table if not exists public.together_plan_participant_responses(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  plan_id uuid not null references public.together_shared_plans(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  response_state text not null default 'going'
    check(response_state in('invited','going','arrived','late','declined','unavailable')),
  reason text,
  responded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,character_instance_id)
);

create index if not exists together_plan_participant_responses_owner_idx
  on public.together_plan_participant_responses(user_id,continuity_id,plan_id);
create index if not exists together_plan_participant_responses_state_idx
  on public.together_plan_participant_responses(plan_id,response_state);

alter table public.together_plan_participant_responses enable row level security;
drop policy if exists together_plan_participant_responses_own_read
  on public.together_plan_participant_responses;
create policy together_plan_participant_responses_own_read
  on public.together_plan_participant_responses for select to authenticated
  using(user_id=auth.uid());
grant select on public.together_plan_participant_responses to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.together_plan_participant_responses;
exception when duplicate_object then null;
end $$;

create or replace function public.kivelle_validate_plan_participant_response()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(
    select 1 from public.together_shared_plans plan
    where plan.id=new.plan_id
      and plan.user_id=new.user_id
      and plan.continuity_id=new.continuity_id
      and new.character_instance_id=any(plan.participant_instance_ids)
  ) then
    raise exception 'plan response must belong to a canonical plan participant';
  end if;
  return new;
end;
$$;

drop trigger if exists together_plan_participant_responses_validate
  on public.together_plan_participant_responses;
create trigger together_plan_participant_responses_validate
  before insert or update of user_id,continuity_id,plan_id,character_instance_id
  on public.together_plan_participant_responses for each row
  execute function public.kivelle_validate_plan_participant_response();

create or replace function public.kivelle_seed_plan_participant_responses()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.together_plan_participant_responses(
    user_id,continuity_id,plan_id,character_instance_id,response_state,responded_at,metadata
  )
  select new.user_id,new.continuity_id,new.id,participant_id,'going',now(),
    jsonb_build_object('source','availability_verified','groupPlan',cardinality(new.participant_instance_ids)>1)
  from unnest(new.participant_instance_ids) participant_id
  on conflict(plan_id,character_instance_id) do nothing;
  return new;
end;
$$;

drop trigger if exists together_shared_plans_seed_participant_responses
  on public.together_shared_plans;
create trigger together_shared_plans_seed_participant_responses
  after insert on public.together_shared_plans for each row
  execute function public.kivelle_seed_plan_participant_responses();

-- Backfill plans created after the roster migration but before this migration.
insert into public.together_plan_participant_responses(
  user_id,continuity_id,plan_id,character_instance_id,response_state,responded_at,metadata
)
select plan.user_id,plan.continuity_id,plan.id,participant_id,
  case when attendance.id is null then 'going' else 'arrived' end,
  coalesce(attendance.joined_at,plan.created_at),
  jsonb_build_object('source','migration','groupPlan',cardinality(plan.participant_instance_ids)>1)
from public.together_shared_plans plan
cross join lateral unnest(plan.participant_instance_ids) participant_id
left join public.together_plan_attendance attendance
  on attendance.plan_id=plan.id
 and attendance.participant_type='character'
 and attendance.character_instance_id=participant_id
on conflict(plan_id,character_instance_id) do nothing;

create or replace function public.kivelle_sync_plan_response_from_attendance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.participant_type='character' and new.left_at is null then
    update public.together_plan_participant_responses
    set response_state='arrived',responded_at=coalesce(responded_at,new.joined_at),
        metadata=metadata||jsonb_build_object('arrivedAt',new.joined_at),updated_at=now()
    where plan_id=new.plan_id and character_instance_id=new.character_instance_id;
  end if;
  return new;
end;
$$;

drop trigger if exists together_plan_attendance_sync_response
  on public.together_plan_attendance;
create trigger together_plan_attendance_sync_response
  after insert or update of left_at on public.together_plan_attendance
  for each row execute function public.kivelle_sync_plan_response_from_attendance();

revoke all on function public.kivelle_seed_plan_participant_responses() from public,anon,authenticated;
revoke all on function public.kivelle_sync_plan_response_from_attendance() from public,anon,authenticated;

commit;
