begin;
select plan(37);

select is((select count(*)::integer from public.together_worlds where id='10000000-0000-4000-8000-000000000012' and slug='eos-meridian' and published),1,
  'Eos Meridian is a published canonical world');
select is((select timezone from public.together_worlds where slug='eos-meridian'),'UTC','Eos stores authored schedules on a neutral clock before user-local resolution');
select is((select default_arrival_location_id from public.together_worlds where slug='eos-meridian'),'2c000000-0000-4000-8000-000000000007'::uuid,
  'Meridian Concourse is the default arrival');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000012'),54,
  'Eos Meridian has 54 canonical locations');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000012' and location_type='district'),6,
  'Eos Meridian has six districts');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000012' and parent_location_id is not null),48,
  'Eos Meridian has 48 public places');
select ok(not exists(select 1 from public.together_locations where world_id='10000000-0000-4000-8000-000000000012'
  and(coalesce(canonical_visual_context->>'canonicalPrompt','')='' or coalesce(canonical_lore->>'summary','')='')),
  'Every Eos location has authored visual and lore context');

select is((select count(*)::integer from public.together_character_templates where id::text like '24000000-0000-4000-8012-%'),47,
  'Eos Meridian has 47 companions');
select is((select count(*)::integer from public.together_character_templates
  where id::text like '24000000-0000-4000-8012-%' and (discovery_metadata->>'gender')='woman'),29,
  'The complete Eos roster contains 29 women');
select is((select count(*)::integer from public.together_character_templates
  where right(id::text,12)::bigint between 31 and 47 and (discovery_metadata->>'gender')='woman'),13,
  'The cast expansion is more than seventy percent women');
select is((select count(*)::integer from public.together_character_templates
  where right(id::text,12)::bigint between 31 and 47 and age between 18 and 22),15,
  'The cast expansion leans strongly toward young adults ages 18 through 22');
select is((select count(*)::integer from public.together_character_templates where id::text like '24000000-0000-4000-8012-%' and published and can_be_selected and can_be_romanced),47,
  'Every Eos companion is playable and romanceable');
select ok(not exists(select 1 from public.together_character_templates where id::text like '24000000-0000-4000-8012-%' and age<18),
  'Every Eos companion is an adult');
select is((select count(*)::integer from public.together_character_versions where id::text like '25000000-0000-4000-8012-%' and portrait_asset_key like 'eos-meridian-character-%'),47,
  'Every Eos companion has a primary portrait key');
select ok(not exists(select 1 from public.together_character_versions where id::text like '25000000-0000-4000-8012-%'
  and(coalesce(character_bible->>'dialogueTone','')='' or jsonb_array_length(coalesce(character_bible->'traits','[]'::jsonb))<3)),
  'Every Eos companion has a distinct dialogue bible');
select is((select count(*)::integer from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000012'
  and character_version_id::text like '25000000-0000-4000-8012-%' and presence_type='resident'),47,
  'Every Eos companion is a resident');
select is((select count(*)::integer from public.together_character_voice_profiles where character_template_id::text like '24000000-0000-4000-8012-%' and active),47,
  'Every Eos companion has a stable voice profile');
select is((select count(*)::integer from public.together_character_voice_profiles where character_template_id::text like '24000000-0000-4000-8012-%'
  and active and provider_mappings->>'xai' in('eve','ara','sal','leo','rex')),47,
  'Every Eos companion maps to a production xAI voice');
select is((select count(distinct provider_mappings->>'xai')::integer from public.together_character_voice_profiles
  where character_template_id::text like '24000000-0000-4000-8012-%' and active),5,
  'Eos uses the full supported built-in voice palette');
select is((select count(*)::integer from public.together_character_versions where id::text like '25000000-0000-4000-8012-%'
  and coalesce((content_boundaries->>'allows_romance')::boolean,false)
  and coalesce((content_boundaries->>'allows_suggestive')::boolean,false)
  and coalesce((content_boundaries->>'allows_mature')::boolean,false)
  and coalesce((content_boundaries->>'allows_explicit')::boolean,false)),47,
  'Every Eos adult supports the normal Kivelle media capability ladder');
select is((select count(*)::integer from public.together_character_versions where id::text like '25000000-0000-4000-8012-%'
  and coalesce((visual_identity->>'fictional')::boolean,false) and coalesce(visual_identity->>'canonicalDescription','')<>''),47,
  'Every Eos image subject is explicitly fictional and visually grounded');
select is((select count(*)::integer from public.together_character_templates template
  join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text like '24000000-0000-4000-8012-%' and location.world_id='10000000-0000-4000-8000-000000000012'),47,
  'Every first meeting resolves to a real Eos location');
select ok(not exists(select 1 from public.together_character_templates where id::text like '24000000-0000-4000-8012-%'
  and (first_meeting->>'opener' ~ '\\m(she|he|they) routine\\M' or first_meeting->>'opener' ~ '^.* (Dr\\.|Commander) has a reason')),
  'First-meeting copy uses natural pronouns and names');
select ok(not exists(select version.id from public.together_character_versions version
  left join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident'
  where version.id::text like '25000000-0000-4000-8012-%'
  group by version.id having count(presence.world_id)<>1 or min(presence.world_id) is distinct from '10000000-0000-4000-8000-000000000012'::uuid),
  'Every Eos companion has exactly one canonical resident world for group eligibility');
select is((select count(distinct source_template_id)::integer from public.together_character_relationship_edges
  where world_id='10000000-0000-4000-8000-000000000012'),47,
  'Every Eos companion participates in the social graph used by group dialogue and mentions');

select is((select count(*)::integer from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8012-%'),1974,
  'All Eos companions have six schedule blocks for seven days');
select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where character_version_id::text like '25000000-0000-4000-8012-%'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) days),329,'Every Eos resident-day has complete coverage');
select ok(not exists(select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second on second.character_version_id=first.character_version_id
    and second.day_of_week=first.day_of_week and second.id>first.id
    and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.character_version_id::text like '25000000-0000-4000-8012-%'),
  'Eos schedules never overlap');
select ok(not exists(select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text like '25000000-0000-4000-8012-%' and schedule.location_id is not null
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000012'::uuid),
  'Every public routine resolves inside Eos Meridian');

select is((select count(*)::integer from public.together_character_relationship_edges where world_id='10000000-0000-4000-8000-000000000012'),180,
  'Eos has 90 authored undirected social links stored in both directions');
select is((select count(*)::integer from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000012' and active),8,
  'Eos has eight recurring ambient events');
select is((select count(*)::integer from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000012' and active),6,
  'Eos has six dialogue-driven story arcs');
select is((select count(*)::integer from public.together_world_facts where world_id='10000000-0000-4000-8000-000000000012' and active),30,
  'Eos has 30 retrieval-driven world facts');
select is((select count(*)::integer from public.together_dialogue_opportunities where world_id='10000000-0000-4000-8000-000000000012' and active),18,
  'Eos has 18 retrieval-driven dialogue opportunities');
select is((select count(*)::integer from public.together_scene_interaction_beats where world_id='10000000-0000-4000-8000-000000000012' and active),18,
  'Eos has 18 scene interaction beats');
select is((select count(*)::integer from public.together_date_templates where world_id='10000000-0000-4000-8000-000000000012' and active),18,
  'Eos has 18 native date and shared-scene seeds');
select is((select count(*)::integer from public.together_character_place_profiles profile
  join public.together_character_versions version on version.id=profile.character_version_id
  where version.id::text like '25000000-0000-4000-8012-%'),47,
  'Every Eos companion has an authored workplace perspective');

select * from finish();
rollback;
