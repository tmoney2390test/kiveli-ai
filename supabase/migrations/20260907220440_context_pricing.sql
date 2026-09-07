-- Quotes are service-only manifests. Holds debit the same spendable wallet used
-- by media/voice. A message and its final context charge commit together.
create table public.together_context_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  fingerprint text not null,
  state_fingerprint text not null,
  pricing_version text not null,
  manifest jsonb not null,
  maximum_credits integer not null check (maximum_credits >= 0),
  charged_credits integer not null default 0 check (charged_credits >= 0 and charged_credits <= maximum_credits),
  expires_at timestamptz not null default now()+interval '60 seconds',
  created_at timestamptz not null default now(),
  request_id uuid,
  turn_id uuid references public.together_dialogue_turns(id),
  status text not null default 'quoted' check(status in ('quoted','reserved','closed')),
  permanent_held integer not null default 0 check(permanent_held >= 0),
  subscription_held integer not null default 0 check(subscription_held >= 0),
  subscription_expires_at timestamptz,
  subscription_grant_cycle text,
  reserved_at timestamptz,
  closed_at timestamptz
);
create unique index together_context_quotes_active_request on public.together_context_quotes(user_id,conversation_id,request_id) where status='reserved';
create index together_context_quotes_recovery on public.together_context_quotes(reserved_at) where status='reserved';
create index together_context_quotes_expiry on public.together_context_quotes(expires_at) where status='quoted';
alter table public.together_context_quotes enable row level security;
revoke all on public.together_context_quotes from public,anon,authenticated;
grant all on public.together_context_quotes to service_role;

create table public.together_context_receipts (
  message_id uuid primary key references public.together_messages(id) on delete cascade,
  quote_id uuid not null references public.together_context_quotes(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  speaker_id uuid not null,
  reply_key uuid not null,
  credits integer not null check(credits>=0),
  created_at timestamptz not null default now(),
  unique(quote_id,reply_key)
);
alter table public.together_context_receipts enable row level security;
revoke all on public.together_context_receipts from public,anon,authenticated;
grant select on public.together_context_receipts to authenticated;
grant all on public.together_context_receipts to service_role;
create policy context_receipts_owner_read on public.together_context_receipts for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.kivelle_reserve_context(p_user_id uuid,p_quote_id uuid,p_request_id uuid,p_turn_id uuid,p_fingerprint text,p_state_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.together_context_quotes; a public.together_credit_accounts; s integer; p integer;
begin
 select * into q from public.together_context_quotes where id=p_quote_id and user_id=p_user_id for update;
 if q.id is null then raise exception 'CONTEXT_QUOTE_REQUIRED'; end if;
 if q.status='reserved' and q.request_id=p_request_id and q.turn_id=p_turn_id then return q.manifest; end if;
 if exists(select 1 from public.together_context_quotes where user_id=p_user_id and conversation_id=q.conversation_id and request_id=p_request_id and charged_credits>0) then raise exception 'CONTEXT_ALREADY_SETTLED'; end if;
 if q.status<>'quoted' or q.expires_at<=now() or q.fingerprint<>p_fingerprint or q.state_fingerprint<>p_state_fingerprint then raise exception 'CONTEXT_QUOTE_EXPIRED'; end if;
 if not exists(select 1 from public.together_dialogue_turns where id=p_turn_id and user_id=p_user_id and conversation_id=q.conversation_id and request_id=p_request_id::text and state in ('planning','generating')) then raise exception 'CONTEXT_TURN_INVALID'; end if;
 insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict do nothing;
 select * into a from public.together_credit_accounts where user_id=p_user_id for update;
 if a.permanent_balance+a.subscription_balance<q.maximum_credits then raise exception 'INSUFFICIENT_KIVELLE_CREDITS'; end if;
 s=least(a.subscription_balance,q.maximum_credits); p=q.maximum_credits-s;
 update public.together_credit_accounts set subscription_balance=subscription_balance-s,permanent_balance=permanent_balance-p,updated_at=now() where user_id=p_user_id;
 if q.maximum_credits>0 then
 insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
 values(p_user_id,'spend',-p,-s,'context-hold:'||q.id,'context_quote',q.id::text,jsonb_build_object('action','expanded_context','status','reserved','maximumCredits',q.maximum_credits));
 end if;
 update public.together_context_quotes set status='reserved',request_id=p_request_id,turn_id=p_turn_id,permanent_held=p,subscription_held=s,subscription_expires_at=a.subscription_expires_at,subscription_grant_cycle=a.subscription_grant_cycle,reserved_at=now() where id=q.id;
 return q.manifest;
end $$;

create or replace function public.kivelle_commit_context_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
declare charge jsonb; q public.together_context_quotes; slot jsonb; amount integer; speaker uuid;
begin
 charge=new.provider_metadata->'contextCharge';
 if charge is null then return new; end if;
 select * into q from public.together_context_quotes where id=(charge->>'quoteId')::uuid for update;
 speaker=coalesce(new.speaker_character_instance_id,new.character_instance_id);
 select value into slot from jsonb_array_elements(q.manifest->'replies') where value->>'speakerId'=speaker::text;
 amount=(charge->>'credits')::integer;
 if q.id is null or q.user_id<>new.user_id or q.conversation_id<>new.conversation_id or q.status<>'reserved' or new.role<>'assistant' or new.delivery_status<>'complete' or length(trim(new.content))=0 or slot is null or (select count(*) from public.together_context_receipts where quote_id=q.id)>=(q.manifest->>'maximumReplies')::integer or amount<0 or amount>(slot->>'maximumCredits')::integer or q.charged_credits+amount>q.maximum_credits then raise exception 'CONTEXT_RECEIPT_INVALID'; end if;
 insert into public.together_context_receipts(message_id,quote_id,user_id,speaker_id,reply_key,credits) values(new.id,q.id,new.user_id,speaker,(charge->>'replyKey')::uuid,amount);
 update public.together_context_quotes set charged_credits=charged_credits+amount where id=q.id;
 return new;
end $$;
create trigger together_message_context_receipt after insert on public.together_messages for each row execute function public.kivelle_commit_context_receipt();

create or replace function public.kivelle_close_context(p_quote_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare q public.together_context_quotes; a public.together_credit_accounts; sub_return integer; permanent_return integer; sub_spent integer; cap integer; tier text;
begin
 select * into q from public.together_context_quotes where id=p_quote_id for update;
 if q.id is null or q.status<>'reserved' then return 0; end if;
 select * into a from public.together_credit_accounts where user_id=q.user_id for update;
 sub_spent=least(q.subscription_held,q.charged_credits);
 sub_return=q.subscription_held-sub_spent;
 permanent_return=q.permanent_held-(q.charged_credits-sub_spent);
 select e.tier into tier from public.together_entitlements e where e.user_id=q.user_id;
 cap=case tier when 'kivelle_max' then 2400 when 'kivelle_plus' then 1000 else q.subscription_held+a.subscription_balance end;
 -- Holds retain their grant provenance. Expired credits stay expired, and a
 -- release cannot bypass the current plan's rollover cap after a cycle change.
 if q.subscription_expires_at<=now() or a.subscription_expires_at<=now() then sub_return=0;
 elsif q.subscription_grant_cycle is distinct from a.subscription_grant_cycle or cap<q.subscription_held+a.subscription_balance then sub_return=least(sub_return,greatest(0,cap-a.subscription_balance)); end if;
 update public.together_credit_accounts set subscription_balance=subscription_balance+sub_return,permanent_balance=permanent_balance+permanent_return,updated_at=now() where user_id=q.user_id;
 if sub_return+permanent_return>0 then
 insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
 values(q.user_id,'refund',permanent_return,sub_return,'context-release:'||q.id,'context_quote',q.id::text,jsonb_build_object('action','expanded_context','chargedCredits',q.charged_credits,'maximumCredits',q.maximum_credits));
 end if;
 update public.together_credit_ledger set metadata=metadata||jsonb_build_object('status','settled','chargedCredits',q.charged_credits) where user_id=q.user_id and idempotency_key='context-hold:'||q.id;
 update public.together_context_quotes set status='closed',closed_at=now() where id=q.id;
 return sub_return+permanent_return;
end $$;

create or replace function public.kivelle_recover_context_holds()
returns integer language plpgsql security definer set search_path=public as $$
declare q record; recovered integer=0;
begin
 for q in select id from public.together_context_quotes where status='reserved' and reserved_at<now()-interval '10 minutes' order by reserved_at limit 100 loop
  perform public.kivelle_close_context(q.id); recovered=recovered+1;
 end loop;
 delete from public.together_context_quotes where status='quoted' and expires_at<now()-interval '1 day';
 return recovered;
end $$;
revoke all on function public.kivelle_reserve_context(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.kivelle_commit_context_receipt() from public,anon,authenticated;
revoke all on function public.kivelle_close_context(uuid) from public,anon,authenticated;
revoke all on function public.kivelle_recover_context_holds() from public,anon,authenticated;
grant execute on function public.kivelle_reserve_context(uuid,uuid,uuid,uuid,text,text),public.kivelle_close_context(uuid),public.kivelle_recover_context_holds() to service_role;
select cron.schedule('kivelle-context-hold-recovery','* * * * *',$$select public.kivelle_recover_context_holds()$$);

-- General support refunds must not restore a context hold that has already
-- been partly returned by settlement. Context holds use their dedicated RPC.
create or replace function public.kivelle_refund_credit_transaction(p_user_id uuid,p_transaction_id uuid,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare spend public.together_credit_ledger; account public.together_credit_accounts; existing uuid; permanent_refund integer; subscription_refund integer;
begin
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance); end if;
  select * into spend from public.together_credit_ledger where id=p_transaction_id and user_id=p_user_id and event_type='spend';
  if spend.id is null then raise exception 'spend transaction not found'; end if;
  if spend.reference_type='context_quote' then raise exception 'CONTEXT_REFUND_REQUIRES_SETTLEMENT'; end if;
  permanent_refund=greatest(0,-spend.permanent_delta); subscription_refund=greatest(0,-spend.subscription_delta);
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  update public.together_credit_accounts set permanent_balance=permanent_balance+permanent_refund,subscription_balance=subscription_balance+subscription_refund,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'refund',permanent_refund,subscription_refund,p_idempotency_key,'credit_transaction',p_transaction_id::text,p_metadata);
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'refunded',permanent_refund+subscription_refund);
end $$;
revoke all on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) to service_role;
