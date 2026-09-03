begin;

select plan(7);

select has_function(
  'public','kivelle_reserve_direct_video_generation_v5',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','uuid','boolean','jsonb','integer','uuid','uuid','jsonb','jsonb'],
  'direct video v5 persists an independently authorized content policy'
);
select function_privs_are(
  'public','kivelle_reserve_direct_video_generation_v5',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','uuid','boolean','jsonb','integer','uuid','uuid','jsonb','jsonb'],
  'service_role',array['EXECUTE'],
  'service role can reserve an authorized direct video'
);
select function_privs_are(
  'public','kivelle_reserve_direct_video_generation_v5',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','uuid','boolean','jsonb','integer','uuid','uuid','jsonb','jsonb'],
  'authenticated',array[]::text[],
  'authenticated clients cannot call the reservation function directly'
);
select matches(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v5(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,uuid,boolean,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'WEB_ADULT_VIDEO_AUTHORIZATION_REQUIRED','reservation verifies adult authorization');
select matches(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v5(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,uuid,boolean,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'together_web_adult_sessions','reservation verifies the server-issued website session');
select matches(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v5(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,uuid,boolean,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'''requestedContentLevel'',p_content_level','reserved jobs retain their requested content level');
select matches(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v5(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,text,boolean,uuid,boolean,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'''anonymousAdultPartner'',true','partnered jobs retain the anonymous-partner policy');

select * from finish();
rollback;
