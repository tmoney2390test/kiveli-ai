begin;
select plan(12);

select has_table('public','together_conversation_episodes','conversation episodes have durable storage');
select has_column('public','together_messages','conversation_sequence','messages have a stable sequence cursor');
select has_column('public','together_conversations','summary_through_sequence','rolling summaries use a stable sequence cursor');
select has_column('public','together_conversation_episodes','hierarchy_level','episode retrieval supports hierarchical chapters');
select has_column('public','together_conversation_episodes','source_episode_ids','chapters retain their immutable source episode IDs');
select has_index('public','together_messages','together_messages_sequence_page_idx','message paging has a sequence index');
select has_index('public','together_conversation_episodes','together_conversation_episodes_range_idx','episode range lookups are indexed');

select ok(not exists(
  select 1 from public.together_messages where conversation_sequence is null
),'all existing messages received a sequence cursor');

select ok(not exists(
  select 1 from public.together_messages
  group by conversation_id,conversation_sequence having count(*)>1
),'message sequence cursors are unique within each conversation');

select is(has_table_privilege('authenticated','public.together_conversation_episodes','SELECT'),false,
  'clients cannot fetch model-facing episode summaries directly');
select is(has_table_privilege('authenticated','public.together_conversation_episodes','INSERT'),false,
  'clients cannot forge episode summaries');

select is(
  has_function_privilege('authenticated','public.kivelle_match_conversation_episodes_server(uuid,uuid,uuid,text,extensions.vector,bigint,integer)','EXECUTE'),
  false,
  'clients cannot call private long-history retrieval directly'
);

select * from finish();
rollback;
