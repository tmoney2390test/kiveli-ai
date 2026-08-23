begin;
select plan(7);

select ok(
  to_regprocedure('public.kivelle_reconcile_plan_scene_participant(uuid,uuid,uuid,uuid,uuid,timestamp with time zone)') is not null,
  'plan scenes have a transactional participant reconciliation seam'
);

select function_privs_are(
  'public','kivelle_reconcile_plan_scene_participant',
  array['uuid','uuid','uuid','uuid','uuid','timestamp with time zone'],
  'service_role',array['EXECUTE'],
  'only the backend reconciles plan scene membership'
);

select alike(
  pg_get_functiondef('public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamp with time zone,text)'::regprocedure),
  '%kivelle_reconcile_plan_scene_participant%',
  'plan start reconciles participant membership before committing'
);

select alike(
  pg_get_functiondef('public.kivelle_reconcile_plan_scene_participant(uuid,uuid,uuid,uuid,uuid,timestamp with time zone)'::regprocedure),
  '%pg_advisory_xact_lock%',
  'participant reconciliation serializes starts for one companion'
);

select alike(
  pg_get_functiondef('public.kivelle_reconcile_plan_scene_participant(uuid,uuid,uuid,uuid,uuid,timestamp with time zone)'::regprocedure),
  '%scene_session_id<>p_scene_id%left_at is null%',
  'stale active membership is closed before joining the plan scene'
);

select alike(
  pg_get_functiondef('public.kivelle_validate_scene_participant()'::regprocedure),
  '%active plan attendance%',
  'plan participant validation uses canonical plan attendance'
);

select unalike(
  pg_get_functiondef('public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamp with time zone,text)'::regprocedure),
  '%return jsonb_build_object%kivelle_reconcile_plan_scene_participant%',
  'plan start does not postpone participant reconciliation until after its return'
);

select * from finish();
rollback;
