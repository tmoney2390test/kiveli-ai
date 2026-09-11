begin;

alter table public.together_ai_usage_events drop constraint if exists together_ai_usage_events_provider_check;
alter table public.together_ai_usage_events add constraint together_ai_usage_events_provider_check
  check (provider in ('openai','xai','gemini','venice','deterministic'));

-- Server-owned rollout switch. It is deliberately disabled until deployment verification.
create table if not exists public.kivelle_dialogue_experiments (
  id text primary key check (id = 'venice-owner-chat'),
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0)
);
alter table public.kivelle_dialogue_experiments enable row level security;
revoke all on public.kivelle_dialogue_experiments from public, anon, authenticated;
grant select, insert, update on public.kivelle_dialogue_experiments to service_role;
insert into public.kivelle_dialogue_experiments(id) values ('venice-owner-chat') on conflict (id) do nothing;

commit;
