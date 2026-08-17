begin;
select plan(17);

select has_table('public','together_character_reset_operations','Full character replacement has an idempotency ledger');
select has_column('public','together_character_reset_operations','request_id','Reset retries use a client request id');
select has_column('public','together_character_reset_operations','previous_character_instance_id','The old relationship id is retained without a live foreign key');
select has_column('public','together_character_reset_operations','replacement_character_instance_id','The replacement relationship id is retained');
select has_column('public','together_character_reset_operations','result','The safe reset result is retained for idempotent retries');
select has_index('public','together_character_reset_operations','together_character_reset_operations_previous_idx','Reset history is indexed by relationship');
select ok((select relrowsecurity from pg_class where oid='public.together_character_reset_operations'::regclass),'Reset operations use RLS');
select has_column('public','together_destructive_action_audit','request_id','Destructive audit records carry idempotency context');
select has_column('public','together_destructive_action_audit','continuity_id','Destructive audit records carry Life context');
select has_column('public','together_destructive_action_audit','replacement_character_instance_id','Destructive audit records carry replacement identity');
select has_column('public','together_destructive_action_audit','result','Destructive audit records remain content-free and structured');
select has_function('public','kivelle_start_over_character',array['uuid','uuid','text'],'Start over is an atomic server-side replacement');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='together_character_reset_operations_user_id_request_id_key'),'A reset request can be retried idempotently');
select ok(exists(select 1 from pg_constraint where conrelid='public.together_character_reset_operations'::regclass and contype='u' and conname='together_character_reset_operations_user_id_request_id_key'),'Request ids are unique per user');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='together_destructive_action_audit_request_idx'),'Reset audit lookup is indexed');
select ok((select prosecdef from pg_proc where oid='public.kivelle_start_over_character(uuid,uuid,text)'::regprocedure),'Reset function is security definer');
select ok((select proconfig @> array['search_path=public,extensions'] from pg_proc where oid='public.kivelle_start_over_character(uuid,uuid,text)'::regprocedure),'Reset function pins its search path');

select * from finish();
rollback;

