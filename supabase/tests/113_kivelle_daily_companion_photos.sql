begin;
select plan(13);

select has_table('public','together_daily_photo_allowance_claims','Daily companion photos use a server-owned reservation ledger');
select has_column('public','together_daily_photo_allowance_claims','benefit_date','Daily benefits have a fixed server date');
select has_column('public','together_daily_photo_allowance_claims','reservation_key','Daily benefits have an idempotency key');
select has_column('public','together_daily_photo_allowance_claims','status','Reservations distinguish pending and delivered photos');
select col_is_unique('public','together_daily_photo_allowance_claims',array['user_id','benefit_date','reservation_key'],'A request can reserve only once per UTC day');
select ok((select relrowsecurity from pg_class where oid='public.together_daily_photo_allowance_claims'::regclass),'Daily allowance rows use RLS');
select has_index('public','together_daily_photo_allowance_claims','together_daily_photo_claims_user_day_idx','Daily allowance lookup is indexed');
select has_function('public','kivelle_claim_daily_photo_allowance',array['uuid','text','integer','text','timestamp with time zone'],'Retries can atomically reclaim a released benefit');
select has_function('public','kivelle_prepare_daily_photo_offer',array['uuid','uuid','integer','text','timestamp with time zone'],'The pending-offer choice is reserved atomically');
select has_function('public','kivelle_release_daily_photo_allowance',array['uuid','text'],'Failed work releases its daily benefit');
select has_function('public','kivelle_consume_daily_photo_allowance',array['uuid','text','timestamp with time zone'],'Only successful delivery consumes a benefit');
select function_privs_are('public','kivelle_prepare_daily_photo_offer',array['uuid','uuid','integer','text','timestamp with time zone'],'service_role',array['EXECUTE'],'Only the server may apply an included photo to an offer');
select ok(position('UTC' in pg_get_functiondef('public.kivelle_claim_daily_photo_allowance(uuid,text,integer,text,timestamp with time zone)'::regprocedure))>0,'Daily benefits use one non-manipulable UTC boundary');

select * from finish();
rollback;
