begin;
select plan(9);

select has_column('public','together_credit_accounts','subscription_expires_at','Subscription credit grace is persisted');
select has_function('public','kivelle_reconcile_subscription_credits',array['uuid','integer','boolean','integer','timestamp with time zone'],'Subscription balances have an atomic lifecycle reconciler');
select function_privs_are('public','kivelle_reconcile_subscription_credits',array['uuid','integer','boolean','integer','timestamp with time zone'],'service_role',array['EXECUTE'],'Only service role reconciles subscription balances');
select has_table('public','together_included_media_benefit_claims','Included media claims use a dedicated ledger');
select col_is_unique('public','together_included_media_benefit_claims',array['user_id','benefit_type','date_session_id'],'A Date can claim its included benefit only once');
select col_is_unique('public','together_included_media_benefit_claims',array['user_id','benefit_type','benefit_month','slot'],'Monthly benefit slots cannot race');
select ok((select relrowsecurity from pg_class where oid='public.together_included_media_benefit_claims'::regclass),'Included benefit claims use RLS');
select has_function('public','kivelle_claim_included_date_photo',array['uuid','uuid','integer','timestamp with time zone'],'Date benefit claiming is transactional');
select function_privs_are('public','kivelle_claim_included_date_photo',array['uuid','uuid','integer','timestamp with time zone'],'service_role',array['EXECUTE'],'Only service role claims included media');

select * from finish();
rollback;
