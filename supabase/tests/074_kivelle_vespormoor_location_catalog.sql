begin;
select plan(6);

select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and parent_location_id is null and location_type='district'),6,'Vespormoor has six districts');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and parent_location_id is not null),45,'Vespormoor has forty-five district locations');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and nullif(canonical_visual_context->>'canonicalPrompt','') is not null and metadata->>'photoStatus'='ready'),51,'Every Vespormoor location has ready individual art grounding');
select ok((select published from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'Vespormoor is published');
select is((select default_arrival_location_id from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'29000000-0000-4000-8000-000000000007'::uuid,'Vespormoor arrival is Vesper Square');
select is((select metadata->>'locationCatalogStatus' from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'ready','Vespormoor location catalog is ready');

select * from finish();
rollback;
