begin;

create table if not exists public.together_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid references public.together_continuities(id) on delete set null,
  conversation_id uuid references public.together_conversations(id) on delete set null,
  character_instance_id uuid references public.together_character_instances(id) on delete set null,
  correlation_id text,
  provider text not null check (provider in ('openai','xai','gemini','deterministic')),
  model text not null,
  operation text not null,
  route_reason text,
  content_mode text,
  subscription_tier text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(18,10),
  provider_cost_usd numeric(18,10),
  provider_cost_ticks bigint,
  cache_hit boolean not null default false,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  success boolean not null,
  http_status smallint,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.together_ai_usage_events is 'Server-only normalized AI request usage, routing, latency, and COGS telemetry. Never stores prompts or message text.';

create index if not exists together_ai_usage_created_idx on public.together_ai_usage_events (created_at desc);
create index if not exists together_ai_usage_provider_created_idx on public.together_ai_usage_events (provider, created_at desc);
create index if not exists together_ai_usage_model_created_idx on public.together_ai_usage_events (model, created_at desc);
create index if not exists together_ai_usage_operation_created_idx on public.together_ai_usage_events (operation, created_at desc);
create index if not exists together_ai_usage_user_created_idx on public.together_ai_usage_events (user_id, created_at desc);
create index if not exists together_ai_usage_conversation_idx on public.together_ai_usage_events (conversation_id, created_at desc);
create index if not exists together_ai_usage_correlation_idx on public.together_ai_usage_events (correlation_id, created_at);
create index if not exists together_ai_usage_tier_created_idx on public.together_ai_usage_events (subscription_tier, created_at desc);

alter table public.together_ai_usage_events enable row level security;
revoke all on public.together_ai_usage_events from anon, authenticated;
grant all on public.together_ai_usage_events to service_role;

commit;
