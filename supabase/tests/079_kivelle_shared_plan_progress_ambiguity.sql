begin;
select plan(4);

select has_function(
  'public',
  'kivelle_progress_shared_plans_core',
  array['uuid','uuid','timestamp with time zone'],
  'shared plan core progression exists'
);

select unalike(
  pg_get_functiondef(
    'public.kivelle_progress_shared_plans_core(uuid,uuid,timestamptz)'::regprocedure
  ),
  '%select relationship_stage into relationship_stage%',
  'shared plan progression does not use an ambiguous relationship-stage target'
);

select alike(
  pg_get_functiondef(
    'public.kivelle_progress_shared_plans_core(uuid,uuid,timestamptz)'::regprocedure
  ),
  '%instance.relationship_stage%current_relationship_stage%',
  'shared plan progression qualifies the relationship-stage column'
);

select function_privs_are(
  'public',
  'kivelle_progress_shared_plans_core',
  array['uuid','uuid','timestamp with time zone'],
  'service_role',
  array['EXECUTE'],
  'only the backend advances shared plans'
);

select * from finish();
rollback;
