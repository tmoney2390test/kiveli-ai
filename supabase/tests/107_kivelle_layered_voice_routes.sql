begin;
select plan(23);

select has_column('public','together_voice_call_sessions','route','calls persist the selected Standard or Express route');
select has_column('public','together_voice_call_sessions','billing_mode','calls persist their billing mode');
select has_column('public','together_voice_call_sessions','credits_per_minute','calls snapshot their configured Credit rate');
select has_column('public','together_voice_call_sessions','included_minutes_charged','calls track included Standard minutes');
select has_column('public','together_voice_call_sessions','relay_session_id','calls can correlate a relay session without storing content');
select has_column('public','together_voice_call_sessions','last_usage_sequence','relay reconnects continue usage sequencing');
select has_index('public','together_voice_call_sessions','together_voice_call_route_period_idx','route-period operations queries are indexed');

select has_table('public','together_voice_minute_ledger','route-aware per-started-minute billing is durable');
select col_is_unique('public','together_voice_minute_ledger',array['call_session_id','minute_number'],'each call minute is billed once');
select has_index('public','together_voice_minute_ledger','together_voice_minute_allowance_idx','included allowance queries are indexed');
select policies_are('public','together_voice_minute_ledger',array['together_voice_minute_own_read'],'minute billing is privately readable');
select is(has_table_privilege('authenticated','public.together_voice_minute_ledger','INSERT'),false,'clients cannot forge minute charges');
select is(has_table_privilege('authenticated','public.together_voice_minute_ledger','UPDATE'),false,'clients cannot change minute charges');
select is(has_table_privilege('authenticated','public.together_voice_minute_ledger','DELETE'),false,'clients cannot remove minute charges');

select has_table('public','together_voice_pipeline_usage_events','Standard pipeline telemetry has normalized storage');
select col_is_unique('public','together_voice_pipeline_usage_events',array['call_session_id','sequence'],'pipeline usage is idempotent by call and sequence');
select has_index('public','together_voice_pipeline_usage_events','together_voice_pipeline_period_idx','pipeline operations queries are indexed');
select policies_are('public','together_voice_pipeline_usage_events',array[]::text[],'pipeline cost telemetry has no client-readable policy');
select is(has_table_privilege('authenticated','public.together_voice_pipeline_usage_events','SELECT'),false,'clients cannot read provider cost internals');
select is(has_table_privilege('authenticated','public.together_voice_pipeline_usage_events','INSERT'),false,'clients cannot forge pipeline cost telemetry');

select ok(to_regprocedure('public.kivelle_allocate_voice_included_minute(uuid,uuid,integer,integer,timestamp with time zone,timestamp with time zone)') is not null,'included-minute allocation is transactional');
select function_privs_are('public','kivelle_allocate_voice_included_minute',array['uuid','uuid','integer','integer','timestamp with time zone','timestamp with time zone'],'service_role',array['EXECUTE'],'only the backend allocates included minutes');
select ok(not has_function_privilege('authenticated','public.kivelle_allocate_voice_included_minute(uuid,uuid,integer,integer,timestamptz,timestamptz)','EXECUTE'),'clients cannot allocate their own included minutes');

select * from finish();
rollback;
