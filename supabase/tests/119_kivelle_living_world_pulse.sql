begin;
select plan(8);

select has_table('public','together_world_event_templates','World Pulse template table exists');
select has_table('public','together_world_event_instances','World Pulse instance table exists');
select has_table('public','together_world_event_participants','World Pulse participant table exists');
select is((select count(*)::integer from public.together_world_event_templates template join public.together_worlds world on world.id=template.world_id where world.slug='port-vervelle' and template.metadata->>'source'='port_vervelle_world_pulse_v1'),30,'Port Vervelle pilot contains 30 grounded pulse events');
select ok((select count(*) from public.together_world_event_templates template join public.together_worlds world on world.id=template.world_id where template.metadata->>'source'='living_world_pulse_v1' and world.slug in('juniper-city','neon-kyo','vespormoor','northvale','eos-meridian'))>=25,'Every current world receives a minimum behavior pack');
select is((select count(*)::integer from public.together_world_event_templates template join public.together_locations location on location.id=template.location_id where location.world_id<>template.world_id),0,'No pulse template crosses world boundaries');
select is((select count(*)::integer from public.together_world_event_templates where active and (duration_minutes<15 or probability<0 or probability>1)),0,'Active pulse templates have valid timing and probability');
select ok((select count(*) from public.together_world_event_templates where plan_affordances?'reason')>=25,'Actionable events expose grounded planning reasons');

select * from finish();
rollback;
