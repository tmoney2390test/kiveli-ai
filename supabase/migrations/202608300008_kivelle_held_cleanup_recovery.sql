-- Held account-deletion jobs become recoverable when auth deletion has already
-- nulled their owner but the final status transition was interrupted.
create index if not exists together_storage_cleanup_held_orphan_idx
  on public.together_storage_cleanup_jobs(created_at)
  where status = 'held' and user_id is null;
