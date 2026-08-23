begin;
select plan(10);

select has_column('public','together_messages','response_to_message_id','assistant responses retain their canonical user message');
select has_column('public','together_messages','response_key','assistant responses have an idempotency key');
select has_index('public','together_messages','together_messages_response_key_idx','response idempotency is enforced by a unique index');
select has_index('public','together_messages','together_messages_response_to_idx','causal response recovery is indexed');
select trigger_is('public','together_messages','together_messages_validate_ownership','public','kivelle_validate_chat_message_ownership','all message writers receive cross-user ownership validation');
select has_function('public','kivelle_claim_chat_user_message',array['uuid','uuid','uuid','uuid','text','text','jsonb','uuid[]','uuid','uuid[]'],'message and attachment claims are atomic');
select has_function('public','kivelle_commit_direct_message',array['uuid','uuid','uuid','text','jsonb','text'],'direct response commits are turn-token guarded');
select has_function('public','kivelle_commit_group_message_v2',array['uuid','integer','uuid','text','jsonb'],'group response commits report idempotent replay');

select function_privs_are(
  'public','kivelle_claim_chat_user_message',array['uuid','uuid','uuid','uuid','text','text','jsonb','uuid[]','uuid','uuid[]'],
  'authenticated',array[]::text[],'clients cannot bypass the canonical message writer'
);
select function_privs_are(
  'public','kivelle_commit_direct_message',array['uuid','uuid','uuid','text','jsonb','text'],
  'authenticated',array[]::text[],'clients cannot commit assistant replies'
);

select * from finish();
rollback;
