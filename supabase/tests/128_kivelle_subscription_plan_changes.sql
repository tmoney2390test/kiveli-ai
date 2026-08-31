begin;
select plan(15);

select has_function('public','kivelle_reconcile_subscription_credits',array['uuid','text','integer','boolean','integer','timestamp with time zone'],'Tier-aware lifecycle reconciliation exists');
select function_privs_are('public','kivelle_reconcile_subscription_credits',array['uuid','text','integer','boolean','integer','timestamp with time zone'],'service_role',array['EXECUTE'],'Only service role can perform guarded lifecycle reconciliation');
select has_function('public','kivelle_sync_billing_subscription_state',array['uuid','text','text','text','text','text','text','text','text','timestamp with time zone','timestamp with time zone','timestamp with time zone','boolean','timestamp with time zone','timestamp with time zone','bigint','jsonb'],'Provider subscription snapshots have an atomic ordered upsert');
select function_privs_are('public','kivelle_sync_billing_subscription_state',array['uuid','text','text','text','text','text','text','text','text','timestamp with time zone','timestamp with time zone','timestamp with time zone','boolean','timestamp with time zone','timestamp with time zone','bigint','jsonb'],'service_role',array['EXECUTE'],'Only service role can synchronize provider subscriptions');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000128','00000000-0000-0000-0000-000000000000','authenticated','authenticated','subscription-plan-change-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_entitlements(user_id,tier,entitlement_keys)
values('00000000-0000-4000-8000-000000000128','kivelle_max','{}')
on conflict(user_id) do update set tier=excluded.tier,entitlement_keys=excluded.entitlement_keys;

select public.kivelle_grant_subscription_credit_target('00000000-0000-4000-8000-000000000128',500,1000,'benefit:2026-08','test:plus','{"tier":"kivelle_plus"}'::jsonb);
select public.kivelle_grant_subscription_credit_target('00000000-0000-4000-8000-000000000128',1200,2400,'benefit:2026-08','test:max','{"tier":"kivelle_max"}'::jsonb);
select public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128',1000,true,30,'2026-08-31T20:00:00Z');
select public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128',2400,true,30,'2026-08-31T20:01:00Z');

select is((select subscription_balance from public.together_credit_accounts where user_id='00000000-0000-4000-8000-000000000128'),1200,'Re-upgrading in the same benefit month restores a lower-cap reduction');
select is((select coalesce(sum(subscription_delta),0)::integer from public.together_credit_ledger where user_id='00000000-0000-4000-8000-000000000128' and metadata->>'reason'='tier_cap_reduced'),-200,'The downgrade reduction remains auditable');
select is((select coalesce(sum(subscription_delta),0)::integer from public.together_credit_ledger where user_id='00000000-0000-4000-8000-000000000128' and metadata->>'reason'='tier_cap_restored'),200,'The upgrade restoration remains auditable');

select public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128',1000,true,30,'2026-08-31T20:02:00Z');
select public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128',2400,true,30,'2026-08-31T20:03:00Z');
select is((select subscription_balance from public.together_credit_accounts where user_id='00000000-0000-4000-8000-000000000128'),1200,'Repeated downgrade and upgrade cycles restore exactly once');
select is((select coalesce(sum(subscription_delta),0)::integer from public.together_credit_ledger where user_id='00000000-0000-4000-8000-000000000128' and metadata->>'reason'='tier_cap_restored'),400,'Each distinct cap reduction has one matching restoration');

select public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128',2400,true,30,'2026-08-31T20:04:00Z');
select is((select count(*)::integer from public.together_credit_ledger where user_id='00000000-0000-4000-8000-000000000128' and metadata->>'reason'='tier_cap_restored'),2,'A duplicate reconciliation cannot duplicate restoration Credits');

select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000128','stripe','cus_test','sub_test','prod_max','price_max','kivelle_max','active','monthly','2026-08-31T00:00:00Z','2026-09-30T00:00:00Z',null,false,null,'2026-09-30T00:00:00Z',200,'{"event":"newer"}'::jsonb);
select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000128','stripe','cus_test','sub_test','prod_plus','price_plus','kivelle_plus','active','monthly','2026-08-31T00:00:00Z','2026-09-30T00:00:00Z',null,false,null,'2026-09-30T00:00:00Z',100,'{"event":"older"}'::jsonb);
select is((select plan_key from public.together_billing_subscriptions where provider='stripe' and provider_subscription_id='sub_test'),'kivelle_max','An older webhook cannot roll back the current plan');
select is((select last_provider_event_created_at from public.together_billing_subscriptions where provider='stripe' and provider_subscription_id='sub_test'),200::bigint,'The provider event watermark never moves backward');

update public.together_entitlements set tier='kivelle_max' where user_id='00000000-0000-4000-8000-000000000128';
select is((public.kivelle_reconcile_subscription_credits('00000000-0000-4000-8000-000000000128','kivelle_plus',1000,true,30,'2026-08-31T20:05:00Z')->>'stale')::boolean,true,'A stale resolved tier is rejected before it can clamp Credits');
select is((select subscription_balance from public.together_credit_accounts where user_id='00000000-0000-4000-8000-000000000128'),1200,'Rejected stale reconciliation leaves the balance unchanged');

select public.kivelle_spend_credits('00000000-0000-4000-8000-000000000128',100,'test:spend','test','test','{}'::jsonb);
select public.kivelle_grant_subscription_credit_target('00000000-0000-4000-8000-000000000128',1200,2400,'benefit:2026-08','test:max','{"tier":"kivelle_max"}'::jsonb);
select is((select subscription_balance from public.together_credit_accounts where user_id='00000000-0000-4000-8000-000000000128'),1100,'Ordinary spending never causes the monthly grant to repeat');

select * from finish();
rollback;
