begin;

update public.together_profiles
set content_preferences=coalesce(content_preferences,'{}'::jsonb)||jsonb_build_object(
  'suggestiveMediaEnabled',case when jsonb_typeof(content_preferences->'suggestiveMediaEnabled')='boolean' then (content_preferences->>'suggestiveMediaEnabled')::boolean else false end,
  'matureMediaEnabled',case when jsonb_typeof(content_preferences->'matureMediaEnabled')='boolean' then (content_preferences->>'matureMediaEnabled')::boolean else false end,
  'explicitMediaEnabled',case when jsonb_typeof(content_preferences->'explicitMediaEnabled')='boolean' then (content_preferences->>'explicitMediaEnabled')::boolean else false end,
  'adultVideoEnabled',case when jsonb_typeof(content_preferences->'adultVideoEnabled')='boolean' then (content_preferences->>'adultVideoEnabled')::boolean else false end
);

create table if not exists public.together_media_benchmark_runs(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check(status in('draft','running','completed','failed')),
  route_ids text[] not null default '{}',
  scenario_keys text[] not null default '{}',
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.together_media_benchmark_results(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.together_media_benchmark_runs(id) on delete cascade,
  route_id text not null,
  scenario_key text not null,
  provider_request_id text,
  status text not null check(status in('queued','processing','ready','failed')),
  identity_score numeric,
  location_score numeric,
  prompt_score numeric,
  artifact_score numeric,
  latency_ms integer,
  estimated_cost numeric,
  reviewer_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,route_id,scenario_key)
);
alter table public.together_media_benchmark_runs enable row level security;
alter table public.together_media_benchmark_results enable row level security;
revoke all on public.together_media_benchmark_runs,public.together_media_benchmark_results from public,anon,authenticated;
grant select,insert,update,delete on public.together_media_benchmark_runs,public.together_media_benchmark_results to service_role;

commit;
