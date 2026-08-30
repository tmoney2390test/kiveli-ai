begin;
select plan(13);

select has_column('public','together_generated_media','video_source_mode','video source mode is durable');
select has_column('public','together_generated_media','user_prompt','direct video retains the approved user prompt');
select col_has_check('public','together_generated_media','video_source_mode','video source mode is constrained');
select col_has_check('public','together_generated_media','user_prompt','direct video prompt length is constrained');

select has_function(
  'public',
  'kivelle_reserve_direct_video_generation',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','integer','numeric','integer','text','text','text','text','jsonb','integer'],
  'direct reference video debit and queue insertion share one transaction'
);
select function_privs_are(
  'public',
  'kivelle_reserve_direct_video_generation',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','integer','numeric','integer','text','text','text','text','jsonb','integer'],
  'service_role',
  array['EXECUTE'],
  'only the server can reserve a direct video'
);
select ok(position('canonical_references' in pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure))>0,'direct videos are marked as canonical-reference jobs');
select ok(position('VIDEO_CONVERSATION_UNAVAILABLE' in pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure))>0,'direct reservation validates the optional conversation');
select ok(position('VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED' in pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure))>0,'direct reservation requires a referenced fictional adult');
select ok(position('ACTIVE_VIDEO_EXISTS' in pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure))>0,'direct reservation enforces one active video');
select ok(position('VIDEO_DAILY_LIMIT' in pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure))>0,'direct reservation enforces the daily limit');
select ok(position('p_credit_cost<>p_duration_seconds*25' in replace(pg_get_functiondef('public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer)'::regprocedure),' ',''))>0,'direct reservation derives credits from duration');
select ok(position('p_duration_seconds in(10,15,20)' in replace(pg_get_functiondef('public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer)'::regprocedure),' ',''))>0,'P-Video accepts the 10 through 20 second choices');

select * from finish();
rollback;
