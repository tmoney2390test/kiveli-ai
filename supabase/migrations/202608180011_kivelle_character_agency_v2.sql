begin;

-- Scene actions now preserve both the user's request and the companion's
-- canonical autonomy decision. Existing completed actions remain completed.
alter table public.together_scene_actions
  add column if not exists initiated_by text not null default 'user',
  add column if not exists decision_status text not null default 'accepted',
  add column if not exists requested_interaction_key text,
  add column if not exists resolved_interaction_key text,
  add column if not exists responding_character_instance_id uuid references public.together_character_instances(id) on delete set null,
  add column if not exists parent_action_id uuid references public.together_scene_actions(id) on delete set null,
  add column if not exists decision_reason_codes text[] not null default '{}'::text[],
  add column if not exists decided_at timestamptz,
  add column if not exists expires_at timestamptz;

update public.together_scene_actions set
  requested_interaction_key=coalesce(requested_interaction_key,interaction_key),
  resolved_interaction_key=case when completed_at is not null then coalesce(resolved_interaction_key,interaction_key) else resolved_interaction_key end,
  responding_character_instance_id=coalesce(responding_character_instance_id,character_instance_id),
  decision_status=case when completed_at is not null then 'completed' else decision_status end,
  decided_at=case when completed_at is not null then coalesce(decided_at,completed_at) else decided_at end;

alter table public.together_scene_actions drop constraint if exists together_scene_actions_initiated_by_check;
alter table public.together_scene_actions add constraint together_scene_actions_initiated_by_check check(initiated_by in('user','character','system'));
alter table public.together_scene_actions drop constraint if exists together_scene_actions_decision_status_check;
alter table public.together_scene_actions add constraint together_scene_actions_decision_status_check check(decision_status in('proposed','accepted','countered','declined','completed','expired'));
alter table public.together_scene_actions drop constraint if exists together_scene_actions_expiry_check;
alter table public.together_scene_actions add constraint together_scene_actions_expiry_check check(expires_at is null or expires_at>=started_at);

create index if not exists together_scene_actions_pending_proposal_idx
  on public.together_scene_actions(scene_session_id,expires_at)
  where decision_status in('proposed','countered');
create index if not exists together_scene_actions_parent_idx
  on public.together_scene_actions(parent_action_id)
  where parent_action_id is not null;

-- Authored template edges remain the baseline social graph. This table stores
-- continuity-specific familiarity, affinity, and tension learned in scenes.
create table if not exists public.together_character_social_states(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_a_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  character_b_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  relationship_type text not null default 'acquaintance',
  familiarity numeric(6,3) not null default 0 check(familiarity between 0 and 100),
  affinity numeric(6,3) not null default 0 check(affinity between 0 and 100),
  tension numeric(6,3) not null default 0 check(tension between 0 and 100),
  recent_direction text not null default 'steady',
  last_shared_scene_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(character_a_instance_id<>character_b_instance_id),
  check(character_a_instance_id::text<character_b_instance_id::text),
  unique(continuity_id,character_a_instance_id,character_b_instance_id)
);

create index if not exists together_character_social_states_continuity_idx
  on public.together_character_social_states(continuity_id,updated_at desc);

create or replace function public.kivelle_validate_character_social_state() returns trigger
language plpgsql set search_path=public as $$
declare
  v_a_user uuid;
  v_a_continuity uuid;
  v_b_user uuid;
  v_b_continuity uuid;
begin
  select user_id,continuity_id into v_a_user,v_a_continuity from public.together_character_instances where id=new.character_a_instance_id;
  select user_id,continuity_id into v_b_user,v_b_continuity from public.together_character_instances where id=new.character_b_instance_id;
  if v_a_user is null or v_b_user is null or v_a_user<>new.user_id or v_b_user<>new.user_id
    or v_a_continuity<>new.continuity_id or v_b_continuity<>new.continuity_id then
    raise exception 'character social state must remain inside one user continuity';
  end if;
  return new;
end;
$$;

drop trigger if exists together_character_social_states_validate on public.together_character_social_states;
create trigger together_character_social_states_validate before insert or update of user_id,continuity_id,character_a_instance_id,character_b_instance_id
on public.together_character_social_states for each row execute function public.kivelle_validate_character_social_state();

alter table public.together_character_social_states enable row level security;
drop policy if exists together_character_social_states_own_read on public.together_character_social_states;
create policy together_character_social_states_own_read on public.together_character_social_states for select to authenticated using(user_id=auth.uid());
grant select on public.together_character_social_states to authenticated;

-- Preserve semantic interaction evidence instead of collapsing every shared
-- action into a conversation. Relationship metrics are still domain-clamped.
alter table public.together_relationship_evidence drop constraint if exists together_relationship_evidence_evidence_type_check;
alter table public.together_relationship_evidence add constraint together_relationship_evidence_evidence_type_check check(evidence_type in(
  'meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment',
  'commitment_kept','commitment_missed','repair_completed','future_planning','shared_experience','playful_competition',
  'support','vulnerability','affection','romantic_tension','conflict','repair','boundary_respected','boundary_ignored'
));

comment on table public.together_character_social_states is 'Continuity-scoped learned relationship state between character instances; authored template edges remain the baseline.';
comment on column public.together_scene_actions.decision_status is 'Canonical companion decision for a requested or character-initiated scene action.';

commit;
