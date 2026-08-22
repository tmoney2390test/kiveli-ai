begin;
select plan(5);

select has_column('public','together_conversations','user_archived_at','Explicitly removed chats record their archive time');
select has_column('public','together_conversations','restore_until','Explicitly removed chats record their restore deadline');
select has_index('public','together_conversations','together_conversations_user_archive_idx','Recoverable chat lookup is indexed');
select has_function('public','kivelle_restore_conversation',array['uuid','uuid'],'Chat restoration is transactional');
select col_is_null('public','together_conversations','user_archived_at','Ordinary conversation history is not a user-deleted archive');

select * from finish();
rollback;
