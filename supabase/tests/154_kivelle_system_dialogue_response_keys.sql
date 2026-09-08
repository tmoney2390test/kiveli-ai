begin;
select plan(4);

select has_function(
  'public',
  'kivelle_commit_direct_system_message',
  array['uuid','uuid','uuid','text','jsonb','text'],
  'Direct system dialogue events use the canonical idempotent writer'
);

select alike(
  regexp_replace(
    lower(pg_get_functiondef('public.kivelle_validate_chat_message_ownership()'::regprocedure)),
    '\s+',
    '',
    'g'
  ),
  '%new.response_keyisnotnullandnew.rolenotin(''assistant'',''system'')%',
  'System dialogue events may carry an idempotency response key'
);

select unlike(
  regexp_replace(
    lower(pg_get_functiondef('public.kivelle_validate_chat_message_ownership()'::regprocedure)),
    '\s+',
    '',
    'g'
  ),
  '%new.response_keyisnotnullandnew.role<>''assistant''%',
  'The legacy assistant-only response-key guard is removed'
);

select function_privs_are(
  'public',
  'kivelle_commit_direct_system_message',
  array['uuid','uuid','uuid','text','jsonb','text'],
  'authenticated',
  array[]::text[],
  'Clients cannot forge system dialogue events'
);

select * from finish();
rollback;
