begin;
select plan(3);
select has_function('public','kivelle_sync_subscription_world_access',array[]::text[],'Subscription world access is synchronized server-side');
select ok(exists(select 1 from pg_trigger where tgrelid='public.together_entitlements'::regclass and tgname='together_entitlements_sync_world_access' and not tgisinternal),'Entitlement tier changes trigger world-access synchronization');
select like(pg_get_functiondef('public.kivelle_sync_subscription_world_access()'::regprocedure),'%subscriptionManaged%','Subscription-managed world rows are distinguished from purchased unlocks');
select * from finish();
rollback;
