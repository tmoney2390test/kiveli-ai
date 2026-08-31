begin;

-- Hold the entitlement row stable through lifecycle reconciliation. If a
-- webhook is changing the tier concurrently, one transaction completes first
-- and the other either observes the new tier or is followed by its matching
-- reconciliation. A stale cap can no longer land after a newer tier update.
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
  select tier into current_tier
  from public.together_entitlements
  where user_id=p_user_id
  for share;
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

-- The pre-read row lock handles established subscriptions. The conflict
-- predicate additionally handles two first events racing before either row
-- exists, so the older event can never overwrite the newer event's snapshot.
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
  if p_last_provider_event_created_at is null or p_last_provider_event_created_at<=0 then raise exception 'invalid provider event timestamp'; end if;

  select * into existing from public.together_billing_subscriptions
  where provider=p_provider and provider_subscription_id=p_provider_subscription_id for update;
  if existing.id is not null and existing.user_id<>p_user_id then raise exception 'billing subscription owner mismatch'; end if;
  if existing.id is not null
    and existing.last_provider_event_created_at is not null
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
  where together_billing_subscriptions.last_provider_event_created_at is null
    or excluded.last_provider_event_created_at>=together_billing_subscriptions.last_provider_event_created_at
  returning * into saved;

  if saved.id is null then
    select * into existing from public.together_billing_subscriptions
    where provider=p_provider and provider_subscription_id=p_provider_subscription_id;
    return jsonb_build_object('applied',false,'stale',true,'lastProviderEventCreatedAt',existing.last_provider_event_created_at);
  end if;
  return jsonb_build_object('applied',true,'stale',false,'subscriptionId',saved.id);
end $$;

revoke all on function public.kivelle_sync_billing_subscription_state(uuid,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_sync_billing_subscription_state(uuid,text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,timestamptz,bigint,jsonb) to service_role;

commit;
