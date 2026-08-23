begin;
select plan(31);

select has_table('public','together_ops_incidents','operations incidents have canonical storage');
select has_table('public','together_ops_ticket_events','support ticket history is durable');
select has_table('public','together_ops_alert_rules','alert thresholds are configurable');
select has_table('public','together_ops_alert_events','alert delivery attempts are durable');
select has_table('public','together_ops_audit_log','operator actions have an audit ledger');
select has_table('public','together_ops_release_records','production releases are traceable');
select has_table('public','together_client_sessions','privacy-safe client version heartbeats are durable');

select has_column('public','together_client_error_events','incident_id','client errors can be grouped into incidents');
select has_column('public','together_support_tickets','assigned_to','support tickets can be assigned');
select has_column('public','together_support_tickets','tags','support tickets support structured tags');
select has_column('public','together_support_tickets','first_response_at','first response time is measurable');
select has_column('public','together_support_tickets','resolved_at','resolution time is measurable');
select has_column('public','together_support_tickets','incident_id','support tickets can link to incidents');

select has_function('public','kivelle_ops_upsert_incident',array['text','text','text','text','text','text','jsonb'],'incident grouping is atomic');
select has_function('public','kivelle_ops_find_user',array['text'],'safe exact account lookup exists');
select has_function('public','kivelle_ops_latest_migration',array[]::text[],'release health can resolve the database version');
select has_trigger('public','together_ops_audit_log','together_ops_audit_immutable','operations audit entries are immutable');
select alike(pg_get_functiondef('public.kivelle_ops_audit_immutable()'::regprocedure),'%operations audit records are immutable%','audit mutation is rejected by the database');

select policies_are('public','together_ops_incidents',array[]::text[],'incidents are server-only');
select policies_are('public','together_ops_ticket_events',array[]::text[],'ticket history is server-only');
select policies_are('public','together_ops_alert_rules',array[]::text[],'alert rules are server-only');
select policies_are('public','together_ops_alert_events',array[]::text[],'alert events are server-only');
select policies_are('public','together_ops_audit_log',array[]::text[],'audit entries are server-only');
select policies_are('public','together_ops_release_records',array[]::text[],'release records are server-only');
select policies_are('public','together_client_sessions',array[]::text[],'client heartbeats are server-only');

select ok(not has_table_privilege('authenticated','public.together_ops_incidents','SELECT'),'clients cannot enumerate incidents');
select ok(not has_table_privilege('authenticated','public.together_ops_audit_log','SELECT'),'clients cannot enumerate the audit trail');
select ok(not has_table_privilege('authenticated','public.together_client_sessions','SELECT'),'clients cannot enumerate version heartbeats');
select ok(not has_function_privilege('authenticated','public.kivelle_ops_find_user(text)','EXECUTE'),'clients cannot query auth accounts');
select ok(not has_function_privilege('authenticated','public.kivelle_ops_upsert_incident(text,text,text,text,text,text,jsonb)','EXECUTE'),'clients cannot create incidents directly');
select results_eq('select count(*)::bigint from public.together_ops_alert_rules',array[10::bigint],'the initial production alert pack is seeded exactly once');

select * from finish();
rollback;
