begin;
select plan(17);

select has_table('public','together_location_lore_layers','Server-only location lore layers exist');
select has_column('public','together_location_lore_layers','disclosure_scope','Gated lore declares its disclosure scope');
select has_column('public','together_location_lore_layers','required_story_keys','Gated lore supports story requirements');

select ok((select count(*)>=174 from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor')),'Every current four-world location record is in scope, including private and work locations');
select ok((select count(*)>=28 from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='juniper-city'),'Juniper City retains its public catalog plus existing private and work locations');
select is((select count(*)::integer from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='port-vervelle'),48,'Port Vervelle includes its expanded 48-location catalog');
select is((select count(*)::integer from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='neon-kyo'),51,'Neon Kyo retains 51 locations');
select is((select count(*)::integer from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug='vespormoor'),51,'Vespormoor retains 51 locations');

select is(
  (select count(*)::integer from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') and location.canonical_lore->>'version'='2' and location.canonical_lore->>'authored'='true'),
  (select count(*)::integer from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor'),
  'Every current location has authored v2 lore'
);
select ok(not exists(select 1 from public.together_locations location join public.together_worlds world on world.id=location.world_id where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') and(jsonb_array_length(location.canonical_lore->'sensoryDetails')<3 or jsonb_array_length(location.canonical_lore->'signatureDetails')<3 or jsonb_array_length(location.canonical_lore->'layout')<3 or location.canonical_lore->'crowdRhythm'='{}'::jsonb or location.canonical_lore->'activityNotes'='{}'::jsonb)),'Every bible has sensory, signature, layout, daypart, and activity depth');
select ok(not exists(select 1 from public.together_locations location join public.together_worlds world on world.id=location.world_id cross join lateral jsonb_array_elements_text(location.canonical_lore->'nearbyLocationSlugs') nearby(slug) left join public.together_locations target on target.world_id=location.world_id and target.slug=nearby.slug where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') and target.id is null),'Every nearby location slug resolves inside its world');
select is((select canonical_lore->'signatureDetails'->>0 from public.together_locations where slug='velvet-hour'),'black upright piano','Existing authored Juniper signature lore is preserved');
select is((select count(*)::integer from public.together_location_lore_layers where active),9,'Nine gated Neon Kyo and Vespormoor lore layers are seeded');
select ok((select relrowsecurity from pg_class where oid='public.together_location_lore_layers'::regclass),'Gated lore has row-level security enabled');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='together_location_lore_layers' and grantee in('anon','authenticated')),'Client roles have no gated-lore table grants');
select ok(not exists(select version.id from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id and version.version=template.current_published_version join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident' join public.together_worlds world on world.id=presence.world_id and world.slug in('juniper-city','port-vervelle','neon-kyo') left join public.together_character_place_profiles profile on profile.character_version_id=version.id where template.published and template.can_be_selected and template.lifecycle_status<>'archived' group by version.id having count(profile.id)<5),'Every current companion has at least five authored place anchors');
select ok((select count(*)>=400 from public.together_character_place_profiles profile join public.together_character_versions version on version.id=profile.character_version_id join public.together_character_templates template on template.id=version.character_template_id where template.published and template.can_be_selected),'The current roster has broad character-place perspective coverage');

select * from finish();
rollback;
