begin;

select plan(4);

select function_returns('public','kivelle_apply_message_policy',array[]::text[],'trigger','message policy trigger remains installed');

select matches(
  pg_get_functiondef('public.kivelle_apply_message_policy()'::regprocedure),
  'private-adult-text-v1',
  'message policy recognizes only versioned private adult text'
);

select has_function(
  'public','kivelle_match_memories_for_projection',
  array['uuid','uuid','extensions.vector','integer','double precision','boolean','boolean'],
  'semantic memory projection separates web-restricted content from private adult text'
);

select matches(
  pg_get_functiondef('public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean,boolean)'::regprocedure),
  'p_include_private_adult_text',
  'semantic recall has an independent private-adult-text gate'
);

select * from finish();
rollback;

