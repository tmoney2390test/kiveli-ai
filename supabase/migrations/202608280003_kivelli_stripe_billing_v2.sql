begin;

-- Provider records remain distinct while Kivelle resolves one effective internal
-- entitlement. This prevents overlapping Stripe web and RevenueCat native
-- subscriptions from double-granting benefits.
create table if not exists public.together_billing_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in('stripe','revenuecat','configured')),
  provider_customer_id text,
  provider_subscription_id text not null,
  provider_product_id text,
  provider_price_id text,
  plan_key text not null check(plan_key in('kivelle_plus','kivelle_max')),
  status text not null check(status in('trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')),
  billing_interval text not null check(billing_interval in('monthly','annual')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  access_ends_at timestamptz,
  last_provider_event_created_at bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_subscription_id)
);
create index if not exists together_billing_subscriptions_user_status_idx
  on public.together_billing_subscriptions(user_id,status,current_period_end desc);
create index if not exists together_billing_subscriptions_annual_grants_idx
  on public.together_billing_subscriptions(billing_interval,current_period_start,current_period_end)
  where status in('active','trialing','past_due');
alter table public.together_billing_subscriptions enable row level security;
revoke all on public.together_billing_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.together_billing_subscriptions to service_role;

alter table public.together_billing_events
  add column if not exists attempts integer not null default 1 check(attempts>0),
  add column if not exists last_attempt_at timestamptz not null default now();

alter table public.together_credit_ledger
  add column if not exists billing_provider text,
  add column if not exists stripe_event_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_subscription_id text;
create index if not exists together_credit_ledger_stripe_payment_idx
  on public.together_credit_ledger(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists together_credit_ledger_stripe_checkout_idx
  on public.together_credit_ledger(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index if not exists together_credit_ledger_stripe_event_uidx
  on public.together_credit_ledger(stripe_event_id)
  where stripe_event_id is not null;

create table if not exists public.together_billing_adjustments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_ledger_id uuid not null references public.together_credit_ledger(id) on delete restrict,
  provider text not null check(provider in('stripe','configured')),
  provider_event_id text not null,
  reason text not null check(reason in('refund','dispute','chargeback')),
  target_credits integer not null check(target_credits>=0),
  applied_credits integer not null check(applied_credits>=0),
  unrecovered_credits integer not null check(unrecovered_credits>=0),
  status text not null check(status in('applied','pending_review')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
create index if not exists together_billing_adjustments_review_idx
  on public.together_billing_adjustments(status,created_at)
  where status='pending_review';
alter table public.together_billing_adjustments enable row level security;
revoke all on public.together_billing_adjustments from public,anon,authenticated;
grant select,insert,update,delete on public.together_billing_adjustments to service_role;

-- Revoke purchased credits without touching subscription credits or allowing a
-- negative balance. Any already-consumed portion is retained as an auditable
-- support review item instead of corrupting unrelated credit history.
create or replace function public.kivelle_apply_credit_purchase_reversal(
  p_user_id uuid,
  p_purchase_ledger_id uuid,
  p_target_credits integer,
  p_provider text,
  p_provider_event_id text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  purchase public.together_credit_ledger;
  account public.together_credit_accounts;
  prior_applied integer;
  needed integer;
  applied integer;
  unresolved integer;
  ledger_key text;
begin
  if p_target_credits<0 or p_provider not in('stripe','configured') or p_reason not in('refund','dispute','chargeback') then
    raise exception 'invalid credit purchase reversal';
  end if;
  if exists(select 1 from public.together_billing_adjustments where provider=p_provider and provider_event_id=p_provider_event_id) then
    select coalesce(sum(applied_credits),0) into prior_applied from public.together_billing_adjustments where purchase_ledger_id=p_purchase_ledger_id;
    return jsonb_build_object('idempotent',true,'appliedCredits',prior_applied);
  end if;
  select * into purchase from public.together_credit_ledger where id=p_purchase_ledger_id and user_id=p_user_id and event_type='purchase' for update;
  if purchase.id is null then raise exception 'credit purchase ledger entry not found'; end if;
  if p_target_credits>purchase.permanent_delta then raise exception 'credit reversal exceeds original purchase'; end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  select coalesce(sum(applied_credits),0) into prior_applied from public.together_billing_adjustments where purchase_ledger_id=p_purchase_ledger_id;
  needed=greatest(0,p_target_credits-prior_applied);
  applied=least(account.permanent_balance,needed);
  unresolved=greatest(0,p_target_credits-prior_applied-applied);
  if applied>0 then
    update public.together_credit_accounts set permanent_balance=permanent_balance-applied,updated_at=now() where user_id=p_user_id returning * into account;
    ledger_key='billing-reversal:'||p_provider||':'||p_provider_event_id;
    insert into public.together_credit_ledger(user_id,event_type,permanent_delta,idempotency_key,reference_type,reference_id,metadata,billing_provider,stripe_event_id)
    values(p_user_id,'adjustment',-applied,ledger_key,'credit_purchase',purchase.id::text,p_metadata||jsonb_build_object('reason',p_reason,'targetCredits',p_target_credits),p_provider,case when p_provider='stripe' then p_provider_event_id else null end)
    on conflict(user_id,idempotency_key) do nothing;
  end if;
  insert into public.together_billing_adjustments(user_id,purchase_ledger_id,provider,provider_event_id,reason,target_credits,applied_credits,unrecovered_credits,status,metadata)
  values(p_user_id,purchase.id,p_provider,p_provider_event_id,p_reason,p_target_credits,applied,unresolved,case when unresolved>0 then 'pending_review' else 'applied' end,p_metadata);
  return jsonb_build_object('appliedCredits',applied,'unrecoveredCredits',unresolved,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;
revoke all on function public.kivelle_apply_credit_purchase_reversal(uuid,uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_apply_credit_purchase_reversal(uuid,uuid,integer,text,text,text,jsonb) to service_role;

-- Preserve existing provider state during rollout. Webhooks replace these
-- projections with complete normalized rows as soon as provider events arrive.
insert into public.together_billing_subscriptions(user_id,provider,provider_customer_id,provider_subscription_id,provider_product_id,provider_price_id,plan_key,status,billing_interval,current_period_start,current_period_end,access_ends_at,metadata)
select user_id,
  case when billing_provider='stripe' then 'stripe' when revenuecat_app_user_id is not null then 'revenuecat' else 'configured' end,
  billing_customer_id,
  coalesce(billing_subscription_id,store_customer_id,'legacy-'||user_id::text),
  product_key,
  product_key,
  tier,
  case when coalesce(billing_status,'active') in('trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired') then coalesce(billing_status,'active') else 'active' end,
  case when metadata->>'billingInterval'='annual' then 'annual' else 'monthly' end,
  billing_period_start,
  billing_period_end,
  coalesce(expires_at,billing_period_end),
  jsonb_build_object('backfilledFrom','together_entitlements')
from public.together_entitlements
where tier in('kivelle_plus','kivelle_max')
on conflict(provider,provider_subscription_id) do nothing;

comment on table public.together_billing_subscriptions is 'Normalized provider subscription state. Kivelle resolves one effective entitlement across Stripe web and RevenueCat native purchases.';
comment on table public.together_billing_adjustments is 'Append-only refund/dispute reconciliation. Unrecoverable consumed purchased credits are flagged for support review.';

commit;
