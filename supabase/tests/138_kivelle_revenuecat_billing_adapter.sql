begin;
select plan(7);

select col_is_null('public','together_billing_events','user_id','Provider events may be claimed before subscriber attribution completes');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000138','00000000-0000-0000-0000-000000000000','authenticated','authenticated','revenuecat-adapter-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_entitlements(user_id,tier,entitlement_keys,revenuecat_app_user_id)
values('00000000-0000-4000-8000-000000000138','free','{}','00000000-0000-4000-8000-000000000138');

insert into public.together_billing_events(provider,event_id,event_type,status,payload_summary)
values('revenuecat','rc-test-event','TEST','ignored','{"eventType":"TEST"}'::jsonb);
select is((select provider from public.together_billing_events where event_id='rc-test-event'),'revenuecat','RevenueCat has its own idempotency namespace');

select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000138','revenuecat','00000000-0000-4000-8000-000000000138','revenuecat:00000000-0000-4000-8000-000000000138','plus_monthly','plus_monthly','kivelle_plus','active','monthly','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z',null,false,null,'2026-10-01T00:00:00Z',100,'{"adapter":"revenuecat"}'::jsonb);
select is((select plan_key from public.together_billing_subscriptions where provider='revenuecat' and provider_subscription_id='revenuecat:00000000-0000-4000-8000-000000000138'),'kivelle_plus','RevenueCat writes the provider-neutral subscription state');

select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000138','revenuecat','00000000-0000-4000-8000-000000000138','revenuecat:00000000-0000-4000-8000-000000000138','max_annual','max_annual','kivelle_max','active','annual','2026-09-01T00:00:00Z','2027-09-01T00:00:00Z',null,false,null,'2027-09-01T00:00:00Z',90,'{"adapter":"revenuecat","event":"stale"}'::jsonb);
select is((select plan_key from public.together_billing_subscriptions where provider='revenuecat' and provider_subscription_id='revenuecat:00000000-0000-4000-8000-000000000138'),'kivelle_plus','An older RevenueCat event cannot roll back the current snapshot');

select lives_ok($$select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000138','apple','00000000-0000-4000-8000-000000000138','apple:test','plus_monthly','plus_monthly','kivelle_plus','active','monthly','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z',null,false,null,'2026-10-01T00:00:00Z',100,'{}'::jsonb)$$,'The reserved direct Apple adapter uses the same entitlement boundary');
select lives_ok($$select public.kivelle_sync_billing_subscription_state('00000000-0000-4000-8000-000000000138','google_play','00000000-0000-4000-8000-000000000138','google:test','plus_monthly','plus_monthly','kivelle_plus','active','monthly','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z',null,false,null,'2026-10-01T00:00:00Z',100,'{}'::jsonb)$$,'The reserved direct Google adapter uses the same entitlement boundary');
select throws_ok($$insert into public.together_billing_events(provider,event_id,event_type,status) values('forged','forged-event','TEST','ignored')$$,'23514',null,'Unknown billing adapters are rejected');

select * from finish();
rollback;
