begin;

-- Purchased/welcome credits remain permanent. Subscription credits receive a
-- bounded grace period after paid access ends and are clamped on downgrades.
alter table public.together_credit_accounts
  add column if not exists subscription_expires_at timestamptz;

create or replace function public.kivelle_reconcile_subscription_credits(
  p_user_id uuid,
  p_cap integer,
  p_paid_active boolean,
  p_grace_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  account public.together_credit_accounts;
  previous integer;
  next_balance integer;
  expiry timestamptz;
  reason text;
  ledger_key text;
begin
  if p_cap < 0 or p_grace_days < 0 then raise exception 'invalid subscription credit lifecycle'; end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  previous=account.subscription_balance;

  if p_paid_active then
    next_balance=least(previous,p_cap);
    expiry=null;
    reason=case when next_balance<previous then 'tier_cap_reduced' else 'paid_access_active' end;
  else
    expiry=account.subscription_expires_at;
    if previous>0 and expiry is null then expiry=p_now+make_interval(days=>p_grace_days); end if;
    next_balance=case when expiry is not null and expiry<=p_now then 0 else previous end;
    reason=case when next_balance<previous then 'post_subscription_grace_expired' else 'post_subscription_grace' end;
  end if;

  update public.together_credit_accounts
    set subscription_balance=next_balance,subscription_expires_at=expiry,updated_at=p_now
    where user_id=p_user_id returning * into account;

  if next_balance<>previous then
    ledger_key='subscription-lifecycle:'||gen_random_uuid()::text;
    insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
    values(p_user_id,'adjustment',next_balance-previous,ledger_key,'subscription_credit_account',p_user_id::text,jsonb_build_object('reason',reason,'previousBalance',previous,'newBalance',next_balance,'cap',p_cap,'expiresAt',expiry))
    on conflict(user_id,idempotency_key) do nothing;
  end if;

  return jsonb_build_object('subscriptionBalance',account.subscription_balance,'permanentBalance',account.permanent_balance,'total',account.subscription_balance+account.permanent_balance,'expiresAt',account.subscription_expires_at,'reason',reason);
end $$;

revoke all on function public.kivelle_reconcile_subscription_credits(uuid,integer,boolean,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_subscription_credits(uuid,integer,boolean,integer,timestamptz) to service_role;

-- Reserve monthly Date-souvenir benefit slots transactionally so concurrent
-- Date completions cannot exceed the tier allowance.
create table if not exists public.together_included_media_benefit_claims(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  benefit_type text not null check(benefit_type='date_completion_photo'),
  benefit_month date not null,
  slot integer not null check(slot>0),
  date_session_id uuid not null references public.together_date_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,benefit_type,benefit_month,slot),
  unique(user_id,benefit_type,date_session_id)
);
create index if not exists together_included_media_benefit_claims_user_month_idx on public.together_included_media_benefit_claims(user_id,benefit_month,benefit_type);
alter table public.together_included_media_benefit_claims enable row level security;
revoke all on public.together_included_media_benefit_claims from public,anon,authenticated;
grant select,insert,update,delete on public.together_included_media_benefit_claims to service_role;

create or replace function public.kivelle_claim_included_date_photo(
  p_user_id uuid,
  p_date_session_id uuid,
  p_monthly_limit integer,
  p_now timestamptz default now()
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  claim_month date=date_trunc('month',p_now at time zone 'utc')::date;
  existing_slot integer;
  claimed integer;
begin
  if p_monthly_limit<=0 then return false; end if;
  if not exists(select 1 from public.together_date_sessions where id=p_date_session_id and user_id=p_user_id and status='completed') then
    raise exception using errcode='P0001',message='COMPLETED_DATE_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':date_completion_photo:'||claim_month::text,0));
  select slot into existing_slot from public.together_included_media_benefit_claims where user_id=p_user_id and benefit_type='date_completion_photo' and date_session_id=p_date_session_id;
  if existing_slot is not null then return true; end if;
  select count(*)::integer into claimed from public.together_included_media_benefit_claims where user_id=p_user_id and benefit_type='date_completion_photo' and benefit_month=claim_month;
  if claimed>=p_monthly_limit then return false; end if;
  insert into public.together_included_media_benefit_claims(user_id,benefit_type,benefit_month,slot,date_session_id)
  values(p_user_id,'date_completion_photo',claim_month,claimed+1,p_date_session_id);
  return true;
end $$;

revoke all on function public.kivelle_claim_included_date_photo(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_claim_included_date_photo(uuid,uuid,integer,timestamptz) to service_role;

commit;
