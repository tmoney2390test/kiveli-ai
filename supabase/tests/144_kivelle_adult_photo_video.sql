begin;

select plan(6);

select has_function(
  'public','kivelle_reserve_video_generation_v4',
  array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','boolean','integer','boolean','uuid'],
  'photo animation v4 independently authorizes adult source photos'
);
select function_privs_are(
  'public','kivelle_reserve_video_generation_v4',
  array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','boolean','integer','boolean','uuid'],
  'service_role',array['EXECUTE'],
  'service role can reserve an authorized photo animation'
);
select function_privs_are(
  'public','kivelle_reserve_video_generation_v4',
  array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','boolean','integer','boolean','uuid'],
  'authenticated',array[]::text[],
  'authenticated clients cannot call the reservation function directly'
);
select matches(pg_get_functiondef('public.kivelle_reserve_video_generation_v4(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,boolean,integer,boolean,uuid)'::regprocedure),'WEB_ADULT_VIDEO_AUTHORIZATION_REQUIRED','adult photo animation verifies website authorization');
select matches(pg_get_functiondef('public.kivelle_reserve_video_generation_v4(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,boolean,integer,boolean,uuid)'::regprocedure),'%-spicy','adult photo animation requires a spicy route');
select matches(pg_get_functiondef('public.kivelle_reserve_video_generation_v4(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,boolean,integer,boolean,uuid)'::regprocedure),'''adultAuthorized'',true','reserved adult animations retain adult authorization');

select * from finish();
rollback;
