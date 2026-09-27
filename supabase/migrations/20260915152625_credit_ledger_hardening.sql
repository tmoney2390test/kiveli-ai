-- Serialize wallet retries and tie a refund to its original charge.
CREATE OR REPLACE FUNCTION public.kivelle_grant_permanent_credits(p_user_id uuid, p_amount integer, p_event_type text, p_idempotency_key text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare account public.together_credit_accounts; existing uuid;
begin
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if p_amount<=0 then raise exception 'credit grant must be positive'; end if;
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('idempotent',true,'permanentBalance',coalesce(account.permanent_balance,0),'subscriptionBalance',coalesce(account.subscription_balance,0)); end if;
  update public.together_credit_accounts set permanent_balance=permanent_balance+p_amount,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,p_event_type,p_amount,p_idempotency_key,p_reference_type,p_reference_id,p_metadata);
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $function$
;
CREATE OR REPLACE FUNCTION public.kivelle_spend_credits(p_user_id uuid, p_amount integer, p_idempotency_key text, p_reference_type text, p_reference_id text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare account public.together_credit_accounts; existing public.together_credit_ledger; sub_spend integer; permanent_spend integer; tx uuid;
begin
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if p_amount<=0 then raise exception 'credit spend must be positive'; end if;
  select * into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing.id is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('transactionId',existing.id,'idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance); end if;
  if account.subscription_expires_at<=now() and account.subscription_balance>0 then
    insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
    values(p_user_id,'adjustment',-account.subscription_balance,'spend-expiry:'||gen_random_uuid()::text,'subscription_credit_account',p_user_id::text,jsonb_build_object('reason','post_subscription_grace_expired','benefitCycle',account.subscription_grant_cycle));
    update public.together_credit_accounts set subscription_balance=0,updated_at=now() where user_id=p_user_id returning * into account;
  end if;
  if account.permanent_balance+account.subscription_balance<p_amount then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS'; end if;
  sub_spend=least(account.subscription_balance,p_amount); permanent_spend=p_amount-sub_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-sub_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'spend',-permanent_spend,-sub_spend,p_idempotency_key,p_reference_type,p_reference_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('subscriptionGrantCycle',account.subscription_grant_cycle,'subscriptionExpiresAt',account.subscription_expires_at)) returning id into tx;
  return jsonb_build_object('transactionId',tx,'permanentSpent',permanent_spend,'subscriptionSpent',sub_spend,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $function$
;
create or replace function public.kivelle_refund_credit_transaction(p_user_id uuid,p_transaction_id uuid,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare spend public.together_credit_ledger; account public.together_credit_accounts; existing public.together_credit_ledger;
 permanent_refund integer; subscription_refund integer; original_subscription integer; cap integer; tier text; paid boolean;
begin
 -- Same lock order as subscription reconciliation: entitlement, then wallet.
 select e.tier,(e.expires_at is null or e.expires_at>now()) into tier,paid from public.together_entitlements e where e.user_id=p_user_id for share;
 insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select * into account from public.together_credit_accounts where user_id=p_user_id for update;
 select * into spend from public.together_credit_ledger where id=p_transaction_id and user_id=p_user_id and event_type='spend';
 if spend.id is null then raise exception 'spend transaction not found'; end if;
 if spend.reference_type='context_quote' then raise exception 'CONTEXT_REFUND_REQUIRES_SETTLEMENT'; end if;
 select * into existing from public.together_credit_ledger where user_id=p_user_id
   and event_type='refund' and reference_type='credit_transaction' and reference_id=p_transaction_id::text limit 1;
 if existing.id is not null then return jsonb_build_object('idempotent',true,'refunded',0,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance); end if;
 if exists(select 1 from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key) then raise exception 'CREDIT_REFUND_KEY_CONFLICT'; end if;
 permanent_refund=greatest(0,-spend.permanent_delta);
 original_subscription=greatest(0,-spend.subscription_delta);
 cap=case when paid and tier in ('kivelle_max','premium') then 2400 when paid and tier in ('kivelle_plus','plus') then 1000 else null end;
 subscription_refund=case when account.subscription_expires_at<=now() then 0
   when cap is not null then least(original_subscription,greatest(0,cap-account.subscription_balance))
   else original_subscription end;
 -- Failed actions must not lose their refund at a renewal/cap/expiry boundary.
 -- Only the portion that cannot fit the original bucket becomes permanent.
 permanent_refund=permanent_refund+original_subscription-subscription_refund;
 update public.together_credit_accounts set permanent_balance=permanent_balance+permanent_refund,
   subscription_balance=subscription_balance+subscription_refund,updated_at=now() where user_id=p_user_id returning * into account;
 insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
 values(p_user_id,'refund',permanent_refund,subscription_refund,p_idempotency_key,'credit_transaction',p_transaction_id::text,
 coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('originalSubscriptionRefund',original_subscription,'protectedPermanentRefund',original_subscription-subscription_refund));
 return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'refunded',permanent_refund+subscription_refund);
end $$;
create unique index if not exists together_credit_refund_charge_idx on public.together_credit_ledger(user_id,reference_id)
 where event_type='refund' and reference_type='credit_transaction';
revoke all on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.kivelle_grant_subscription_credit_target(p_user_id uuid, p_target integer, p_cap integer, p_cycle text, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- A delayed provider event must not rewind the active benefit cycle.
  if account.subscription_grant_cycle like 'benefit:____-__' and p_cycle like 'benefit:____-__'
    and p_cycle<account.subscription_grant_cycle then
    return jsonb_build_object('stale',true,'granted',0,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
  end if;
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
end $function$
;

revoke all on function public.kivelle_spend_credits(uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_spend_credits(uuid,integer,text,text,text,jsonb) to service_role;
revoke all on function public.kivelle_grant_permanent_credits(uuid,integer,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_grant_permanent_credits(uuid,integer,text,text,text,text,jsonb) to service_role;
revoke all on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) to service_role;

-- Terminal media can outlive a transient refund failure. Retry only confirmed
-- failed requests, using the original charge as the exact-once identity.
create or replace function public.kivelle_repair_failed_media_refunds() returns integer
language plpgsql security definer set search_path=public as $$
declare media public.together_generated_media; charge public.together_credit_ledger; repaired integer:=0;
begin
 for media in select m.* from public.together_generated_media m
 where m.status='failed' and m.updated_at<now()-interval '5 minutes'
   and m.metadata->>'creditTransactionId' is not null
   and coalesce(m.metadata->>'creditRefunded','false')<>'true'
 order by m.updated_at limit 50 for update skip locked
 loop
   select * into charge from public.together_credit_ledger where id::text=media.metadata->>'creditTransactionId'
     and user_id=media.user_id and event_type='spend';
   if charge.id is null or charge.reference_type='context_quote' then continue; end if;
   if exists(select 1 from public.together_generated_media other where other.id<>media.id
     and other.user_id=media.user_id and other.metadata->>'creditTransactionId'=charge.id::text
     and other.status<>'failed') then continue; end if;
   perform public.kivelle_refund_credit_transaction(media.user_id,charge.id,'refund:'||charge.id::text,
      jsonb_build_object('reason','failed_media_refund_recovery','mediaId',media.id));
   update public.together_generated_media set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('creditRefunded',true,'creditRefundedAt',now(),'refundRecovered',true),updated_at=now() where id=media.id;
   repaired:=repaired+1;
 end loop;
 return repaired;
end $$;
revoke all on function public.kivelle_repair_failed_media_refunds() from public,anon,authenticated;
grant execute on function public.kivelle_repair_failed_media_refunds() to service_role;

-- Scheduled recovery runs independently of the failed provider worker.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.schedule('kivelli-failed-media-credit-refunds','*/5 * * * *','select public.kivelle_repair_failed_media_refunds()');
 end if;
end $$;
