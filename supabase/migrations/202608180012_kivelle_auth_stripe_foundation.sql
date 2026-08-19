-- Provider-ready identity and Stripe billing foundations. OAuth credentials
-- remain in Supabase Auth; Stripe secrets remain in Edge Function secrets.

alter table public.together_entitlements
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_status text;

create unique index if not exists together_entitlements_stripe_customer_uidx
  on public.together_entitlements(billing_customer_id)
  where billing_provider='stripe' and billing_customer_id is not null;

create unique index if not exists together_entitlements_stripe_subscription_uidx
  on public.together_entitlements(billing_subscription_id)
  where billing_provider='stripe' and billing_subscription_id is not null;

create table if not exists public.together_billing_customers(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in('stripe')),
  customer_id text not null,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider),
  unique(provider,customer_id)
);

create table if not exists public.together_billing_events(
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider in('stripe','configured')),
  event_id text not null,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'processing' check(status in('processing','processed','ignored','failed')),
  payload_summary jsonb not null default '{}'::jsonb,
  error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,event_id)
);

create index if not exists together_billing_events_user_created_idx
  on public.together_billing_events(user_id,created_at desc);
create index if not exists together_billing_events_retry_idx
  on public.together_billing_events(status,updated_at)
  where status in('processing','failed');

alter table public.together_billing_customers enable row level security;
alter table public.together_billing_events enable row level security;

drop policy if exists together_billing_customers_own_read on public.together_billing_customers;
create policy together_billing_customers_own_read on public.together_billing_customers
  for select to authenticated using(user_id=auth.uid());

grant select on public.together_billing_customers to authenticated;
grant all on public.together_billing_customers,public.together_billing_events to service_role;

comment on table public.together_billing_customers is 'Provider customer identifiers; no card or payment-method data is stored in Kivelle.';
comment on table public.together_billing_events is 'Content-free idempotency and audit ledger for signed billing webhooks.';
