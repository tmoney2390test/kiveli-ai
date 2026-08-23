begin;
select plan(8);

select ok(exists(select 1 from public.together_locations where id='11000000-0000-4000-8000-000000000028' and slug='juniper-civic-arena'),'Juniper Civic Arena is seeded');
select is((select world.slug from public.together_locations location join public.together_worlds world on world.id=location.world_id where location.slug='juniper-civic-arena'),'juniper-city','The arena belongs to Juniper City');
select is((select parent.slug from public.together_locations location join public.together_locations parent on parent.id=location.parent_location_id where location.slug='juniper-civic-arena'),'civic-commons','The arena has canonical Civic Commons ancestry');
select is((select jsonb_array_length(metadata->'event_programs') from public.together_locations where slug='juniper-civic-arena'),4,'The arena has four canonical sports programs');
select ok((select possible_activities @> array['basketball game','hockey game','indoor soccer','boxing night'] from public.together_locations where slug='juniper-civic-arena'),'All arena sports are plan-discoverable');
select ok((select metadata->'interactionPacks' ? 'sports' from public.together_locations where slug='juniper-civic-arena'),'Arena scenes use the sports interaction pack');
select ok((select canonical_visual_context->'visualAnchors' ? 'curved roofline' from public.together_locations where slug='juniper-civic-arena'),'Arena visual identity has a stable anchor');
select ok((select canonical_lore->'stableFacts' ? 'The arena hosts basketball, hockey, indoor soccer, and boxing.' from public.together_locations where slug='juniper-civic-arena'),'Characters receive canonical arena facts');

select * from finish();
rollback;
