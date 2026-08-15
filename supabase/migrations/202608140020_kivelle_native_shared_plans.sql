create table if not exists public.together_shared_plans(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 160),
  activity_key text not null check(char_length(activity_key) between 1 and 120),
  location_id uuid references public.together_locations(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in('proposed','scheduled','active','completed','cancelled')),
  source text not null check(source in('chat','manual_planner','location','discover','date','story')),
  source_conversation_id uuid references public.together_conversations(id) on delete set null,
  source_message_id uuid references public.together_messages(id) on delete set null,
  note text check(note is null or char_length(note) <= 1000),
  metadata jsonb not null default '{}'::jsonb,
  legacy_life_event_id uuid unique references public.together_life_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  completed_at timestamptz,
  check(ends_at > starts_at)
);

create index if not exists together_shared_plans_owner_status_time_idx
  on public.together_shared_plans(user_id, character_instance_id, status, starts_at);
create index if not exists together_shared_plans_user_time_idx
  on public.together_shared_plans(user_id, starts_at);
create index if not exists together_shared_plans_location_time_idx
  on public.together_shared_plans(location_id, starts_at);
create unique index if not exists together_shared_plans_request_idx
  on public.together_shared_plans(user_id, (metadata->>'requestId'))
  where metadata ? 'requestId';

alter table public.together_shared_plans enable row level security;
drop policy if exists "Users can view own shared plans" on public.together_shared_plans;
create policy "Users can view own shared plans"
  on public.together_shared_plans for select
  using (auth.uid() = user_id);
grant select on public.together_shared_plans to authenticated;

create table if not exists public.together_conversation_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  event_type text not null check(event_type in('plan_proposed','plan_created','plan_rescheduled','plan_cancelled','plan_completed','date_unlocked','moment_created','story_updated')),
  entity_type text not null check(entity_type in('shared_plan','date_session','moment','story','conversation_action')),
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists together_conversation_events_timeline_idx
  on public.together_conversation_events(conversation_id, created_at);
create index if not exists together_conversation_events_owner_idx
  on public.together_conversation_events(user_id, character_instance_id, created_at desc);
create unique index if not exists together_conversation_events_action_kind_idx
  on public.together_conversation_events(entity_id, event_type)
  where entity_type = 'conversation_action';

alter table public.together_conversation_events enable row level security;
drop policy if exists "Users can view own conversation events" on public.together_conversation_events;
create policy "Users can view own conversation events"
  on public.together_conversation_events for select
  using (auth.uid() = user_id);
grant select on public.together_conversation_events to authenticated;

alter table public.together_life_events
  add column if not exists shared_plan_id uuid references public.together_shared_plans(id) on delete set null;
create unique index if not exists together_life_events_shared_plan_history_idx
  on public.together_life_events(shared_plan_id)
  where shared_plan_id is not null;

alter table public.together_moments
  add column if not exists shared_plan_id uuid references public.together_shared_plans(id) on delete set null;
create unique index if not exists together_moments_shared_plan_idx
  on public.together_moments(shared_plan_id)
  where shared_plan_id is not null;

alter table public.together_conversation_actions drop constraint if exists together_conversation_actions_candidate_type_check;
alter table public.together_conversation_actions
  add constraint together_conversation_actions_candidate_type_check
  check(candidate_type in('plan','cancel_plan','reschedule_plan','plan_create','plan_cancel','plan_reschedule','date'));

insert into public.together_shared_plans(
  user_id, character_instance_id, title, activity_key, location_id,
  starts_at, ends_at, status, source, note, metadata, legacy_life_event_id,
  created_at, updated_at, cancelled_at, completed_at
)
select
  event.user_id,
  event.character_instance_id,
  event.title,
  coalesce(nullif(event.metadata->>'activityKey',''), nullif(event.resulting_state_changes->>'sharedActivity',''), 'shared_outing'),
  event.location_id,
  event.starts_at,
  coalesce(event.ends_at, event.starts_at + interval '90 minutes'),
  case
    when event.metadata->>'planStatus' = 'cancelled' then 'cancelled'
    when coalesce(event.ends_at, event.starts_at + interval '90 minutes') <= now() then 'completed'
    when event.starts_at <= now() then 'active'
    else 'scheduled'
  end,
  case when event.metadata->>'source' in ('chat','location','discover','date','story') then event.metadata->>'source' else 'manual_planner' end,
  nullif(event.metadata->>'note',''),
  event.metadata || jsonb_build_object('migratedFromLifeEvent', true),
  event.id,
  event.created_at,
  now(),
  case when event.metadata->>'planStatus' = 'cancelled' then coalesce((event.metadata->>'cancelledAt')::timestamptz, now()) end,
  case when coalesce(event.ends_at, event.starts_at + interval '90 minutes') <= now() and event.metadata->>'planStatus' <> 'cancelled' then coalesce((event.metadata->>'completedAt')::timestamptz, event.ends_at, now()) end
from public.together_life_events event
where event.event_type = 'shared_plan'
on conflict (legacy_life_event_id) do nothing;

update public.together_life_events event
set shared_plan_id = plan.id,
    event_type = case when plan.status = 'completed' then 'shared_plan_completed' else 'legacy_shared_plan' end,
    user_should_know = case when plan.status = 'completed' then event.user_should_know else false end,
    metadata = event.metadata || jsonb_build_object('canonicalPlanId', plan.id, 'migratedToSharedPlans', true)
from public.together_shared_plans plan
where plan.legacy_life_event_id = event.id
  and event.shared_plan_id is null;

create or replace function public.kivelle_progress_shared_plans(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
)
returns setof public.together_shared_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  activated_plan public.together_shared_plans%rowtype;
  completed_plan public.together_shared_plans%rowtype;
  memory_id uuid;
  plan_significance numeric;
  plan_summary text;
begin
  for activated_plan in
    update public.together_shared_plans
    set status = 'active', updated_at = p_now
    where user_id = p_user_id
      and character_instance_id = p_character_instance_id
      and status = 'scheduled'
      and starts_at <= p_now
      and ends_at > p_now
    returning *
  loop
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(activated_plan.user_id,'plan_started',jsonb_build_object('planId',activated_plan.id,'source',activated_plan.source));
  end loop;

  for completed_plan in
    update public.together_shared_plans
    set status = 'completed', completed_at = coalesce(completed_at, p_now), updated_at = p_now
    where user_id = p_user_id
      and character_instance_id = p_character_instance_id
      and status in ('scheduled','active')
      and ends_at <= p_now
    returning *
  loop
    plan_significance := greatest(0, least(1, coalesce((completed_plan.metadata->>'significance')::numeric, .45)));
    plan_summary := coalesce(nullif(completed_plan.metadata->>'completionSummary',''), 'User and their companion spent time together for ' || completed_plan.title || '.');

    if completed_plan.legacy_life_event_id is not null then
      update public.together_life_events
      set event_type = 'shared_plan_completed',
          title = completed_plan.title,
          narrative_summary = plan_summary,
          starts_at = completed_plan.starts_at,
          ends_at = completed_plan.ends_at,
          location_id = completed_plan.location_id,
          significance = plan_significance,
          user_should_know = true,
          metadata = metadata || jsonb_build_object('canonicalPlanId', completed_plan.id, 'completedAt', p_now)
      where id = completed_plan.legacy_life_event_id;
    else
      insert into public.together_life_events(
        user_id, character_instance_id, event_type, title, narrative_summary,
        participant_instance_ids, location_id, significance, starts_at, ends_at,
        resulting_state_changes, user_should_know, proactive_message_appropriate,
        metadata, shared_plan_id
      ) values (
        completed_plan.user_id, completed_plan.character_instance_id, 'shared_plan_completed',
        completed_plan.title, plan_summary, array[completed_plan.character_instance_id],
        completed_plan.location_id, plan_significance, completed_plan.starts_at, completed_plan.ends_at,
        jsonb_build_object('sharedActivity', completed_plan.activity_key), true, plan_significance >= .65,
        jsonb_build_object('canonicalPlanId', completed_plan.id, 'source', completed_plan.source), completed_plan.id
      ) on conflict (shared_plan_id) where shared_plan_id is not null do nothing;
    end if;

    if plan_significance >= .42 then
      insert into public.together_memories(
        user_id, character_instance_id, memory_type, canonical_text, dedupe_key,
        importance, confidence, sensitivity_category, status, metadata
      ) values (
        completed_plan.user_id, completed_plan.character_instance_id, 'episodic', plan_summary,
        'shared-plan:' || completed_plan.id::text, plan_significance, .95, 'none', 'active',
        jsonb_build_object('sharedPlanId', completed_plan.id, 'locationId', completed_plan.location_id)
      ) on conflict (character_instance_id, dedupe_key)
      do update set canonical_text = excluded.canonical_text, importance = greatest(together_memories.importance, excluded.importance), updated_at = p_now
      returning id into memory_id;
    end if;

    if plan_significance >= .5 then
      update public.together_relationship_states
      set affinity = least(100, affinity + 1),
          familiarity = least(100, familiarity + 1),
          updated_at = p_now
      where user_id = completed_plan.user_id
        and character_instance_id = completed_plan.character_instance_id;
    end if;

    if plan_significance >= .72 then
      insert into public.together_moments(
        user_id, character_instance_id, title, occurred_at, location_id, summary,
        participant_instance_ids, linked_memory_ids, relationship_impact,
        media, moment_type, shared_plan_id
      ) values (
        completed_plan.user_id, completed_plan.character_instance_id, completed_plan.title,
        completed_plan.ends_at, completed_plan.location_id, plan_summary,
        array[completed_plan.character_instance_id],
        case when memory_id is null then '{}'::uuid[] else array[memory_id] end,
        '{"affinity":1,"familiarity":1}'::jsonb, '[]'::jsonb, 'shared_plan', completed_plan.id
      ) on conflict (shared_plan_id) where shared_plan_id is not null do nothing;
      insert into public.together_analytics_events(user_id,event_name,properties)
      values(completed_plan.user_id,'plan_became_moment',jsonb_build_object('planId',completed_plan.id));
    end if;

    if completed_plan.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(completed_plan.user_id,completed_plan.character_instance_id,completed_plan.source_conversation_id,'plan_completed','shared_plan',completed_plan.id,jsonb_build_object('title',completed_plan.title,'startsAt',completed_plan.starts_at,'endsAt',completed_plan.ends_at,'status','completed','locationId',completed_plan.location_id));
    end if;
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(completed_plan.user_id,'plan_completed',jsonb_build_object('planId',completed_plan.id,'source',completed_plan.source));
  end loop;

  return query
  select * from public.together_shared_plans
  where user_id = p_user_id and character_instance_id = p_character_instance_id
  order by starts_at;
end;
$$;

revoke all on function public.kivelle_progress_shared_plans(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.kivelle_progress_shared_plans(uuid,uuid,timestamptz) to service_role;
