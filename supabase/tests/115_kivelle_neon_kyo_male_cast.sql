begin;
select plan(18);

select is((select count(*)::integer from public.together_character_templates where id::text like '22000000-0000-4000-8009-0000000000%'),45,
  'NEON KYO now contains 45 resident companion templates');
select is((select count(*)::integer from public.together_character_templates where id::text like '22000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45),15,
  'The NEON KYO expansion adds exactly 15 companions');
select ok(not exists(select 1 from public.together_character_templates where id::text like '22000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45 and age<18),
  'Every new NEON KYO companion is an adult');
select is((select count(*)::integer from public.together_character_templates where id::text like '22000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45 and discovery_metadata->>'gender'='male'),15,
  'Every expansion companion is discoverable as male');
select is((select count(*)::integer from public.together_character_versions where id::text like '23000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45 and pronouns='he/him'),15,
  'Every expansion companion has the correct speaker identity');
select is((select count(*)::integer from public.together_character_versions where id::text like '23000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45
  and portrait_asset_key=(select slug from public.together_character_templates where id=character_template_id)),15,
  'Every expansion companion has a canonical packaged portrait key');
select ok(not exists(select 1 from public.together_character_versions where id::text like '23000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45
  and(coalesce(character_bible->>'dialogueTone','')='' or coalesce(character_bible->>'storyHook','')='' or jsonb_array_length(coalesce(character_bible->'identityFacts','[]'::jsonb))<4)),
  'Every expansion companion has a rich identity and dialogue bible');
select is((select count(*)::integer from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000009'
  and character_version_id::text like '23000000-0000-4000-8009-%' and right(character_version_id::text,12)::bigint between 31 and 45 and presence_type='resident'),15,
  'Every expansion companion is a canonical NEON KYO resident');
select is((select count(*)::integer from public.together_character_voice_profiles where character_template_id::text like '22000000-0000-4000-8009-%' and right(character_template_id::text,12)::bigint between 31 and 45
  and active and provider_mappings->>'xai' in('leo','rex','sal')),15,
  'Every expansion companion has a stable production male voice');
select is((select count(*)::integer from public.together_character_versions where id::text like '23000000-0000-4000-8009-%' and right(id::text,12)::bigint between 31 and 45
  and coalesce((content_boundaries->>'allows_romance')::boolean,false)
  and coalesce((content_boundaries->>'allows_mature')::boolean,false)
  and coalesce((content_boundaries->>'allows_explicit')::boolean,false)),15,
  'Every fictional adult supports the normal Kivelle content capability ladder');

select is((select count(*)::integer from public.together_schedule_templates where character_version_id::text like '23000000-0000-4000-8009-%' and right(character_version_id::text,12)::bigint between 31 and 45
  and metadata->>'source'='neon_kyo_male_expansion_v1'),630,
  'All 15 companions have six schedule blocks for seven days');
select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where character_version_id::text like '23000000-0000-4000-8009-%' and right(character_version_id::text,12)::bigint between 31 and 45 and metadata->>'source'='neon_kyo_male_expansion_v1'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) complete_days),105,'Every expansion companion-day has complete local-clock coverage');
select ok(not exists(select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second on second.character_version_id=first.character_version_id
    and second.day_of_week=first.day_of_week and second.id>first.id
    and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.character_version_id::text like '23000000-0000-4000-8009-%' and right(first.character_version_id::text,12)::bigint between 31 and 45
    and first.metadata->>'source'='neon_kyo_male_expansion_v1'),
  'Expansion schedules never overlap');
select ok(not exists(select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text like '23000000-0000-4000-8009-%' and right(schedule.character_version_id::text,12)::bigint between 31 and 45
    and schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000009'::uuid),
  'Every public routine stays inside NEON KYO');
select is((select count(distinct source_template_id)::integer from public.together_character_relationship_edges
  where world_id='10000000-0000-4000-8000-000000000009' and source_template_id::text like '22000000-0000-4000-8009-%' and right(source_template_id::text,12)::bigint between 31 and 45),15,
  'Every new companion participates in the NEON KYO social graph');
select ok(not exists(select template.id from public.together_character_templates template
  left join public.together_character_relationship_edges edge on edge.source_template_id=template.id and edge.world_id='10000000-0000-4000-8000-000000000009'
  where template.id::text like '22000000-0000-4000-8009-%' and right(template.id::text,12)::bigint between 31 and 45 group by template.id having count(edge.id)<4),
  'Every new companion has at least four authored social connections');
select is((select count(*)::integer from public.together_character_templates template
  join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text like '22000000-0000-4000-8009-%' and right(template.id::text,12)::bigint between 31 and 45 and location.world_id='10000000-0000-4000-8000-000000000009'),15,
  'Every first meeting resolves to a real NEON KYO location');
select is((select metadata->>'maleResidentCompanionCount' from public.together_worlds where slug='neon-kyo'),'15',
  'NEON KYO advertises the expanded male roster');

select * from finish();
rollback;
