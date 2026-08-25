begin;
select plan(24);

select is((select count(*)::integer from public.together_worlds where id='10000000-0000-4000-8000-000000000011' and slug='northvale' and published),1,
  'NorthVale is a published canonical world');
select is((select timezone from public.together_worlds where slug='northvale'),'America/Denver','NorthVale uses its Colorado timezone');
select is((select default_arrival_location_id from public.together_worlds where slug='northvale'),'2b000000-0000-4000-8000-000000000007'::uuid,
  'Lantern Square is the default arrival');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000011'),51,
  'NorthVale has 51 canonical locations');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000011' and location_type='district'),6,
  'NorthVale has six districts');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000011' and parent_location_id is not null),45,
  'NorthVale has 45 public places');
select ok(not exists(select 1 from public.together_locations where world_id='10000000-0000-4000-8000-000000000011'
  and(coalesce(canonical_visual_context->>'canonicalPrompt','')='' or coalesce(canonical_lore->>'summary','')='')),
  'Every NorthVale location has authored visual and lore context');

select is((select count(*)::integer from public.together_character_templates where id::text like '24000000-0000-4000-8011-%'),45,
  'NorthVale has 45 companions');
select is((select count(*)::integer from public.together_character_templates where id::text like '24000000-0000-4000-8011-%' and published and can_be_selected and can_be_romanced),45,
  'Every NorthVale companion is playable and romanceable');
select ok(not exists(select 1 from public.together_character_templates where id::text like '24000000-0000-4000-8011-%' and age<18),
  'Every NorthVale companion is an adult');
select is((select count(*)::integer from public.together_character_versions where id::text like '25000000-0000-4000-8011-%' and portrait_asset_key like 'northvale-character-%'),45,
  'Every NorthVale companion has a primary portrait key');
select ok(not exists(select 1 from public.together_character_versions where id::text like '25000000-0000-4000-8011-%'
  and(coalesce(character_bible->>'dialogueTone','')='' or jsonb_array_length(coalesce(character_bible->'traits','[]'::jsonb))<3)),
  'Every companion has a distinct dialogue bible');
select is((select count(*)::integer from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000011'
  and character_version_id::text like '25000000-0000-4000-8011-%' and presence_type='resident'),45,
  'Every companion is a NorthVale resident');
select is((select count(*)::integer from public.together_character_voice_profiles where character_template_id::text like '24000000-0000-4000-8011-%' and active),45,
  'Every companion has a stable voice profile');

select is((select count(*)::integer from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8011-%'),1890,
  'All companions have six authored schedule blocks for seven days');
select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where character_version_id::text like '25000000-0000-4000-8011-%'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) days),315,'Every resident-day has complete coverage');
select ok(not exists(select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second on second.character_version_id=first.character_version_id
    and second.day_of_week=first.day_of_week and second.id>first.id
    and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.character_version_id::text like '25000000-0000-4000-8011-%'),
  'NorthVale schedules never overlap');
select ok(not exists(select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text like '25000000-0000-4000-8011-%' and schedule.location_id is not null
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000011'::uuid),
  'Every public routine resolves inside NorthVale');

select ok((select count(*)>=82 from public.together_character_relationship_edges where world_id='10000000-0000-4000-8000-000000000011'),
  'The authored social graph is directed and substantial');
select is((select count(*)::integer from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000011' and active),6,
  'NorthVale has six recurring events');
select is((select count(*)::integer from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000011' and active),7,
  'NorthVale has seven dialogue-driven story arcs');
select is((select count(*)::integer from public.together_world_facts where world_id='10000000-0000-4000-8000-000000000011' and active),20,
  'NorthVale has 20 retrieval-driven world facts');
select is((select count(*)::integer from public.together_dialogue_opportunities where world_id='10000000-0000-4000-8000-000000000011' and active),12,
  'NorthVale has 12 retrieval-driven dialogue opportunities');
select is((select count(*)::integer from public.together_date_templates where world_id='10000000-0000-4000-8000-000000000011' and active),18,
  'NorthVale has 18 native date and shared-scene seeds');

select * from finish();
rollback;
