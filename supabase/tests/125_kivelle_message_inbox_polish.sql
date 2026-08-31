begin;
select plan(8);

select has_column('public','together_conversations','last_message_delivery_status','Inbox stores the newest delivery state');
select has_column('public','together_conversations','last_message_attachment_kind','Inbox stores only the safe newest attachment category');
select col_is_null('public','together_conversations','last_message_attachment_kind','An ordinary text chat has no attachment category by default');
select has_function('public','kivelle_update_conversation_message_state',array[]::text[],'Message inserts and status changes hydrate inbox state');
select trigger_is('public','together_messages','together_message_conversation_state','public','kivelle_update_conversation_message_state','Message changes update the conversation preview');
select trigger_is('public','together_conversation_attachments','together_attachment_conversation_state','public','kivelle_update_conversation_attachment_state','Attachment changes update the safe inbox media label');
select ok(
  pg_get_functiondef('public.kivelle_update_conversation_message_state()'::regprocedure) like '%last_message_preview=case%',
  'Message-state hydration includes the inbox preview'
);
select ok(
  (
    select pg_get_triggerdef(oid) like '%AFTER INSERT OR UPDATE OF content, role, delivery_status%'
    from pg_trigger
    where tgrelid='public.together_messages'::regclass
      and tgname='together_message_conversation_state'
  ),
  'Preview hydration runs for inserts and response updates'
);

select * from finish();
rollback;
