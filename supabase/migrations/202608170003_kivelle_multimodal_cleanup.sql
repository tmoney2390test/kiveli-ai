begin;

-- Private multimodal objects must survive no longer than their canonical rows.
delete from public.together_storage_cleanup_jobs duplicate
using public.together_storage_cleanup_jobs keep
where duplicate.status='pending' and keep.status='pending'
  and duplicate.user_id=keep.user_id and duplicate.bucket_id=keep.bucket_id and duplicate.storage_path=keep.storage_path
  and (duplicate.created_at>keep.created_at or (duplicate.created_at=keep.created_at and duplicate.id>keep.id));
create unique index if not exists together_storage_cleanup_path_pending_idx
on public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path)
where status='pending';

create or replace function public.kivelle_queue_deleted_private_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.storage_path is not null and length(old.storage_path)>0 then
    insert into public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count)
    values(old.user_id,'together-user-media',old.storage_path,'pending',0)
    on conflict(user_id,bucket_id,storage_path) where status='pending' do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists together_attachment_queue_storage_cleanup on public.together_conversation_attachments;
create trigger together_attachment_queue_storage_cleanup after delete on public.together_conversation_attachments
for each row execute function public.kivelle_queue_deleted_private_media();

drop trigger if exists together_generated_media_queue_storage_cleanup on public.together_generated_media;
create trigger together_generated_media_queue_storage_cleanup after delete on public.together_generated_media
for each row execute function public.kivelle_queue_deleted_private_media();

comment on function public.kivelle_queue_deleted_private_media() is 'Queues private object removal after conversation, companion, Life, or account cascades delete canonical multimodal rows.';

commit;
