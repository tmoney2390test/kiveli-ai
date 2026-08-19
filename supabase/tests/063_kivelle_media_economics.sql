begin;
select plan(20);

select has_table('public','together_media_offers','Spontaneous media uses provider-free offers');
select col_is_unique('public','together_media_offers',array['user_id','offer_key'],'Canonical offer keys are idempotent per user');
select has_column('public','together_media_offers','credit_cost','Offers own their server-side credit cost');
select has_column('public','together_media_offers','included_subscription_benefit','Included subscription media is explicit');
select has_column('public','together_media_offers','generated_media_id','Fulfilled offers link to generated media');
select has_column('public','together_media_offers','viewed_at','Offer analytics distinguish a surfaced offer');
select has_column('public','together_generated_media','media_offer_id','Generated media links back to its authorization offer');
select ok(to_regclass('public.together_media_offers_date_benefit_idx') is not null,'Completed Dates can produce only one souvenir offer');
select ok((select relrowsecurity from pg_class where oid='public.together_media_offers'::regclass),'Media offers use RLS');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='together_media_offers'),'Media offer state changes publish in realtime');

select has_table('public','together_media_usage_events','Media provider COGS has an operational ledger');
select has_column('public','together_media_usage_events','estimated_provider_cost_usd','Estimated route cost is recorded');
select has_column('public','together_media_usage_events','actual_provider_cost_usd','Actual provider cost can override estimates');
select has_column('public','together_media_usage_events','quality_retry','Quality retry cost is distinguishable');
select has_column('public','together_media_usage_events','credit_funded','Credit-funded generation is distinguishable');
select has_column('public','together_media_usage_events','included_subscription_benefit','Included Date cost is distinguishable');
select col_is_unique('public','together_media_usage_events',array['provider_job_id','attempt_number'],'Each provider attempt is costed exactly once');
select ok((select relrowsecurity from pg_class where oid='public.together_media_usage_events'::regclass),'Media usage telemetry uses RLS');

select has_function('public','kivelle_accept_media_offer',array['uuid','uuid','text'],'Offer acceptance has an atomic server transaction');
select function_privs_are('public','kivelle_accept_media_offer',array['uuid','uuid','text'],'service_role',array['EXECUTE'],'Only service role may accept and charge offers');

select * from finish();
rollback;
