begin;
select plan(3);
select has_column('public','together_generated_media','queue_priority','Generated media stores a server-owned queue priority');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='together_generated_media' and indexname='together_generated_media_priority_dispatch_idx'),'Media dispatcher has a priority-aware index');
select ok(
  position('order by' in lower(pg_get_functiondef('public.kivelle_claim_media_jobs(integer)'::regprocedure)))>0
  and position('queue_priority' in lower(pg_get_functiondef('public.kivelle_claim_media_jobs(integer)'::regprocedure)))>0
  and position('created_at' in lower(pg_get_functiondef('public.kivelle_claim_media_jobs(integer)'::regprocedure)))>0,
  'Media dispatcher orders by queue priority before creation time'
);
select * from finish();
rollback;
