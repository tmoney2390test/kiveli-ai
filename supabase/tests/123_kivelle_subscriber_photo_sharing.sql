begin;
select plan(11);

select is((select public from storage.buckets where id='together-user-media'),false,'shared photos stay in the private media bucket');
select has_column('public','together_conversation_attachments','expires_at','shared photos have a server expiry');
select col_not_null('public','together_conversation_attachments','expires_at','every shared photo receives an expiry');
select has_column('public','together_conversation_attachments','storage_deleted_at','original deletion is recorded independently of safe context');
select col_is_null('public','together_conversation_attachments','storage_path','expired originals can be removed while safe follow-up context remains');
select has_index('public','together_conversation_attachments','together_conversation_attachments_expiry_idx','original expiry cleanup is indexed');
select has_index('public','together_conversation_attachments','together_conversation_attachments_request_idx','upload preparation retries are idempotent');
select has_trigger('public','together_conversation_attachments','together_attachment_queue_storage_cleanup','row deletion queues private object cleanup');
select like(pg_get_functiondef('public.kivelle_claim_chat_user_message(uuid,uuid,uuid,uuid,text,text,jsonb,uuid[],uuid,uuid[])'::regprocedure),'%PHOTO_SHARING_SUBSCRIPTION_REQUIRED%','a forged client send is rejected by the canonical server writer');
select like(pg_get_functiondef('public.kivelle_claim_chat_user_message(uuid,uuid,uuid,uuid,text,text,jsonb,uuid[],uuid,uuid[])'::regprocedure),'%analysis_status=''ready''%','only safely processed photos can be attached to a message');
select unlike(pg_get_functiondef('public.kivelle_claim_chat_user_message(uuid,uuid,uuid,uuid,text,text,jsonb,uuid[],uuid,uuid[])'::regprocedure),'%credit%','ordinary photo sharing never reads or changes Kivelle Credits');

select * from finish();
rollback;
