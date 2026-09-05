begin;

select plan(7);

select has_function(
  'public',
  'kivelle_dialogue_context_core',
  array['uuid','uuid','uuid'],
  'dialogue context RPC exists'
);

select ok(
  not has_function_privilege('anon','public.kivelle_dialogue_context_core(uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.kivelle_dialogue_context_core(uuid,uuid,uuid)','execute'),
  'clients cannot invoke the dialogue context RPC directly'
);

select ok(
  has_function_privilege('service_role','public.kivelle_dialogue_context_core(uuid,uuid,uuid)','execute'),
  'the service role can load dialogue context'
);

select matches(
  pg_get_functiondef('public.kivelle_dialogue_context_core(uuid,uuid,uuid)'::regprocedure),
  '''socialKnowledge''',
  'dialogue context includes canonical social knowledge'
);

select matches(
  pg_get_functiondef('public.kivelle_dialogue_context_core(uuid,uuid,uuid)'::regprocedure),
  'current_character\.user_id=p_user_id',
  'social context is bound to the authenticated user character instance'
);

select matches(
  pg_get_functiondef('public.kivelle_dialogue_context_core(uuid,uuid,uuid)'::regprocedure),
  'other\.creator_id=p_user_id',
  'private custom characters are owner scoped'
);

select ok(
  exists(
    select 1
    from public.together_character_relationship_edges edge
    join public.together_character_templates source on source.id=edge.source_template_id
    join public.together_character_templates target on target.id=edge.target_template_id
    where source.slug='queen-maerra-vaelorian'
      and target.slug='princess-maris-vaelorian'
      and edge.relationship_type='niece and protected heir'
      and edge.history ilike '%possible successor%'
  ),
  'Queen Maerra has an authored relationship and history with Princess Maris'
);

select * from finish();
rollback;
