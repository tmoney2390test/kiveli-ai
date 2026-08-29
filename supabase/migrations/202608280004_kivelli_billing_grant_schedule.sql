-- Provider-neutral target grants serialize on the user's account row. This
-- prevents Stripe and RevenueCat events landing together from double-granting
-- the same advertised monthly benefit.
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
  existing uuid;
  already_granted integer;
  actual integer;
begin
  if p_target<=0 or p_cap<0 or nullif(p_cycle,'') is null then raise exception 'invalid subscription credit target'; end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then
    return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
  end if;
  select coalesce(sum(greatest(subscription_delta,0)),0)::integer into already_granted
    from public.together_credit_ledger
    where user_id=p_user_id and event_type='subscription_grant' and metadata->>'cycle'=p_cycle;
  actual=greatest(0,least(p_target-already_granted,p_cap-account.subscription_balance));
  update public.together_credit_accounts set subscription_balance=subscription_balance+actual,subscription_grant_cycle=p_cycle,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,metadata)
    values(p_user_id,'subscription_grant',actual,p_idempotency_key,p_metadata||jsonb_build_object('cycle',p_cycle,'targetGrant',p_target,'alreadyGranted',already_granted,'cap',p_cap));
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'granted',actual,'alreadyGranted',already_granted);
end $$;
revoke all on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_grant_subscription_credit_target(uuid,integer,integer,text,text,jsonb) to service_role;

-- Kivelli annual plans advertise a monthly credit benefit. A daily sweep is
-- intentionally idempotent and grants at most the current month's difference.
do $$
declare
  v_project_url text;
  v_secret text;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name='together_project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='kivelle_billing_grant_secret' limit 1;

  if exists(select 1 from cron.job where jobname='kivelli-annual-monthly-credit-grants') then
    perform cron.unschedule('kivelli-annual-monthly-credit-grants');
  end if;

  -- A migration remains safe in local/preview projects without Vault config.
  -- Reapply this migration's schedule block after adding both Vault secrets.
  if nullif(v_project_url,'') is not null and nullif(v_secret,'') is not null then
    perform cron.schedule(
      'kivelli-annual-monthly-credit-grants',
      '17 5 * * *',
      format($job$
        select net.http_post(
          url := %L || '/functions/v1/together-billing-grants',
          headers := jsonb_build_object('content-type','application/json','x-kivelle-billing-grant-secret',%L),
          body := '{}'::jsonb
        );
      $job$,v_project_url,v_secret)
    );
  end if;
end $$;
