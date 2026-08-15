begin;
select plan(3);
select has_column('public','together_generated_media','queue_priority','Generated media stores a server-owned queue priority');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='together_generated_media' and indexname='together_generated_media_priority_dispatch_idx'),'Media dispatcher has a priority-aware index');
select like(pg_get_functiondef('public.kivelle_claim_media_jobs(integer)'::regprocedure),'%order by queue_priority desc,created_at%','Media dispatcher claims higher-tier jobs before FIFO within a tier');
select * from finish();
rollback;
