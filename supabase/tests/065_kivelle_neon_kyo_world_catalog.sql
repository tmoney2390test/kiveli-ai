begin;
select plan(12);

select is((select count(*)::integer from public.together_worlds where published),4,'the published Kivelle catalog contains exactly four worlds');
select is((select array_agg(slug order by slug) from public.together_worlds where published),array['juniper-city','neon-kyo','port-vervelle','vespormoor']::text[],'the published catalog includes Juniper City, NEON KYO, Port Vervelle, and Vespormoor');
select ok((select published and featured and world_role='home' and social_rhythm='always_on' and access_type='subscription' and entitlement_key='worlds.standard' and timezone='Asia/Tokyo' from public.together_worlds where slug='neon-kyo'),'NEON KYO has its canonical home-world identity and access model');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000009'),51,'NEON KYO contains six districts and forty-five public places');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000009' and depth=0 and location_type='district'),6,'NEON KYO contains six root districts');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000009' and depth=1 and parent_location_id is not null),45,'NEON KYO contains forty-five browsable district places');
select is((select count(distinct slug)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000009'),51,'every NEON KYO location slug is unique');
select is((select location.slug from public.together_worlds world join public.together_locations location on location.id=world.default_arrival_location_id where world.slug='neon-kyo'),'hikari-crossing','Hikari Crossing is the canonical arrival point');
select is((select count(*)::integer from public.together_locations child left join public.together_locations parent on parent.id=child.parent_location_id where child.world_id='10000000-0000-4000-8000-000000000009' and child.depth=1 and (parent.id is null or parent.world_id<>child.world_id or parent.depth<>0)),0,'every NEON KYO place belongs to a district in the same world');
select is((select count(*)::integer from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000009' and active),4,'NEON KYO includes four native event seeds');
select is((select count(*)::integer from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000009' and active),2,'NEON KYO includes two native story arcs');
select is((select count(*)::integer from public.together_date_templates where world_id='10000000-0000-4000-8000-000000000009' and active),2,'NEON KYO includes two native dates');

select * from finish();
rollback;
