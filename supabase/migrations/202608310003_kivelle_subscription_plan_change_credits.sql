begin;

-- Subscription credits can be clamped when a member moves to a plan with a
-- lower rollover cap. Keep that reduction auditable and restore it when the
-- member moves back to a higher-cap plan during the same benefit month.
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
  benefit_cycle text;
  current_benefit_month text;
  removed_for_lower_cap integer=0;
  already_restored integer=0;
  restore_amount integer=0;
begin
  if p_cap < 0 or p_grace_days < 0 then raise exception 'invalid subscription credit lifecycle'; end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  previous=account.subscription_balance;
  benefit_cycle=account.subscription_grant_cycle;
  current_benefit_month=to_char(p_now at time zone 'utc','YYYY-MM');

  if p_paid_active then
    -- Only restore reductions from this benefit month and only after moving to
    -- a cap higher than the cap that caused the reduction. Spending never
    -- creates a restoration, and old rollover reductions stay final.
    if benefit_cycle is not null and right(benefit_cycle,7)=current_benefit_month then
      select coalesce(-sum(subscription_delta),0)::integer into removed_for_lower_cap
      from public.together_credit_ledger
      where user_id=p_user_id
        and event_type='adjustment'
        and subscription_delta<0
        and metadata->>'reason'='tier_cap_reduced'
        and metadata->>'benefitCycle'=benefit_cycle
        and metadata->>'cap' ~ '^[0-9]+$'
        and (metadata->>'cap')::integer<p_cap;

      select coalesce(sum(subscription_delta),0)::integer into already_restored
      from public.together_credit_ledger
      where user_id=p_user_id
        and event_type='adjustment'
        and subscription_delta>0
        and metadata->>'reason'='tier_cap_restored'
        and metadata->>'benefitCycle'=benefit_cycle;

      restore_amount=least(
        greatest(0,removed_for_lower_cap-already_restored),
        greatest(0,p_cap-previous)
      );
    end if;

    if restore_amount>0 then
      ledger_key='subscription-lifecycle-restore:'||benefit_cycle||':cap-'||p_cap::text||':removed-'||removed_for_lower_cap::text||':restored-'||already_restored::text;
      insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
      values(
        p_user_id,
        'adjustment',
        restore_amount,
        ledger_key,
        'subscription_credit_account',
        p_user_id::text,
        jsonb_build_object(
          'reason','tier_cap_restored',
          'previousBalance',previous,
          'newBalance',previous+restore_amount,
          'cap',p_cap,
          'benefitCycle',benefit_cycle,
          'removedForLowerCap',removed_for_lower_cap,
          'alreadyRestored',already_restored
        )
      ) on conflict(user_id,idempotency_key) do nothing;
      previous=previous+restore_amount;
    end if;

    next_balance=least(previous,p_cap);
    expiry=null;
    reason=case
      when next_balance<previous then 'tier_cap_reduced'
      when restore_amount>0 then 'tier_cap_restored'
      else 'paid_access_active'
    end;
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
    values(
      p_user_id,
      'adjustment',
      next_balance-previous,
      ledger_key,
      'subscription_credit_account',
      p_user_id::text,
      jsonb_build_object(
        'reason',reason,
        'previousBalance',previous,
        'newBalance',next_balance,
        'cap',p_cap,
        'expiresAt',expiry,
        'benefitCycle',benefit_cycle
      )
    );
  end if;

  return jsonb_build_object(
    'subscriptionBalance',account.subscription_balance,
    'permanentBalance',account.permanent_balance,
    'total',account.subscription_balance+account.permanent_balance,
    'expiresAt',account.subscription_expires_at,
    'reason',reason,
    'restored',restore_amount
  );
end $$;

revoke all on function public.kivelle_reconcile_subscription_credits(uuid,integer,boolean,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_subscription_credits(uuid,integer,boolean,integer,timestamptz) to service_role;

-- Guard lifecycle reconciliation against a request that resolved an older tier
-- immediately before a newer webhook changed the authoritative entitlement.
create or replace function public.kivelle_reconcile_subscription_credits(
  p_user_id uuid,
  p_expected_tier text,
  p_cap integer,
  p_paid_active boolean,
  p_grace_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  current_tier text;
  account public.together_credit_accounts;
begin
  if p_expected_tier not in('free','kivelle_plus','kivelle_max') then raise exception 'invalid expected subscription tier'; end if;
  select tier into current_tier from public.together_entitlements where user_id=p_user_id;
  if current_tier is distinct from p_expected_tier then
    select * into account from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object(
      'stale',true,
      'expectedTier',p_expected_tier,
      'currentTier',current_tier,
      'subscriptionBalance',coalesce(account.subscription_balance,0),
      'permanentBalance',coalesce(account.permanent_balance,0),
      'total',coalesce(account.subscription_balance,0)+coalesce(account.permanent_balance,0)
    );
  end if;
  return public.kivelle_reconcile_subscription_credits(p_user_id,p_cap,p_paid_active,p_grace_days,p_now)||jsonb_build_object('stale',false);
end $$;

revoke all on function public.kivelle_reconcile_subscription_credits(uuid,text,integer,boolean,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_subscription_credits(uuid,text,integer,boolean,integer,timestamptz) to service_role;

-- Monthly target grants use the net benefit delivered in the cycle. A later
-- lifecycle reduction can therefore be restored, while ordinary spending can
-- never trigger another grant. Replays remain idempotent.
create or replace function public.kivelle_grant_subscription_credit_target(
  p_user_id uuid,
  p_target integer,
  p_cap integer,
  p_cycle text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  account public.together_credit_accounts;
  existing public.together_credit_ledger;
  gross_granted integer;
  lifecycle_delta integer;
  already_granted integer;
  actual integer;
  ledger_key text;
  latest_reduction public.together_credit_ledger;
begin
  if p_target<=0 or p_cap<0 or nullif(p_cycle,'') is null then raise exception 'invalid subscription credit target'; end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  select * into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;

  select coalesce(sum(greatest(subscription_delta,0)),0)::integer into gross_granted
  from public.together_credit_ledger
  where user_id=p_user_id and event_type='subscription_grant' and metadata->>'cycle'=p_cycle;

  select coalesce(sum(subscription_delta),0)::integer into lifecycle_delta
  from public.together_credit_ledger
  where user_id=p_user_id
    and event_type='adjustment'
    and metadata->>'benefitCycle'=p_cycle
    and metadata->>'reason' in('tier_cap_reduced','tier_cap_restored','post_subscription_grace_expired');

  already_granted=greatest(0,gross_granted+lifecycle_delta);
  actual=greatest(0,least(p_target-already_granted,p_cap-account.subscription_balance));

  if existing.id is not null then
    if actual<=0 then
      return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'alreadyGranted',already_granted);
    end if;
    select * into latest_reduction
    from public.together_credit_ledger
    where user_id=p_user_id
      and event_type='adjustment'
      and subscription_delta<0
      and metadata->>'benefitCycle'=p_cycle
      and metadata->>'reason' in('tier_cap_reduced','post_subscription_grace_expired')
      and created_at>=existing.created_at
    order by created_at desc,id desc limit 1;
    if latest_reduction.id is null then
      return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'alreadyGranted',already_granted);
    end if;
    ledger_key=p_idempotency_key||':restore:'||latest_reduction.id::text;
    if exists(select 1 from public.together_credit_ledger where user_id=p_user_id and idempotency_key=ledger_key) then
      return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'alreadyGranted',already_granted);
    end if;
  else
    ledger_key=p_idempotency_key;
  end if;

  update public.together_credit_accounts
    set subscription_balance=subscription_balance+actual,subscription_grant_cycle=p_cycle,updated_at=now()
    where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,metadata)
  values(
    p_user_id,
    'subscription_grant',
    actual,
    ledger_key,
    p_metadata||jsonb_build_object(
      'cycle',p_cycle,
      'targetGrant',p_target,
      'alreadyGranted',already_granted,
      'grossGranted',gross_granted,
      'lifecycleDelta',lifecycle_delta,
      'cap',p_cap,
      'restoredAfterAdjustment',existing.id is not null
    )
  );
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'granted',actual,'alreadyGranted',already_granted);
end $$;

revoke all on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) to service_role;

-- Stripe events can arrive concurrently or out of order. Apply the normalized
-- subscription snapshot under a row lock and reject an older provider event.
create or replace function public.kivelle_sync_billing_subscription_state(
  p_user_id uuid,
  p_provider text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_product_id text,
  p_provider_price_id text,
  p_plan_key text,
  p_status text,
  p_billing_interval text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_access_ends_at timestamptz,
  p_last_provider_event_created_at bigint,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  existing public.together_billing_subscriptions;
  saved public.together_billing_subscriptions;
begin
  if p_provider not in('stripe','revenuecat','configured') or nullif(p_provider_subscription_id,'') is null then raise exception 'invalid billing subscription identity'; end if;
  if p_plan_key not in('kivelle_plus','kivelle_max') then raise exception 'invalid billing subscription plan'; end if;
  if p_status not in('trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired') then raise exception 'invalid billing subscription status'; end if;
  if p_billing_interval not in('monthly','annual') then raise exception 'invalid billing interval'; end if;

  select * into existing from public.together_billing_subscriptions
  where provider=p_provider and provider_subscription_id=p_provider_subscription_id for update;
  if existing.id is not null and existing.user_id<>p_user_id then raise exception 'billing subscription owner mismatch'; end if;
  if existing.id is not null
    and existing.last_provider_event_created_at is not null
    and p_last_provider_event_created_at is not null
    and p_last_provider_event_created_at<existing.last_provider_event_created_at then
    return jsonb_build_object('applied',false,'stale',true,'lastProviderEventCreatedAt',existing.last_provider_event_created_at);
  end if;

  insert into public.together_billing_subscriptions(
    user_id,provider,provider_customer_id,provider_subscription_id,provider_product_id,provider_price_id,
    plan_key,status,billing_interval,current_period_start,current_period_end,trial_end,cancel_at_period_end,
    canceled_at,access_ends_at,last_provider_event_created_at,metadata,updated_at
  ) values(
    p_user_id,p_provider,p_provider_customer_id,p_provider_subscription_id,p_provider_product_id,p_provider_price_id,
    p_plan_key,p_status,p_billing_interval,p_current_period_start,p_current_period_end,p_trial_end,p_cancel_at_period_end,
    p_canceled_at,p_access_ends_at,p_last_provider_event_created_at,p_metadata,now()
  )
  on conflict(provider,provider_subscription_id) do update set
    provider_customer_id=excluded.provider_customer_id,
    provider_product_id=excluded.provider_product_id,
    provider_price_id=excluded.provider_price_id,
    plan_key=excluded.plan_key,
    status=excluded.status,
    billing_interval=excluded.billing_interval,
    current_period_start=excluded.current_period_start,
    current_period_end=excluded.current_period_end,
    trial_end=excluded.trial_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    canceled_at=excluded.canceled_at,
    access_ends_at=excluded.access_ends_at,
    last_provider_event_created_at=excluded.last_provider_event_created_at,
    metadata=excluded.metadata,
    updated_at=excluded.updated_at
  returning * into saved;
  return jsonb_build_object('applied',true,'stale',false,'subscriptionId',saved.id);
end $$;

revoke all on function public.kivelle_sync_billing_subscription_state(uuid,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_sync_billing_subscription_state(uuid,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,bigint,jsonb) to service_role;

-- Older lifecycle rows did not record their benefit cycle. Backfill only when
-- the row occurred in the account's still-current grant month.
update public.together_credit_ledger ledger
set metadata=ledger.metadata||jsonb_build_object('benefitCycle',account.subscription_grant_cycle)
from public.together_credit_accounts account
where ledger.user_id=account.user_id
  and ledger.event_type='adjustment'
  and ledger.subscription_delta<0
  and ledger.metadata->>'reason' in('tier_cap_reduced','post_subscription_grace_expired')
  and ledger.metadata->>'benefitCycle' is null
  and account.subscription_grant_cycle is not null
  and right(account.subscription_grant_cycle,7)=to_char(ledger.created_at at time zone 'utc','YYYY-MM');

commit;
