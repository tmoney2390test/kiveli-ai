begin;
select plan(2);
select has_function('public','kivelle_queue_deleted_private_media',array[]::text[],'private media cleanup function exists');
select has_index('public','together_storage_cleanup_jobs','together_storage_cleanup_path_pending_idx','pending cleanup is idempotent by path');
select * from finish();
rollback;
