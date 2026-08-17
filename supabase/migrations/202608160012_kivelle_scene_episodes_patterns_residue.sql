begin;

create table if not exists public.together_scene_episodes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  scene_session_id uuid not null unique references public.together_scene_sessions(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  world_id uuid references public.together_worlds(id) on delete set null,
  location_id uuid references public.together_locations(id) on delete set null,
  participant_instance_ids uuid[] not null default '{}'::uuid[],
  title text not null,
  summary text not null,
  emotional_tone text,
  significance numeric(5,4) not null check(significance between 0 and 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  action_ids uuid[] not null default '{}'::uuid[],
  context_tags text[] not null default '{}'::text[],
  moment_id uuid references public.together_moments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(ended_at >= started_at)
);
create index if not exists together_scene_episodes_character_ended_idx on public.together_scene_episodes(character_instance_id,ended_at desc);
create index if not exists together_scene_episodes_location_idx on public.together_scene_episodes(location_id,ended_at desc) where location_id is not null;
alter table public.together_scene_episodes enable row level security;
drop policy if exists together_scene_episodes_own_read on public.together_scene_episodes;
create policy together_scene_episodes_own_read on public.together_scene_episodes for select to authenticated using(user_id=auth.uid());
grant select on public.together_scene_episodes to authenticated;

alter table public.together_memories add column if not exists episode_id uuid references public.together_scene_episodes(id) on delete set null;
create index if not exists together_memories_episode_v2_idx on public.together_memories(episode_id) where episode_id is not null;
alter table public.together_moments add column if not exists episode_id uuid references public.together_scene_episodes(id) on delete set null;
create index if not exists together_moments_episode_v2_idx on public.together_moments(episode_id) where episode_id is not null;

create table if not exists public.together_companion_user_patterns(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  pattern_key text not null,
  category text not null check(category in('activity_preference','location_preference','social_energy','planning_style','competition_play','music_choice','food_choice','conversation_pacing')),
  summary text not null,
  confidence numeric(5,4) not null default .5 check(confidence between 0 and 1),
  support_count integer not null default 0 check(support_count >= 0),
  supporting_source_ids uuid[] not null default '{}'::uuid[],
  first_supported_at timestamptz,
  last_supported_at timestamptz,
  status text not null default 'candidate' check(status in('candidate','active','contradicted','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_instance_id,pattern_key)
);
create index if not exists together_companion_user_patterns_active_idx on public.together_companion_user_patterns(character_instance_id,status,confidence desc);
alter table public.together_companion_user_patterns enable row level security;
drop policy if exists together_companion_user_patterns_own_read on public.together_companion_user_patterns;
create policy together_companion_user_patterns_own_read on public.together_companion_user_patterns for select to authenticated using(user_id=auth.uid());
grant select on public.together_companion_user_patterns to authenticated;

create table if not exists public.together_emotional_residue(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null unique references public.together_character_instances(id) on delete cascade,
  tone text not null,
  valence numeric(5,4) not null default 0 check(valence between -1 and 1),
  intensity numeric(5,4) not null check(intensity between 0 and 1),
  source_type text not null check(source_type in('message','scene','plan','date','moment','life_event','manual')),
  source_id uuid,
  started_at timestamptz not null default now(),
  half_life_minutes integer not null check(half_life_minutes between 1 and 10080),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists together_emotional_residue_active_idx on public.together_emotional_residue(character_instance_id,expires_at) where intensity >= .08;
alter table public.together_emotional_residue enable row level security;
drop policy if exists together_emotional_residue_own_read on public.together_emotional_residue;
create policy together_emotional_residue_own_read on public.together_emotional_residue for select to authenticated using(user_id=auth.uid());
grant select on public.together_emotional_residue to authenticated;

comment on table public.together_scene_episodes is 'One idempotent consolidated shared experience per completed scene session.';
comment on table public.together_companion_user_patterns is 'Cautious, character-scoped behavioral understanding derived only from repeated evidence.';
comment on table public.together_emotional_residue is 'Short-lived emotional continuity; major conflict remains owned by Relationship Engine.';

commit;
