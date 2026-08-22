begin;
select plan(6);

select has_function(
  'public',
  'kivelle_proactive_message_dedupe_key',
  array['uuid','uuid','uuid','uuid','text','timestamp with time zone'],
  'Proactive message identity has one canonical generator'
);
select has_function(
  'public',
  'kivelle_ensure_proactive_message_dedupe',
  array[]::text[],
  'Missing proactive dedupe keys are repaired at the database boundary'
);
select has_trigger(
  'public',
  'together_proactive_messages',
  'together_proactive_messages_ensure_dedupe',
  'Every proactive message writer is protected by the dedupe guard'
);
select is(
  public.kivelle_proactive_message_dedupe_key('11111111-1111-1111-1111-111111111111',null,null,null,'Hello',now()),
  'event:11111111-1111-1111-1111-111111111111',
  'Life-event messages use the application event key convention'
);
select is(
  public.kivelle_proactive_message_dedupe_key(null,'22222222-2222-2222-2222-222222222222',null,null,'Hello',now()),
  'thread:22222222-2222-2222-2222-222222222222',
  'Open-thread messages use the application thread key convention'
);
select is(
  public.kivelle_proactive_message_dedupe_key(null,null,'33333333-3333-3333-3333-333333333333',null,'Hello','2026-08-20T21:00:00Z'),
  public.kivelle_proactive_message_dedupe_key(null,null,'33333333-3333-3333-3333-333333333333',null,'Hello','2026-08-20T21:00:00Z'),
  'Fallback proactive identity is deterministic'
);

select * from finish();
rollback;
