begin;

-- A browser tab opened before signed chat-photo uploads were deployed still
-- sends an upsert request. Supabase Storage requires SELECT as part of that
-- operation. Permit it only while the exact randomized attachment path is an
-- unbound, pending upload owned by the authenticated user. Completed and
-- failed attachments remain unavailable through direct Storage reads.
create or replace function public.kivelle_can_upload_pending_chat_photo(
  p_storage_path text
) returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.together_conversation_attachments attachment
    where attachment.user_id=auth.uid()
      and attachment.storage_path=p_storage_path
      and attachment.upload_status='pending'
      and attachment.message_id is null
  );
$$;

revoke all on function public.kivelle_can_upload_pending_chat_photo(text)
  from public,anon;
grant execute on function public.kivelle_can_upload_pending_chat_photo(text)
  to authenticated,service_role;

drop policy if exists together_media_pending_photo_upload_read
  on storage.objects;
create policy together_media_pending_photo_upload_read
  on storage.objects
  for select
  to authenticated
  using(
    bucket_id='together-user-media'
    and public.kivelle_can_upload_pending_chat_photo(name)
  );

commit;
