begin;
select plan(3);

select has_function(
  'public','kivelle_dialogue_context_core',array['uuid','uuid','uuid'],
  'dialogue core context is available as one bounded database call'
);

select function_privs_are(
  'public','kivelle_dialogue_context_core',array['uuid','uuid','uuid'],
  'service_role',array['EXECUTE'],
  'only the server can retrieve bundled private dialogue context'
);

select is(
  has_function_privilege('authenticated','public.kivelle_dialogue_context_core(uuid,uuid,uuid)','EXECUTE'),
  false,
  'clients cannot call the private context bundle directly'
);

select * from finish();
rollback;
