begin;
select plan(2);

select ok(
  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='together_character_schedule_events'),
  'Character schedule changes are available to the live chat presence channel'
);
select ok(
  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='together_scene_sessions'),
  'Active scene changes are available to the live chat presence channel'
);

select * from finish();
rollback;
