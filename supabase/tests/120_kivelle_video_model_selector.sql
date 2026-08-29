begin;
select plan(27);

select has_column('public','together_generated_media','video_route_id','videos persist the canonical route ID');
select has_column('public','together_generated_media','motion_preset','videos persist the selected motion preset');
select has_column('public','together_generated_media','requested_duration_seconds','requested duration is distinct from actual duration');
select has_column('public','together_generated_media','requested_resolution','requested resolution is durable');
select has_column('public','together_generated_media','requested_audio_behavior','requested audio behavior is durable');
select has_column('public','together_generated_media','actual_audio_behavior','delivered audio behavior is verified separately');
select has_column('public','together_generated_media','source_aspect_ratio','source orientation is durable');
select has_column('public','together_generated_media','provider_quote_usd','the provider quote is durable');
select has_column('public','together_generated_media','testing_selection','tester intent is durable');
select has_index('public','together_generated_media','together_generated_media_active_video_user_idx','active videos have a user-scoped concurrency index');
select has_index('public','together_generated_media','together_generated_media_video_route_queue_idx','route queue claims are indexed');

select has_column('public','together_media_provider_jobs','quoted_provider_cost_usd','provider jobs snapshot their quote');
select has_column('public','together_media_provider_jobs','actual_provider_cost_usd','provider jobs can store actual cost separately');
select has_column('public','together_media_provider_jobs','actual_audio_behavior','provider jobs retain delivered audio verification');
select has_column('public','together_media_provider_jobs','motion_preset','provider jobs retain motion intent');
select has_column('public','together_media_provider_jobs','testing_selection','provider jobs retain tester status');

select has_table('public','together_video_feedback','video feedback is normalized');
select col_is_unique('public','together_video_feedback',array['user_id','video_media_id'],'one current feedback response exists per user and video');
select policies_are('public','together_video_feedback',array['together_video_feedback_own_read'],'feedback is privately readable');
select is(has_table_privilege('authenticated','public.together_video_feedback','INSERT'),false,'clients cannot forge video feedback');

select has_function('public','kivelle_reserve_video_generation',array['uuid','uuid','uuid','text','text','text','text','text','integer','numeric','integer','text','text','text','boolean','integer'],'video debit and queue insertion share one transaction');
select function_privs_are('public','kivelle_reserve_video_generation',array['uuid','uuid','uuid','text','text','text','text','text','integer','numeric','integer','text','text','text','boolean','integer'],'service_role',array['EXECUTE'],'only the server can reserve a video');
select ok(position('ACTIVE_VIDEO_EXISTS' in pg_get_functiondef('public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer)'::regprocedure))>0,'reservation enforces one active video');
select ok(position('VIDEO_DAILY_LIMIT' in pg_get_functiondef('public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer)'::regprocedure))>0,'reservation enforces the daily submission limit');
select ok(position('request_key=p_request_key' in replace(pg_get_functiondef('public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer)'::regprocedure),' ',''))>0,'reservation performs idempotency lookup before charging');
select ok(position('INVALID_VIDEO_ROUTE_CONFIGURATION' in pg_get_functiondef('public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer)'::regprocedure))>0,'reservation enforces the canonical route and provider-model mapping');
select has_function('public','kivelle_claim_media_jobs_v3',array['integer','integer','integer'],'image and video queue capacity is claimed separately');

select * from finish();
rollback;
