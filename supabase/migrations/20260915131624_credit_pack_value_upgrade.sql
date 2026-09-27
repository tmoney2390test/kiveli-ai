-- Expand accepted amounts without rewriting historical receipts or balances.
alter table public.together_store_credit_purchases drop constraint together_store_credit_purchases_credits_check;
alter table public.together_store_credit_purchases add constraint together_store_credit_purchases_credits_check check(credits in (100,300,800,2000,250,700,1750,4500));
create or replace function public.kivelle_apply_store_credit_purchase(
  p_user_id uuid,p_store text,p_environment text,p_transaction_id text,
  p_product_id text,p_credits integer,p_refund boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  purchase public.together_store_credit_purchases;
  recovered integer;
  ledger_key text;
begin
  if p_store not in ('APP_STORE','PLAY_STORE') or p_environment not in ('SANDBOX','PRODUCTION')
    or length(p_transaction_id) not between 1 and 512 or p_credits not in (100,300,800,2000,250,700,1750,4500)
    or p_user_id is null or p_product_id is null or p_refund is null then
    raise exception 'Invalid store purchase';
  end if;
  insert into public.together_store_credit_purchases(store,environment,transaction_id,user_id,product_id,credits,status)
    values(p_store,p_environment,p_transaction_id,p_user_id,p_product_id,p_credits,'pending') on conflict do nothing;
  select * into purchase from public.together_store_credit_purchases
    where store=p_store and environment=p_environment and transaction_id=p_transaction_id for update;
  if purchase.user_id is distinct from p_user_id or purchase.product_id<>p_product_id then
    raise exception 'Store transaction ownership or product mismatch';
  end if;
  -- The first verified receipt is immutable, even if the catalog later changes.
  p_credits:=purchase.credits;
  ledger_key='store-credit:'||p_store||':'||p_environment||':'||p_transaction_id;
  if p_refund and purchase.status<>'refunded' then
    recovered=0;
    if purchase.status='granted' then
      select least(permanent_balance,p_credits) into recovered from public.together_credit_accounts where user_id=p_user_id for update;
      recovered=coalesce(recovered,0);
      update public.together_credit_accounts set permanent_balance=permanent_balance-recovered,updated_at=now() where user_id=p_user_id;
      insert into public.together_credit_ledger(user_id,event_type,permanent_delta,idempotency_key,reference_type,reference_id,metadata)
        values(p_user_id,'adjustment',-recovered,ledger_key||':refund','store_transaction',p_transaction_id,
          jsonb_build_object('provider','revenuecat','reason','refund','unrecoveredCredits',p_credits-recovered));
    end if;
    update public.together_store_credit_purchases set status='refunded',
      unrecovered_credits=case when purchase.status='granted' then p_credits-recovered else 0 end,updated_at=now()
      where store=p_store and environment=p_environment and transaction_id=p_transaction_id;
  elsif not p_refund and purchase.status='pending' then
    perform public.kivelle_grant_permanent_credits(p_user_id,p_credits,'purchase',ledger_key,'store_transaction',p_transaction_id,
      jsonb_build_object('provider','revenuecat','store',p_store,'environment',p_environment,'productId',p_product_id));
    update public.together_store_credit_purchases set status='granted',updated_at=now()
      where store=p_store and environment=p_environment and transaction_id=p_transaction_id;
  end if;
  return (select jsonb_build_object('status',status,'credits',credits) from public.together_store_credit_purchases
    where store=p_store and environment=p_environment and transaction_id=p_transaction_id);
end $$;
revoke all on function public.kivelle_apply_store_credit_purchase(uuid,text,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.kivelle_apply_store_credit_purchase(uuid,text,text,text,text,integer,boolean) to service_role;
