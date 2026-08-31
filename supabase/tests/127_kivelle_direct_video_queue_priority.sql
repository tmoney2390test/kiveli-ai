begin;
select plan(4);

select has_function(
  'public',
  'kivelle_reserve_direct_video_generation_v2',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','integer','numeric','integer','text','text','text','text','jsonb','integer','uuid','uuid','jsonb','jsonb'],
  'prompt-first direct video reservation is available'
);

select ok(
  position($needle$'image','standard','queued',p_source_frame_request_key,20$needle$ in replace(regexp_replace(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'\\s+','','g'),'::text',''))>0,
  'P-Video opening frames use the highest valid queue priority'
);

select ok(
  position($needle$'video','standard','queued',p_request_key,20,p_route_id$needle$ in replace(regexp_replace(pg_get_functiondef('public.kivelle_reserve_direct_video_generation_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb)'::regprocedure),'\\s+','','g'),'::text',''))>0,
  'direct videos use the highest valid queue priority'
);

select ok(
  position('queue_priority>=0' in replace(regexp_replace(pg_get_constraintdef((select oid from pg_constraint where conrelid='public.together_generated_media'::regclass and conname='together_generated_media_queue_priority_check')),'\\s+','','g'),'::integer',''))>0
    and position('queue_priority<=20' in replace(regexp_replace(pg_get_constraintdef((select oid from pg_constraint where conrelid='public.together_generated_media'::regclass and conname='together_generated_media_queue_priority_check')),'\\s+','','g'),'::integer',''))>0,
  'the generated-media queue priority range remains constrained to 0 through 20'
);

select * from finish();
rollback;
