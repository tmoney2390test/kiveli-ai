begin;
select plan(35);

select has_table('public','kivelle_rate_limit_windows','Rate-limit windows are durable and repository-owned');
select ok(to_regprocedure('public.consume_rate_limit(text,text,integer,integer)') is not null,'Atomic rate-limit RPC exists');
select ok(public.consume_rate_limit('pgtap-concurrency','message',2,60),'First request is admitted');
select ok(public.consume_rate_limit('pgtap-concurrency','message',2,60),'Second request is admitted');
select ok(not public.consume_rate_limit('pgtap-concurrency','message',2,60),'Concurrent window limit rejects the excess request');
select ok(not has_function_privilege('authenticated','public.consume_rate_limit(text,text,integer,integer)','EXECUTE'),'Clients cannot mutate rate windows');
select has_table('public','kivelle_provider_concurrency_leases','Provider backpressure leases are durable');
select ok(to_regprocedure('public.kivelle_acquire_provider_slot(text,text,uuid,integer,integer)') is not null,'Provider slots are atomically acquired');
select ok(to_regprocedure('public.kivelle_release_provider_slot(uuid)') is not null,'Provider slots are explicitly released');
select alike(pg_get_functiondef('public.kivelle_acquire_provider_slot(text,text,uuid,integer,integer)'::regprocedure),'%pg_advisory_xact_lock%','Provider admission is serialized per provider');

select has_column('public','together_dialogue_turns','request_id','Dialogue turns have idempotent request identity');
select has_column('public','together_dialogue_turns','turn_kind','Dialogue turns distinguish direct and group floors');
select has_column('public','together_dialogue_turns','lease_token','Dialogue turns have ownership tokens');
select has_column('public','together_dialogue_turns','lease_expires_at','Dialogue turn leases expire');
select ok((select indexdef ilike 'create unique index%' from pg_indexes where schemaname='public' and indexname='together_dialogue_turns_active_idx'),'Only one active turn is permitted per conversation');
select ok(to_regprocedure('public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer)') is not null,'Atomic turn acquisition exists');
select ok(to_regprocedure('public.kivelle_activate_dialogue_turn(uuid,uuid,uuid,jsonb,jsonb,integer)') is not null,'Turn activation is token-guarded');
select ok(to_regprocedure('public.kivelle_touch_dialogue_turn(uuid,uuid,integer)') is not null,'Long group turns can renew their floor');
select ok(to_regprocedure('public.kivelle_finish_dialogue_turn(uuid,uuid,text,jsonb)') is not null,'Turn completion is token-guarded');
select alike(pg_get_functiondef('public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer)'::regprocedure),'%for update%','Turn acquisition serializes on the conversation row');
select alike(pg_get_functiondef('public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer)'::regprocedure),'%active_turn.state%planning%','An in-progress setup cannot be superseded');

select has_column('public','together_media_provider_jobs','poll_lease_token','Provider polling has an ownership token');
select has_column('public','together_media_provider_jobs','poll_lease_expires_at','Provider polling leases expire');
select has_column('public','together_media_provider_jobs','finalization_lease_token','Media finalization has an ownership token');
select has_column('public','together_media_provider_jobs','finalization_lease_expires_at','Media finalization leases expire');
select ok(to_regprocedure('public.kivelle_claim_media_jobs_v2(integer,integer)') is not null,'Fair bounded media claiming exists');
select ok(to_regprocedure('public.kivelle_claim_media_provider_poll_jobs(text,integer,integer)') is not null,'Provider polls are atomically claimed');
select ok(to_regprocedure('public.kivelle_claim_stale_synchronous_media_jobs(text[],timestamp with time zone,integer,integer)') is not null,'Stale synchronous recovery is atomically claimed');
select ok(to_regprocedure('public.kivelle_claim_media_finalization(uuid,integer)') is not null,'Media finalization is atomically claimed');
select alike(lower(pg_get_functiondef('public.kivelle_claim_media_jobs_v2(integer,integer)'::regprocedure)),'%row_number() over (partition by media.user_id%','Media claiming distributes a batch across users');
select alike(pg_get_functiondef('public.kivelle_claim_media_jobs_v2(integer,integer)'::regprocedure),'%kivelle-media-global-claim%','Global media admission is serialized');
select alike(pg_get_functiondef('public.kivelle_claim_media_provider_poll_jobs(text,integer,integer)'::regprocedure),'%for update skip locked%','Concurrent dispatchers cannot poll the same job');
select alike(pg_get_functiondef('public.kivelle_claim_media_finalization(uuid,integer)'::regprocedure),'%finalization_lease_expires_at%','Webhook and polling finalization share one lease');
select results_eq('select count(*)::bigint from cron.job where jobname=''together-media-dispatch''',array[1::bigint],'One durable media recovery dispatcher is scheduled');
select results_eq('select count(*)::bigint from cron.job where jobname=''kivelle-rate-limit-cleanup''',array[1::bigint],'Expired rate windows have scheduled cleanup');

select * from finish();
rollback;
