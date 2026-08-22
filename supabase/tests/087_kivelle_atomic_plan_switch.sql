begin;
select plan(8);

select like(
  pg_get_constraintdef((select oid from pg_constraint where conname='together_conversation_events_event_type_check')),
  '%plan_switched%',
  'the conversation timeline accepts compact plan switch events'
);

select has_function(
  'public','kivelle_switch_plan_experience',
  array['uuid','uuid','uuid','uuid','uuid','uuid','text','timestamp with time zone'],
  'chat plan switching has one transactional database seam'
);

select function_privs_are(
  'public','kivelle_switch_plan_experience',
  array['uuid','uuid','uuid','uuid','uuid','uuid','text','timestamp with time zone'],
  'service_role',array['EXECUTE'],
  'only the backend can switch an active plan'
);

select like(
  pg_get_functiondef('public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),
  '%pg_advisory_xact_lock%',
  'switches serialize for one user and companion'
);

select like(
  pg_get_functiondef('public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),
  '%kivelle_finish_plan_experience%',
  'the current plan uses canonical completion'
);

select like(
  pg_get_functiondef('public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),
  '%kivelle_begin_plan_experience%',
  'the replacement uses canonical attendance and scene start'
);

select like(
  pg_get_functiondef('public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),
  '%date experience owns completion%',
  'date-owned experiences cannot be switched from chat'
);

select like(
  pg_get_functiondef('public.kivelle_switch_plan_experience(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),
  '%switchedToPlanId%',
  'the superseded completion event is marked for timeline deduplication'
);

select * from finish();
rollback;
