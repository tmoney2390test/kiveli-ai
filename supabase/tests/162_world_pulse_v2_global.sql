begin;
select plan(16);

select has_table('public','together_world_pulse_templates','V2 has a separate authored catalog');
select has_table('public','together_world_pulse_template_participants','V2 keeps ordered authored participants');
select has_table('public','together_world_pulse_occurrences','V2 persists global occurrences');
select has_table('public','together_world_pulse_occurrence_participants','V2 snapshots participant knowledge');
select has_table('public','together_world_pulse_engagements','V2 separates personal engagement');
select has_table('public','together_world_pulse_conversation_links','V2 separates owner/Life-scoped chat context');
select has_column('public','together_world_pulse_templates','scheduling_rank','Catalog ranks remain stable across deactivation');
select ok(exists(select 1 from pg_constraint where conrelid='public.together_world_pulse_occurrences'::regclass and contype='x' and conname='together_world_pulse_no_repeat_720h'),'Database exclusion enforces repeat spacing');
select ok(exists(select 1 from pg_trigger where tgrelid='public.together_world_pulse_occurrences'::regclass and tgname='together_world_pulse_occurrence_snapshot_guard'),'Published event time and copy are immutable');
select ok((select relrowsecurity from pg_class where oid='public.together_world_pulse_occurrences'::regclass),'Global occurrences enforce service-only RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_world_pulse_engagements'::regclass),'Engagements enforce owner RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_world_pulse_conversation_links'::regclass),'Chat links enforce owner RLS');
select ok(not has_table_privilege('authenticated','public.together_world_pulse_occurrences','SELECT'),'Clients cannot read hidden global snapshots');
select ok(not has_table_privilege('authenticated','public.together_world_pulse_engagements','INSERT'),'Clients cannot forge engagement');
select ok(not has_function_privilege('authenticated','public.kivelle_world_pulse_create_group(uuid,uuid,uuid,uuid,uuid[],text)','EXECUTE'),'Only service role can create Pulse groups');
select ok(has_function_privilege('service_role','public.kivelle_world_pulse_reserve_world(uuid,date,integer)','EXECUTE'),'Service role can reserve global events');

select * from finish();
rollback;
