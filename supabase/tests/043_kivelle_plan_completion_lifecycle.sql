begin;
select plan(7);

select has_column(
  'public','together_shared_plans','completion_reason',
  'Shared plans retain why the experience ended'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.together_shared_plans'::regclass
      and conname='together_shared_plans_completion_reason_check'
  ),
  'Completion reasons use a controlled vocabulary'
);

select ok(
  to_regprocedure('public.kivelle_finish_plan_experience(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)') is not null,
  'Plan completion has one transactional server seam'
);

select ok(
  to_regclass('public.together_shared_plans_completion_boundary_idx') is not null,
  'Pending completion boundaries have a reconciliation index'
);

select function_privs_are(
  'public','kivelle_finish_plan_experience',
  array['uuid','uuid','uuid','uuid','uuid','text','text','timestamp with time zone'],
  'service_role',array['EXECUTE'],
  'Only the service role can finish a plan experience'
);

select has_trigger(
  'public','together_shared_plans','together_shared_plans_fill_completion_reason',
  'Legacy completion paths receive a canonical reason'
);

select col_is_null(
  'public','together_shared_plans','completion_reason',
  'Non-completed plans may omit a completion reason'
);

select * from finish();
rollback;
