begin;
select plan(7);

select has_column('public','together_locations','canonical_lore','Locations own stable authored lore');
select ok(exists(select 1 from pg_constraint where conrelid='public.together_locations'::regclass and conname='together_locations_canonical_lore_object'),'Location lore must be a JSON object');
select ok(to_regclass('public.together_locations_canonical_lore_gin') is not null,'Location lore has a JSON search index');
select ok(exists(select 1 from public.together_worlds where slug='juniper-city'),'The Juniper starter world exists');
select is(
  (select count(*) from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='juniper-city' and location.canonical_lore<>'{}'::jsonb),
  (select count(*) from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='juniper-city'),
  'Every Juniper location has authored lore'
);
select ok(exists(select 1 from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='juniper-city' and location.slug='velvet-hour' and location.canonical_lore->'signatureDetails' ? 'black upright piano'),'Velvet Hour retains its canonical visual anchor');
select ok(exists(select 1 from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='juniper-city' and location.slug='maya-apartment' and location.canonical_lore->'localEtiquette' ? 'Do not imply the user is inside unless canonical scene state establishes co-presence.'),'Private residence lore preserves co-presence boundaries');

select * from finish();
rollback;
