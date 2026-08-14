-- Historical Moment context and a single media entity usable by chat, dates, profiles, and places.
alter table public.together_moments add column if not exists relationship_stage_at_creation text;
alter table public.together_moments add column if not exists date_session_id uuid references public.together_date_sessions(id) on delete set null;
alter table public.together_moments add column if not exists source_message_ids uuid[] not null default '{}';
create index if not exists together_moments_character_occurred_idx on public.together_moments(character_instance_id,occurred_at desc);

create table if not exists public.together_generated_media(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  life_event_id uuid references public.together_life_events(id) on delete set null,
  date_session_id uuid references public.together_date_sessions(id) on delete set null,
  moment_id uuid references public.together_moments(id) on delete set null,
  message_id uuid references public.together_messages(id) on delete set null,
  media_type text not null default 'image' check(media_type='image'),content_level text not null default 'standard' check(content_level in ('standard','romance','mature','explicit')),
  provider text,status text not null default 'queued' check(status in ('queued','generating','ready','failed')),
  storage_path text,width integer,height integer,metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists together_generated_media_character_idx on public.together_generated_media(user_id,character_instance_id,created_at desc);
alter table public.together_generated_media enable row level security;
create policy "Users read their generated media" on public.together_generated_media for select using (auth.uid()=user_id);
comment on table public.together_generated_media is 'Canonical media references. Generation requires a configured server-side image provider; rows may safely remain queued.';
