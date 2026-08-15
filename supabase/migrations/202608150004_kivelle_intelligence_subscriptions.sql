begin;

-- Three durable product tiers. Preserve existing users by mapping the legacy names.
alter table public.together_entitlements drop constraint if exists together_entitlements_tier_check;
update public.together_entitlements set tier='kivelle_plus' where tier='together_plus';
update public.together_entitlements set tier='kivelle_max' where tier='unlimited';
alter table public.together_entitlements alter column tier set default 'free';
alter table public.together_entitlements add constraint together_entitlements_tier_check check(tier in('free','kivelle_plus','kivelle_max'));
alter table public.together_entitlements add column if not exists billing_provider text;
alter table public.together_entitlements add column if not exists product_key text;
alter table public.together_entitlements add column if not exists billing_period_start timestamptz;
alter table public.together_entitlements add column if not exists billing_period_end timestamptz;

update public.together_entitlements set entitlement_keys=case tier
  when 'kivelle_plus' then array['relationship_core','chat_core','memory_core','juniper_world','plans_dates_moments','custom_companion_basic','chat_unlimited','memory_deep','history_expanded','all_standard_worlds','proactive_messages','multiple_lives','multiple_custom_companions','priority_media','director_selective','text_expanded','memory_long_term','moments_expanded','voice_notes','contextual_images','multiple_relationships']
  when 'kivelle_max' then array['relationship_core','chat_core','memory_core','juniper_world','plans_dates_moments','custom_companion_basic','chat_unlimited','memory_deep','history_expanded','all_standard_worlds','proactive_messages','multiple_lives','multiple_custom_companions','priority_media','director_selective','memory_deepest','history_max','director_default','early_access_worlds','highest_priority_media','social_scenes_enhanced','voice_priority','text_expanded','memory_long_term','moments_expanded','voice_notes','contextual_images','multiple_relationships','premium_models','group_interactions']
  else array['relationship_core','chat_core','memory_core','juniper_world','plans_dates_moments','custom_companion_basic','maya_relationship','text_basic','memory_basic','city_life','dinner_juniper'] end;

-- Durable character identity information used by the prompt compiler. This belongs to a character version,
-- so changing it later does not rewrite historical identity.
alter table public.together_character_versions add column if not exists character_bible jsonb not null default '{}'::jsonb;
update public.together_character_versions
set character_bible=jsonb_strip_nulls(jsonb_build_object(
  'values',values_config,
  'communicationStyle',communication_style,
  'boundaries',to_jsonb(boundaries),
  'relationshipStyle',coalesce(relationship_config,'{}'::jsonb),
  'life',coalesce(life_config,'{}'::jsonb),
  'promptVersion',2
))
where character_bible='{}'::jsonb;

-- Periodic companion-side relationship reflection. This is qualitative prompt context, never user-facing metrics.
create table if not exists public.together_relationship_reflections(
  character_instance_id uuid primary key references public.together_character_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid references public.together_continuities(id) on delete cascade,
  companion_view text not null default '',
  recurring_dynamics text[] not null default '{}',
  unresolved_tension text[] not null default '{}',
  shared_references text[] not null default '{}',
  emotional_expectations text[] not null default '{}',
  relationship_summary text not null default '',
  updated_through_message_id uuid references public.together_messages(id) on delete set null,
  meaningful_turn_count integer not null default 0 check(meaningful_turn_count>=0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists together_relationship_reflections_user_idx on public.together_relationship_reflections(user_id,continuity_id);
alter table public.together_relationship_reflections enable row level security;
drop policy if exists together_relationship_reflections_own_read on public.together_relationship_reflections;
create policy together_relationship_reflections_own_read on public.together_relationship_reflections for select to authenticated using(user_id=auth.uid());

-- Credits use two buckets: permanent credits never expire; subscription credits refresh monthly and roll over up to a tier cap.
create table if not exists public.together_credit_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  permanent_balance integer not null default 0 check(permanent_balance>=0),
  subscription_balance integer not null default 0 check(subscription_balance>=0),
  subscription_grant_cycle text,
  welcome_granted_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.together_credit_ledger(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check(event_type in('welcome_grant','subscription_grant','purchase','spend','refund','adjustment')),
  permanent_delta integer not null default 0,
  subscription_delta integer not null default 0,
  reference_type text,
  reference_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create index if not exists together_credit_ledger_user_created_idx on public.together_credit_ledger(user_id,created_at desc);
alter table public.together_credit_accounts enable row level security;
alter table public.together_credit_ledger enable row level security;
drop policy if exists together_credit_accounts_own_read on public.together_credit_accounts;
create policy together_credit_accounts_own_read on public.together_credit_accounts for select to authenticated using(user_id=auth.uid());
drop policy if exists together_credit_ledger_own_read on public.together_credit_ledger;
create policy together_credit_ledger_own_read on public.together_credit_ledger for select to authenticated using(user_id=auth.uid());

create or replace function public.kivelle_grant_permanent_credits(p_user_id uuid,p_amount integer,p_event_type text,p_idempotency_key text,p_reference_type text default null,p_reference_id text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare account public.together_credit_accounts; existing uuid;
begin
  if p_amount<=0 then raise exception 'credit grant must be positive'; end if;
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('idempotent',true,'permanentBalance',coalesce(account.permanent_balance,0),'subscriptionBalance',coalesce(account.subscription_balance,0)); end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  update public.together_credit_accounts set permanent_balance=permanent_balance+p_amount,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,p_event_type,p_amount,p_idempotency_key,p_reference_type,p_reference_id,p_metadata);
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

create or replace function public.kivelle_grant_subscription_credits(p_user_id uuid,p_amount integer,p_cap integer,p_cycle text,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare account public.together_credit_accounts; existing uuid; actual integer;
begin
  if p_amount<=0 or p_cap<0 then raise exception 'invalid subscription credit grant'; end if;
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('idempotent',true,'permanentBalance',coalesce(account.permanent_balance,0),'subscriptionBalance',coalesce(account.subscription_balance,0)); end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  actual=greatest(0,least(p_amount,p_cap-account.subscription_balance));
  update public.together_credit_accounts set subscription_balance=subscription_balance+actual,subscription_grant_cycle=p_cycle,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,subscription_delta,idempotency_key,metadata) values(p_user_id,'subscription_grant',actual,p_idempotency_key,p_metadata||jsonb_build_object('cycle',p_cycle,'requestedAmount',p_amount,'cap',p_cap));
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'granted',actual);
end $$;

create or replace function public.kivelle_spend_credits(p_user_id uuid,p_amount integer,p_idempotency_key text,p_reference_type text,p_reference_id text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare account public.together_credit_accounts; existing public.together_credit_ledger; sub_spend integer; permanent_spend integer; tx uuid;
begin
  if p_amount<=0 then raise exception 'credit spend must be positive'; end if;
  select * into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing.id is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('transactionId',existing.id,'idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance); end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_amount then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS'; end if;
  sub_spend=least(account.subscription_balance,p_amount); permanent_spend=p_amount-sub_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-sub_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'spend',-permanent_spend,-sub_spend,p_idempotency_key,p_reference_type,p_reference_id,p_metadata) returning id into tx;
  return jsonb_build_object('transactionId',tx,'permanentSpent',permanent_spend,'subscriptionSpent',sub_spend,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

create or replace function public.kivelle_refund_credit_transaction(p_user_id uuid,p_transaction_id uuid,p_idempotency_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare spend public.together_credit_ledger; account public.together_credit_accounts; existing uuid; permanent_refund integer; subscription_refund integer;
begin
  select id into existing from public.together_credit_ledger where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if existing is not null then select * into account from public.together_credit_accounts where user_id=p_user_id; return jsonb_build_object('idempotent',true,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance); end if;
  select * into spend from public.together_credit_ledger where id=p_transaction_id and user_id=p_user_id and event_type='spend';
  if spend.id is null then raise exception 'spend transaction not found'; end if;
  permanent_refund=greatest(0,-spend.permanent_delta); subscription_refund=greatest(0,-spend.subscription_delta);
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  update public.together_credit_accounts set permanent_balance=permanent_balance+permanent_refund,subscription_balance=subscription_balance+subscription_refund,updated_at=now() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(p_user_id,'refund',permanent_refund,subscription_refund,p_idempotency_key,'credit_transaction',p_transaction_id::text,p_metadata);
  return jsonb_build_object('permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance,'refunded',permanent_refund+subscription_refund);
end $$;

revoke all on function public.kivelle_grant_permanent_credits(uuid,integer,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kivelle_grant_subscription_credits(uuid,integer,integer,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kivelle_spend_credits(uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_grant_permanent_credits(uuid,integer,text,text,text,text,jsonb) to service_role;
grant execute on function public.kivelle_grant_subscription_credits(uuid,integer,integer,text,text,jsonb) to service_role;
grant execute on function public.kivelle_spend_credits(uuid,integer,text,text,text,jsonb) to service_role;
grant execute on function public.kivelle_refund_credit_transaction(uuid,uuid,text,jsonb) to service_role;

-- Existing accounts receive the same one-time welcome grant as new users.
insert into public.together_credit_accounts(user_id,welcome_granted_at) select user_id,now() from public.together_profiles on conflict(user_id) do nothing;
insert into public.together_credit_ledger(user_id,event_type,permanent_delta,idempotency_key,metadata)
select user_id,'welcome_grant',50,'welcome-v1','{"reason":"Kivelle launch welcome credits"}'::jsonb from public.together_profiles
on conflict(user_id,idempotency_key) do nothing;
update public.together_credit_accounts a set permanent_balance=greatest(a.permanent_balance,50),welcome_granted_at=coalesce(a.welcome_granted_at,now()),updated_at=now()
where exists(select 1 from public.together_profiles p where p.user_id=a.user_id);

commit;
