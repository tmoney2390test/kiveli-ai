begin;
select plan(10);

select has_function(
  'public','kivelle_forget_memory_scope',array['uuid','uuid','uuid'],
  'memory privacy erasure is implemented as an atomic server operation'
);

select function_privs_are(
  'public','kivelle_forget_memory_scope',array['uuid','uuid','uuid'],
  'service_role',array['EXECUTE'],
  'only the server can execute scoped memory erasure'
);

select is(
  has_function_privilege('authenticated','public.kivelle_forget_memory_scope(uuid,uuid,uuid)','EXECUTE'),
  false,
  'clients cannot bypass the memory privacy endpoint'
);

select is(has_table_privilege('authenticated','public.together_memories','SELECT'),false,
  'free clients cannot fetch the raw memory collection directly');
select is(has_table_privilege('authenticated','public.together_memories','UPDATE'),false,
  'clients cannot bypass server mutation entitlements');
select is(has_table_privilege('authenticated','public.together_memories','DELETE'),false,
  'clients cannot bypass server forget controls');
select is(has_table_privilege('authenticated','public.together_relationship_reflections','SELECT'),false,
  'Max relationship summaries are server-gated');
select is(has_table_privilege('authenticated','public.together_companion_user_patterns','SELECT'),false,
  'Max learned patterns are server-gated');

select ok(not exists(
  select 1 from public.together_entitlements
  where tier in('kivelle_plus','kivelle_max')
    and not(entitlement_keys @> array['memory_inspector','memory_manual_control']::text[])
),'paid entitlement rows include the inspector and manual controls');

select ok(not exists(
  select 1 from public.together_entitlements
  where tier='free'
    and entitlement_keys && array['memory_inspector','memory_manual_control']::text[]
),'free entitlement rows do not include paid memory tools');

select * from finish();
rollback;
