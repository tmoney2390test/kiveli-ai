begin;
select plan(30);

select has_function('public','kivelle_video_queue_priority',array['uuid'],'Video queue priority has one server-authoritative entitlement seam');
select function_privs_are('public','kivelle_video_queue_priority',array['uuid'],'service_role',array['EXECUTE'],'Only service role can resolve queue priority');
select has_trigger('public','together_generated_media','kivelle_assign_video_queue_priority','Generated video jobs receive authoritative priority at insert time');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000131','00000000-0000-0000-0000-000000000000','authenticated','authenticated','video-burst-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_entitlements(user_id,tier,entitlement_keys)
values('00000000-0000-4000-8000-000000000131','kivelle_max','{}');

select is(public.kivelle_video_queue_priority('00000000-0000-4000-8000-000000000131'),20,'Max receives the highest queue priority');
update public.together_entitlements set tier='kivelle_plus' where user_id='00000000-0000-4000-8000-000000000131';
select is(public.kivelle_video_queue_priority('00000000-0000-4000-8000-000000000131'),10,'Plus receives elevated queue priority');
update public.together_entitlements set expires_at=clock_timestamp()-interval '1 second' where user_id='00000000-0000-4000-8000-000000000131';
select is(public.kivelle_video_queue_priority('00000000-0000-4000-8000-000000000131'),0,'Expired entitlements cannot retain queue priority');

select has_table('public','together_video_price_cache','Video pricing has a durable single-flight cache');
select ok((select relrowsecurity from pg_class where oid='public.together_video_price_cache'::regclass),'Video price cache has row security enabled');
select policies_are('public','together_video_price_cache',array[]::text[],'Video price cache has no client policy');
select has_function('public','kivelle_claim_video_price_quote',array['text','integer','integer'],'Video price quote admission is atomic');
select function_privs_are('public','kivelle_claim_video_price_quote',array['text','integer','integer'],'service_role',array['EXECUTE'],'Only service role can claim a price quote');

create temporary table _video_quote_claim as
select public.kivelle_claim_video_price_quote('pgtap-video-price-shape-131',4,25) as claim;
select is((select claim->>'state' from _video_quote_claim),'owner','The first caller owns an uncached quote');
select is(
  public.kivelle_complete_video_price_quote(
    'pgtap-video-price-shape-131',
    (select (claim->>'leaseToken')::uuid from _video_quote_claim),
    0.42,
    90
  ),
  true,
  'The quote owner can commit the authoritative result'
);
select is(
  (public.kivelle_claim_video_price_quote('pgtap-video-price-shape-131',4,25)->>'amountUsd')::numeric,
  0.42::numeric,
  'A matching request reuses the cached provider quote'
);

select has_table('public','kivelle_media_dispatch_signal','Dispatcher kicks have a durable coalescing signal');
select ok((select relrowsecurity from pg_class where oid='public.kivelle_media_dispatch_signal'::regclass),'Dispatcher signal has row security enabled');
select policies_are('public','kivelle_media_dispatch_signal',array[]::text[],'Dispatcher signal has no client policy');
select has_function('public','kivelle_claim_media_dispatch_signal',array['integer'],'Dispatcher kick admission is atomic');

update public.kivelle_media_dispatch_signal set last_kicked_at='-infinity',last_token=null where singleton=true;
create temporary table _dispatch_claim as select public.kivelle_claim_media_dispatch_signal(1500) as token;
select ok((select token is not null from _dispatch_claim),'The first simultaneous dispatcher kick is admitted');
select is(public.kivelle_claim_media_dispatch_signal(1500),null::uuid,'A duplicate dispatcher kick is coalesced');
select is(public.kivelle_release_media_dispatch_signal((select token from _dispatch_claim)),true,'A failed kick can release its cooldown safely');

select has_function('public','kivelle_claim_media_jobs_v4',array['integer','integer','integer','integer'],'Burst-aware media claims are available');
select function_privs_are('public','kivelle_claim_media_jobs_v4',array['integer','integer','integer','integer'],'service_role',array['EXECUTE'],'Only service role can claim queued media');
select ok(
  position('p_max_video_frame_inflight' in pg_get_functiondef('public.kivelle_claim_media_jobs_v4(integer,integer,integer,integer)'::regprocedure))>0,
  'Opening frames have capacity independent from provider video slots'
);
select has_function('public','kivelle_defer_media_submission',array['uuid','uuid','text','integer'],'Provider throttling defers the attempt and media job atomically');
select function_privs_are('public','kivelle_defer_media_submission',array['uuid','uuid','text','integer'],'service_role',array['EXECUTE'],'Only service role can defer provider submissions');

select has_function(
  'public','kivelle_reserve_video_generation_v7',
  array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','boolean','integer','boolean','uuid'],
  'Current existing-photo video reservation is available'
);
select ok(
  position($needle$status=any(array['queued','generating'])$needle$ in replace(regexp_replace(lower(pg_get_functiondef('public.kivelle_reserve_video_generation_v7(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,boolean,integer,boolean,uuid)'::regprocedure)),E'\\s+','','g'),'::text',''))>0,
  'Failed and completed existing-photo videos do not block the active slot'
);
select has_function(
  'public','kivelle_reserve_direct_video_generation_v5',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','uuid','boolean','jsonb','integer','uuid','uuid','jsonb','jsonb'],
  'Current prompt-first video reservation is available'
);
select ok(
  position($needle$status=any(array['queued','generating'])$needle$ in replace(regexp_replace(lower(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v5(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,uuid,boolean,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure)),E'\\s+','','g'),'::text',''))>0,
  'Failed and completed prompt-first videos do not block the active slot'
);

select * from finish();
rollback;
