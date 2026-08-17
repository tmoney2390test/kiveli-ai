begin;

-- A scene only exists once a user actively enters a shared experience. Passive
-- schedule/presence state remains owned by the Life Engine.
create table if not exists public.together_scene_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid references public.together_conversations(id) on delete set null,
  world_id uuid not null references public.together_worlds(id) on delete restrict,
  location_id uuid not null references public.together_locations(id) on delete restrict,
  source text not null check(source in('schedule','drop_in','shared_plan','date','conversation','story')),
  activity_key text,
  participant_instance_ids uuid[] not null default '{}'::uuid[],
  started_at timestamptz not null default now(),
  expected_end_at timestamptz,
  ended_at timestamptz,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expected_end_at is null or expected_end_at>=started_at),
  check(ended_at is null or ended_at>=started_at)
);

create unique index if not exists together_scene_sessions_one_active_character_idx
  on public.together_scene_sessions(character_instance_id) where ended_at is null;
create index if not exists together_scene_sessions_continuity_active_idx
  on public.together_scene_sessions(continuity_id,character_instance_id,started_at desc) where ended_at is null;
create index if not exists together_scene_sessions_location_active_idx
  on public.together_scene_sessions(location_id,started_at desc) where ended_at is null;
create index if not exists together_scene_sessions_expected_end_idx
  on public.together_scene_sessions(expected_end_at) where ended_at is null and expected_end_at is not null;

create table if not exists public.together_scene_actions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  scene_session_id uuid not null references public.together_scene_sessions(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  interaction_key text not null,
  family text not null check(family in('talk','activity','move','share','social','media','relationship','leave')),
  request_id text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  source_message_id uuid references public.together_messages(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(scene_session_id,request_id)
);
create index if not exists together_scene_actions_session_created_idx on public.together_scene_actions(scene_session_id,created_at desc);
create index if not exists together_scene_actions_character_created_idx on public.together_scene_actions(character_instance_id,created_at desc);

-- Foreign keys establish that the referenced rows exist. These validators keep
-- the references in one coherent Kivelle Life and prevent a scene from pairing
-- a location with a world it does not belong to.
create or replace function public.kivelle_validate_scene_session_context() returns trigger language plpgsql set search_path=public as $$
declare
  location_world_id uuid;
  conversation_instance_id uuid;
  conversation_continuity_id uuid;
begin
  select world_id into location_world_id from public.together_locations where id=new.location_id;
  if location_world_id is null or location_world_id<>new.world_id then
    raise exception 'scene location must belong to scene world';
  end if;
  if new.conversation_id is not null then
    select character_instance_id,continuity_id into conversation_instance_id,conversation_continuity_id
      from public.together_conversations where id=new.conversation_id;
    if conversation_instance_id is null or conversation_instance_id<>new.character_instance_id or conversation_continuity_id<>new.continuity_id then
      raise exception 'scene conversation must belong to the same character and continuity';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.kivelle_validate_scene_action_context() returns trigger language plpgsql set search_path=public as $$
declare
  scene_user_id uuid;
  scene_continuity_id uuid;
  scene_character_instance_id uuid;
begin
  select user_id,continuity_id,character_instance_id into scene_user_id,scene_continuity_id,scene_character_instance_id
    from public.together_scene_sessions where id=new.scene_session_id;
  if scene_user_id is null or scene_user_id<>new.user_id or scene_continuity_id<>new.continuity_id or scene_character_instance_id<>new.character_instance_id then
    raise exception 'scene action must belong to its scene user, continuity, and character';
  end if;
  return new;
end;
$$;

drop trigger if exists together_scene_sessions_fill_continuity on public.together_scene_sessions;
create trigger together_scene_sessions_fill_continuity before insert or update of character_instance_id,continuity_id on public.together_scene_sessions for each row execute function public.kivelle_fill_state_continuity();
drop trigger if exists together_scene_actions_fill_continuity on public.together_scene_actions;
create trigger together_scene_actions_fill_continuity before insert or update of character_instance_id,continuity_id on public.together_scene_actions for each row execute function public.kivelle_fill_state_continuity();
drop trigger if exists together_scene_sessions_validate_context on public.together_scene_sessions;
create trigger together_scene_sessions_validate_context before insert or update of world_id,location_id,conversation_id,character_instance_id,continuity_id on public.together_scene_sessions for each row execute function public.kivelle_validate_scene_session_context();
drop trigger if exists together_scene_actions_validate_context on public.together_scene_actions;
create trigger together_scene_actions_validate_context before insert or update of scene_session_id,character_instance_id,continuity_id,user_id on public.together_scene_actions for each row execute function public.kivelle_validate_scene_action_context();

alter table public.together_scene_sessions enable row level security;
alter table public.together_scene_actions enable row level security;
drop policy if exists together_scene_sessions_own_read on public.together_scene_sessions;
create policy together_scene_sessions_own_read on public.together_scene_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists together_scene_actions_own_read on public.together_scene_actions;
create policy together_scene_actions_own_read on public.together_scene_actions for select to authenticated using(user_id=auth.uid());
grant select on public.together_scene_sessions,together_scene_actions to authenticated;

-- Existing evidence remains the relationship ledger. A meaningful scene action
-- is a valid source for evidence, but routine clicks do not create evidence.
alter table public.together_relationship_evidence drop constraint if exists together_relationship_evidence_source_type_check;
alter table public.together_relationship_evidence add constraint together_relationship_evidence_source_type_check check(source_type in('message','shared_plan','date_session','trip','moment','milestone','repair','migration','scene_action'));

alter table public.together_generated_media add column if not exists scene_session_id uuid references public.together_scene_sessions(id) on delete set null;
alter table public.together_moments add column if not exists scene_session_id uuid references public.together_scene_sessions(id) on delete set null;
create index if not exists together_generated_media_scene_session_idx on public.together_generated_media(scene_session_id) where scene_session_id is not null;
create index if not exists together_moments_scene_session_idx on public.together_moments(scene_session_id) where scene_session_id is not null;

comment on table public.together_scene_sessions is 'Persistent, user-entered shared scenes. Life Engine owns passive presence; scenes record co-present actions.';
comment on table public.together_scene_actions is 'Idempotent completed interaction log. Suggested actions remain in resolver output, not this table.';

commit;
