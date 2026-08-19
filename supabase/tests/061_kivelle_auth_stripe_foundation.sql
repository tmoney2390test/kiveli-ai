begin;
select plan(14);

select has_column('public','together_entitlements','billing_customer_id','Entitlements retain the billing customer identifier');
select has_column('public','together_entitlements','billing_subscription_id','Entitlements retain the active subscription identifier');
select has_column('public','together_entitlements','billing_status','Entitlements retain normalized provider status');
select ok(to_regclass('public.together_entitlements_stripe_customer_uidx') is not null,'Stripe customer identifiers are unique');
select ok(to_regclass('public.together_entitlements_stripe_subscription_uidx') is not null,'Stripe subscription identifiers are unique');

select has_table('public','together_billing_customers','Billing customers have a provider-neutral ownership table');
select col_is_pk('public','together_billing_customers','id','Billing customer rows have a primary key');
select col_is_unique('public','together_billing_customers',array['user_id','provider'],'One provider customer exists per Kivelle account');
select ok((select relrowsecurity from pg_class where oid='public.together_billing_customers'::regclass),'Billing customers use RLS');

select has_table('public','together_billing_events','Billing webhooks have an idempotency ledger');
select col_is_unique('public','together_billing_events',array['provider','event_id'],'Provider events are idempotent');
select has_column('public','together_billing_events','status','Billing event processing state is explicit');
select has_column('public','together_billing_events','payload_summary','Only a bounded event summary is retained');
select ok((select relrowsecurity from pg_class where oid='public.together_billing_events'::regclass),'Billing events use RLS');

select * from finish();
rollback;
