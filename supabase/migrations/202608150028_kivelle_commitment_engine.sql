begin;

-- SharedPlan becomes the canonical commitment/time/attendance record for plans, Dates, and Trips.
alter table public.together_shared_plans alter column starts_at drop not null;
alter table public.together_shared_plans alter column ends_at drop not null;
alter table public.together_shared_plans
  add column if not exists window_starts_at timestamptz,
  add column if not exists window_ends_at timestamptz,
  add column if not exists time_precision text not null default 'exact',
  add column if not exists world_timezone text,
  add column if not exists user_timezone text,
  add column if not exists original_time_expression text,
  add column if not exists participation_mode text not null default 'live',
  add column if not exists grace_minutes integer not null default 30,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists missed_at timestamptz,
  add column if not exists miss_reason text,
  add column if not exists companion_state text not null default 'expected',
  add column if not exists companion_eta_at timestamptz,
  add column if not exists companion_reason text;

alter table public.together_shared_plans drop constraint if exists together_shared_plans_status_check;
alter table public.together_shared_plans add constraint together_shared_plans_status_check check(status in('proposed','scheduled','active','completed','missed','cancelled'));
alter table public.together_shared_plans drop constraint if exists together_shared_plans_time_precision_check;
alter table public.together_shared_plans add constraint together_shared_plans_time_precision_check check(time_precision in('exact','approximate','daypart','window','day'));
alter table public.together_shared_plans drop constraint if exists together_shared_plans_participation_mode_check;
alter table public.together_shared_plans add constraint together_shared_plans_participation_mode_check check(participation_mode in('live','flexible','ambient'));
alter table public.together_shared_plans drop constraint if exists together_shared_plans_miss_reason_check;
alter table public.together_shared_plans add constraint together_shared_plans_miss_reason_check check(miss_reason is null or miss_reason in('user_absent','character_absent','system_failure','connection_failure','cancelled'));
alter table public.together_shared_plans drop constraint if exists together_shared_plans_companion_state_check;
alter table public.together_shared_plans add constraint together_shared_plans_companion_state_check check(companion_state in('expected','late','absent','cancelled'));
alter table public.together_shared_plans drop constraint if exists together_shared_plans_grace_minutes_check;
alter table public.together_shared_plans add constraint together_shared_plans_grace_minutes_check check(grace_minutes between 5 and 180);

do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint where conrelid='public.together_shared_plans'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%ends_at > starts_at%' loop
    execute format('alter table public.together_shared_plans drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.together_shared_plans drop constraint if exists together_shared_plans_canonical_timing_check;
alter table public.together_shared_plans add constraint together_shared_plans_canonical_timing_check check(
  (status='proposed' and (starts_at is null or ends_at is null or ends_at>starts_at))
  or (status<>'proposed' and starts_at is not null and ends_at is not null and ends_at>starts_at)
);
alter table public.together_shared_plans drop constraint if exists together_shared_plans_window_check;
alter table public.together_shared_plans add constraint together_shared_plans_window_check check(window_starts_at is null or window_ends_at is null or window_ends_at>window_starts_at);

update public.together_shared_plans plan set
  time_precision=coalesce(nullif(plan.time_precision,''),'exact'),
  window_starts_at=coalesce(plan.window_starts_at,plan.starts_at),
  window_ends_at=coalesce(plan.window_ends_at,plan.ends_at),
  grace_ends_at=coalesce(plan.grace_ends_at,plan.starts_at + make_interval(mins=>plan.grace_minutes)),
  world_timezone=coalesce(plan.world_timezone,world.timezone,'UTC'),
  user_timezone=coalesce(plan.user_timezone,profile.experience_timezone,'UTC')
from public.together_worlds world,public.together_profiles profile
where plan.world_id=world.id and profile.user_id=plan.user_id;

create table if not exists public.together_plan_attendance(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  plan_id uuid not null references public.together_shared_plans(id) on delete cascade,
  participant_type text not null check(participant_type in('user','character')),
  character_instance_id uuid references public.together_character_instances(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  source text not null default 'app' check(source in('app','system','date','trip','recovery')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((participant_type='user' and character_instance_id is null) or (participant_type='character' and character_instance_id is not null)),
  check(left_at is null or left_at>=joined_at)
);
create unique index if not exists together_plan_attendance_one_user_idx on public.together_plan_attendance(plan_id) where participant_type='user';
create unique index if not exists together_plan_attendance_one_character_idx on public.together_plan_attendance(plan_id,character_instance_id) where participant_type='character';
create index if not exists together_plan_attendance_owner_idx on public.together_plan_attendance(user_id,continuity_id,plan_id);

create table if not exists public.together_missed_plan_resolutions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  plan_id uuid not null unique references public.together_shared_plans(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  status text not null default 'awaiting_explanation' check(status in('awaiting_explanation','explained','repaired','unresolved','resolved')),
  miss_reason text not null check(miss_reason in('user_absent','character_absent','system_failure','connection_failure','cancelled')),
  explanation text,
  explained_at timestamptz,
  repair_attempted_at timestamptz,
  resolved_at timestamptz,
  impact_applied jsonb not null default '{}'::jsonb,
  repair_impact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists together_missed_plan_resolution_character_idx on public.together_missed_plan_resolutions(character_instance_id,status,created_at desc);

alter table public.together_plan_attendance enable row level security;
alter table public.together_missed_plan_resolutions enable row level security;
drop policy if exists together_plan_attendance_own_read on public.together_plan_attendance;
create policy together_plan_attendance_own_read on public.together_plan_attendance for select to authenticated using(user_id=auth.uid());
drop policy if exists together_missed_plan_resolutions_own_read on public.together_missed_plan_resolutions;
create policy together_missed_plan_resolutions_own_read on public.together_missed_plan_resolutions for select to authenticated using(user_id=auth.uid());
grant select on public.together_plan_attendance,public.together_missed_plan_resolutions to authenticated;

alter table public.together_date_sessions add column if not exists shared_plan_id uuid unique references public.together_shared_plans(id) on delete set null;
alter table public.together_trips add column if not exists shared_plan_id uuid unique references public.together_shared_plans(id) on delete set null;

alter table public.together_conversation_events drop constraint if exists together_conversation_events_event_type_check;
alter table public.together_conversation_events add constraint together_conversation_events_event_type_check check(event_type in('plan_proposed','plan_created','plan_rescheduled','plan_cancelled','plan_completed','plan_joined','plan_missed','plan_repaired','plan_late','date_unlocked','moment_created','story_updated'));

-- A scheduled Date mirrors to one live SharedPlan. scheduled_for remains a compatibility mirror, not a second source of truth.
create or replace function public.kivelle_sync_date_commitment() returns trigger language plpgsql security definer set search_path=public as $$
declare template_row public.together_date_templates%rowtype; plan_id uuid; duration_minutes integer; plan_status text; tz text;
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
  plan_status:=case new.status when 'active' then 'active' when 'completed' then 'completed' else 'scheduled' end;
  if new.shared_plan_id is null then
    insert into public.together_shared_plans(user_id,continuity_id,character_instance_id,title,activity_key,world_id,location_id,starts_at,ends_at,window_starts_at,window_ends_at,time_precision,world_timezone,user_timezone,participation_mode,grace_minutes,grace_ends_at,status,source,metadata,completed_at)
    select new.user_id,new.continuity_id,new.character_instance_id,template_row.name,'date',template_row.world_id,template_row.location_id,new.scheduled_for,new.scheduled_for+make_interval(mins=>duration_minutes),new.scheduled_for,new.scheduled_for+make_interval(mins=>duration_minutes),'exact',coalesce(tz,'UTC'),coalesce(profile.experience_timezone,'UTC'),'live',30,new.scheduled_for+interval '30 minutes',plan_status,'date',jsonb_build_object('dateSessionId',new.id,'dateTemplateId',new.date_template_id,'durationMinutes',duration_minutes,'significance',.85,'completionSummary','User and their companion shared '||template_row.name||'.'),case when new.status='completed' then coalesce(new.completed_at,now()) end
    from public.together_profiles profile where profile.user_id=new.user_id returning id into plan_id;
    new.shared_plan_id:=plan_id;
  else
    update public.together_shared_plans set title=template_row.name,world_id=template_row.world_id,location_id=template_row.location_id,starts_at=new.scheduled_for,ends_at=new.scheduled_for+make_interval(mins=>duration_minutes),window_starts_at=new.scheduled_for,window_ends_at=new.scheduled_for+make_interval(mins=>duration_minutes),time_precision='exact',world_timezone=coalesce(tz,'UTC'),status=plan_status,grace_ends_at=new.scheduled_for+make_interval(mins=>grace_minutes),completed_at=case when new.status='completed' then coalesce(new.completed_at,now()) else completed_at end,updated_at=now() where id=new.shared_plan_id and user_id=new.user_id;
  end if;
  if new.status in('active','completed') and new.shared_plan_id is not null then
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata) values(new.user_id,new.continuity_id,new.shared_plan_id,'character',new.character_instance_id,coalesce(new.started_at,new.scheduled_for,now()),'date','{"automatic":true}'::jsonb) on conflict do nothing;
    insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata) values(new.user_id,new.continuity_id,new.shared_plan_id,'user',null,coalesce(new.started_at,now()),'date','{"dateStart":true}'::jsonb) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists together_date_session_commitment_sync on public.together_date_sessions;
create trigger together_date_session_commitment_sync before insert or update of scheduled_for,status,completed_at on public.together_date_sessions for each row execute function public.kivelle_sync_date_commitment();

-- Backfill already-scheduled Dates through the same trigger path.
update public.together_date_sessions set scheduled_for=scheduled_for where scheduled_for is not null and status in('upcoming','active','completed') and shared_plan_id is null;

-- Trips also share the same commitment clock when they become scheduled.
create or replace function public.kivelle_sync_trip_commitment() returns trigger language plpgsql security definer set search_path=public as $$
declare world_row public.together_worlds%rowtype; plan_id uuid; plan_status text;
begin
  if pg_trigger_depth()>1 then return new; end if;
  if new.starts_at is null or new.ends_at is null then return new; end if;
  select * into world_row from public.together_worlds where id=new.world_id;
  plan_status:=case when new.status in('traveling','visiting','returning') then 'active' when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' else 'scheduled' end;
  if new.shared_plan_id is null then
    insert into public.together_shared_plans(user_id,continuity_id,character_instance_id,title,activity_key,world_id,location_id,starts_at,ends_at,window_starts_at,window_ends_at,time_precision,world_timezone,user_timezone,participation_mode,grace_minutes,grace_ends_at,status,source,metadata,completed_at,cancelled_at)
    select new.user_id,new.continuity_id,new.character_instance_id,'Trip to '||coalesce(world_row.name,'another world'),'trip',new.world_id,new.lodging_location_id,new.starts_at,new.ends_at,new.starts_at,new.ends_at,'exact',coalesce(world_row.timezone,'UTC'),coalesce(profile.experience_timezone,'UTC'),'flexible',60,new.starts_at+interval '60 minutes',plan_status,'story',jsonb_build_object('tripId',new.id,'durationMinutes',greatest(60,extract(epoch from(new.ends_at-new.starts_at))/60)),case when new.status='completed' then coalesce(new.departed_at,now()) end,case when new.status='cancelled' then now() end from public.together_profiles profile where profile.user_id=new.user_id returning id into plan_id;
    new.shared_plan_id:=plan_id;
  else
    update public.together_shared_plans set starts_at=new.starts_at,ends_at=new.ends_at,window_starts_at=new.starts_at,window_ends_at=new.ends_at,status=plan_status,location_id=new.lodging_location_id,completed_at=case when new.status='completed' then coalesce(new.departed_at,now()) else completed_at end,cancelled_at=case when new.status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,updated_at=now() where id=new.shared_plan_id and user_id=new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists together_trip_commitment_sync on public.together_trips;
create trigger together_trip_commitment_sync before insert or update of starts_at,ends_at,status,lodging_location_id on public.together_trips for each row execute function public.kivelle_sync_trip_commitment();
update public.together_trips set starts_at=starts_at where starts_at is not null and ends_at is not null and shared_plan_id is null;

-- Server-only hook for story/work/family events that make the companion late or absent.
create or replace function public.kivelle_mark_character_commitment_exception(p_plan_id uuid,p_state text,p_reason text default null,p_eta timestamptz default null) returns public.together_shared_plans language plpgsql security definer set search_path=public as $$
declare result public.together_shared_plans%rowtype;
begin
  if p_state not in('late','absent','cancelled','expected') then raise exception 'invalid companion state'; end if;
  update public.together_shared_plans set companion_state=p_state,companion_reason=nullif(btrim(p_reason),''),companion_eta_at=case when p_state='late' then p_eta else null end,updated_at=now() where id=p_plan_id returning * into result;
  return result;
end $$;
revoke all on function public.kivelle_mark_character_commitment_exception(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_mark_character_commitment_exception(uuid,text,text,timestamptz) to service_role;

-- Attendance-aware lifecycle. Time alone never completes a live commitment.
create or replace function public.kivelle_progress_shared_plans(p_user_id uuid,p_character_instance_id uuid,p_now timestamptz default now())
returns setof public.together_shared_plans language plpgsql security definer set search_path=public as $$
declare plan_row public.together_shared_plans%rowtype; memory_id uuid; plan_significance numeric; plan_summary text; prior_misses integer; penalty integer; relationship_stage text; impact jsonb; miss_kind text;
begin
  -- Companion arrival. Late companions arrive only when their ETA is reached.
  for plan_row in select * from public.together_shared_plans where user_id=p_user_id and character_instance_id=p_character_instance_id and status='scheduled' and starts_at is not null and starts_at<=p_now and ends_at>p_now order by starts_at for update
  loop
    if plan_row.companion_state in('absent','cancelled') then
      miss_kind:=case when plan_row.companion_state='cancelled' then 'cancelled' else 'character_absent' end;
      update public.together_shared_plans set status=case when miss_kind='cancelled' then 'cancelled' else 'missed' end,missed_at=case when miss_kind='cancelled' then missed_at else p_now end,miss_reason=miss_kind,cancelled_at=case when miss_kind='cancelled' then coalesce(cancelled_at,p_now) else cancelled_at end,updated_at=p_now where id=plan_row.id;
      insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',miss_kind,'{}'::jsonb,jsonb_build_object('companionReason',plan_row.companion_reason,'noUserPenalty',true)) on conflict(plan_id) do nothing;
      continue;
    end if;
    if plan_row.companion_state='expected' or (plan_row.companion_state='late' and plan_row.companion_eta_at is not null and plan_row.companion_eta_at<=p_now) then
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.id,'character',plan_row.character_instance_id,case when plan_row.companion_state='late' then plan_row.companion_eta_at else plan_row.starts_at end,'system',jsonb_build_object('companionState',plan_row.companion_state)) on conflict do nothing;
    end if;
    update public.together_shared_plans set status='active',grace_ends_at=coalesce(grace_ends_at,starts_at+make_interval(mins=>grace_minutes)),updated_at=p_now where id=plan_row.id and status='scheduled';
    insert into public.together_analytics_events(user_id,event_name,properties) values(plan_row.user_id,'plan_started',jsonb_build_object('planId',plan_row.id,'source',plan_row.source)) on conflict do nothing;
  end loop;

  -- A live commitment becomes missed after grace if the companion arrived but the user did not.
  for plan_row in update public.together_shared_plans plan set status='missed',missed_at=coalesce(plan.missed_at,p_now),miss_reason='user_absent',updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id and plan.status='active' and plan.participation_mode='live' and coalesce(plan.grace_ends_at,plan.starts_at+make_interval(mins=>plan.grace_minutes))<=p_now
      and exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='character')
      and not exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user') returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    select count(*) into prior_misses from public.together_shared_plans previous where previous.user_id=plan_row.user_id and previous.character_instance_id=plan_row.character_instance_id and previous.status='missed' and previous.miss_reason='user_absent' and previous.id<>plan_row.id;
    select relationship_stage into relationship_stage from public.together_character_instances where id=plan_row.character_instance_id;
    penalty:=1+case when plan_significance>=.65 then 1 else 0 end+case when plan_significance>=.85 then 1 else 0 end+case when relationship_stage in('dating','exclusive','long_term') then 1 else 0 end+least(2,prior_misses);
    impact:=jsonb_build_object('trust',-least(5,penalty),'respect',-least(4,greatest(1,penalty-1)),'conflict',least(5,penalty),'affinity',case when plan_significance>=.75 then -1 else 0 end);
    update public.together_relationship_states set trust=greatest(0,trust-least(5,penalty)),respect=greatest(0,respect-least(4,greatest(1,penalty-1))),conflict=least(100,conflict+least(5,penalty)),affinity=greatest(0,affinity+case when plan_significance>=.75 then -1 else 0 end),last_relationship_delta=impact,recent_direction='strained',updated_at=p_now where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id;
    insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'awaiting_explanation','user_absent',impact,jsonb_build_object('priorMisses',prior_misses,'significance',plan_significance,'waitedMinutes',greatest(0,extract(epoch from(p_now-plan_row.starts_at))/60)::integer)) on conflict(plan_id) do update set status='awaiting_explanation',miss_reason='user_absent',impact_applied=excluded.impact_applied,metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,updated_at=p_now;
    if plan_row.source_conversation_id is not null then insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_missed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'status','missed','missReason','user_absent','locationId',plan_row.location_id)) on conflict do nothing; end if;
    insert into public.together_analytics_events(user_id,event_name,properties) values(plan_row.user_id,'plan_missed',jsonb_build_object('planId',plan_row.id,'reason','user_absent','priorMisses',prior_misses));
  end loop;

  -- Flexible/ambient commitments can complete by time. Live commitments require user attendance.
  for plan_row in update public.together_shared_plans plan set status='completed',completed_at=coalesce(plan.completed_at,p_now),updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id and plan.status='active' and plan.ends_at<=p_now and (plan.participation_mode<>'live' or exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user')) returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    plan_summary:=coalesce(nullif(plan_row.metadata->>'completionSummary',''),'User and their companion spent time together for '||plan_row.title||'.');
    if plan_row.source='date' then
      insert into public.together_analytics_events(user_id,event_name,properties) values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source','date','effectsOwnedBy','date_session'));
      continue;
    end if;
    if plan_row.legacy_life_event_id is not null then
      update public.together_life_events set event_type='shared_plan_completed',title=plan_row.title,narrative_summary=plan_summary,starts_at=plan_row.starts_at,ends_at=plan_row.ends_at,location_id=plan_row.location_id,significance=plan_significance,user_should_know=true,metadata=metadata||jsonb_build_object('canonicalPlanId',plan_row.id,'completedAt',p_now) where id=plan_row.legacy_life_event_id;
    else
      insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,shared_plan_id) values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'shared_plan_completed',plan_row.title,plan_summary,array[plan_row.character_instance_id],plan_row.location_id,plan_significance,plan_row.starts_at,plan_row.ends_at,jsonb_build_object('sharedActivity',plan_row.activity_key),true,plan_significance>=.65,jsonb_build_object('canonicalPlanId',plan_row.id,'source',plan_row.source),plan_row.id) on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
    end if;
    if plan_significance>=.42 then insert into public.together_memories(user_id,continuity_id,character_instance_id,memory_type,canonical_text,dedupe_key,importance,confidence,sensitivity_category,status,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'episodic',plan_summary,'shared-plan:'||plan_row.id::text,plan_significance,.95,'none','active',jsonb_build_object('sharedPlanId',plan_row.id,'locationId',plan_row.location_id)) on conflict(character_instance_id,dedupe_key) do update set canonical_text=excluded.canonical_text,importance=greatest(public.together_memories.importance,excluded.importance),updated_at=p_now returning id into memory_id; end if;
    if plan_significance>=.5 then update public.together_relationship_states set affinity=least(100,affinity+1),familiarity=least(100,familiarity+1),last_interaction_quality='shared_experience',last_relationship_delta='{"affinity":1,"familiarity":1}'::jsonb,recent_direction='improving',updated_at=p_now where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id; end if;
    if plan_significance>=.72 then insert into public.together_moments(user_id,continuity_id,character_instance_id,title,occurred_at,location_id,summary,participant_instance_ids,linked_memory_ids,relationship_impact,media,moment_type,shared_plan_id) values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.title,plan_row.ends_at,plan_row.location_id,plan_summary,array[plan_row.character_instance_id],case when memory_id is null then '{}'::uuid[] else array[memory_id] end,'{"affinity":1,"familiarity":1}'::jsonb,'[]'::jsonb,'shared_plan',plan_row.id) on conflict(shared_plan_id) where shared_plan_id is not null do nothing; end if;
    if plan_row.source_conversation_id is not null then insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata) values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_completed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'endsAt',plan_row.ends_at,'status','completed','locationId',plan_row.location_id)) on conflict do nothing; end if;
    insert into public.together_analytics_events(user_id,event_name,properties) values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source',plan_row.source));
  end loop;
  return query select * from public.together_shared_plans where user_id=p_user_id and character_instance_id=p_character_instance_id order by starts_at nulls last,created_at;
end $$;
revoke all on function public.kivelle_progress_shared_plans(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_progress_shared_plans(uuid,uuid,timestamptz) to service_role;

comment on table public.together_plan_attendance is 'Canonical attendance for shared commitments. Live commitments never complete from time alone.';
comment on table public.together_missed_plan_resolutions is 'Unresolved relationship state created when a commitment is missed. Explanation and repair remain canonical and scoped to one Kivelle Life.';
comment on column public.together_shared_plans.time_precision is 'Preserves how precise the human agreement actually was instead of inventing an exact time.';
comment on column public.together_date_sessions.shared_plan_id is 'Dates specialize SharedPlan; SharedPlan owns time, location, attendance, cancellation, and missed state.';
comment on column public.together_trips.shared_plan_id is 'Trips specialize SharedPlan; SharedPlan owns the commitment clock while Trip owns travel/lodging state.';

commit;
