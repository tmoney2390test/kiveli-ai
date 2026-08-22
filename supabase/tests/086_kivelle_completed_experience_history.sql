begin;
select plan(8);

select has_function(
  'public','kivelle_materialize_completed_plan_history',array['uuid'],
  'completed plans have one canonical history materializer'
);

select function_privs_are(
  'public','kivelle_materialize_completed_plan_history',array['uuid'],
  'service_role',array['EXECUTE'],
  'only the backend materializes completed-plan history'
);

select has_trigger(
  'public','together_shared_plans','together_shared_plan_materialize_history',
  'all plan completion paths materialize history'
);

select has_trigger(
  'public','together_memories','together_memories_fill_subject_key',
  'legacy memory writers receive a stable subject key'
);

select like(
  pg_get_functiondef('public.kivelle_materialize_completed_plan_history(uuid)'::regprocedure),
  '%shared-plan:%',
  'plan memories use an idempotent plan-scoped identity'
);

select like(
  pg_get_functiondef('public.kivelle_materialize_completed_plan_history(uuid)'::regprocedure),
  '%episodic%',
  'completed shared plans become episodic memories'
);

select like(
  pg_get_functiondef('public.kivelle_materialize_completed_plan_history(uuid)'::regprocedure),
  '%plan_row.status <> ''completed''%',
  'only completed plans are materialized'
);

select ok(
  to_regclass('public.together_relationship_milestones_history_idx') is not null,
  'resolved milestone history has a continuity-scoped index'
);

select * from finish();
rollback;
