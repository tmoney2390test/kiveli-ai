begin;
select plan(34);

select is(
  (select count(*)::integer from public.together_locations
   where world_id='10000000-0000-4000-8000-000000000008'
     and slug in('sotto-sale','museo-marittimo-vervelle')),
  2,'Only the two necessary expansion workplaces are added');

select ok(not exists(
  select 1 from public.together_locations
  where slug in('sotto-sale','museo-marittimo-vervelle')
    and (world_id<>'10000000-0000-4000-8000-000000000008' or parent_location_id<>'27000000-0000-4000-8000-000000000001')
),'Both new places are correctly scoped to Porto Vecchio');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and published and lifecycle_status='published' and visibility='public'
     and can_be_selected and can_be_romanced),
  12,'Twelve new men are published, selectable, and romanceable');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and age>=18 and discovery_metadata->>'gender'='man'
     and discovery_metadata->>'residentWorldSlug'='port-vervelle'),
  12,'Every new resident is an adult man scoped to Port Vervelle');

with expected(slug,age) as(values
  ('matteo-bellandi',28),('alessandro-moretti',32),('enzo-moretti',21),('gabriel-laurent',30),
  ('luca-bianchi',34),('idris-benali',26),('marco-de-santis',36),('rafael-silva',27),
  ('nico-valenti',25),('lorenzo-bellaforte',29),('elias-romano',31),('theo-mancini',24)
)
select ok(not exists(
  select 1 from expected
  left join public.together_character_templates template using(slug)
  where template.id is null or template.age<>expected.age
),'Every new character has the authored name slug and age');

select ok(
  (select count(*) from public.together_character_templates where id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$' and spice_level=1)=1
  and (select count(*) from public.together_character_templates where id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$' and spice_level=2)=4
  and (select count(*) from public.together_character_templates where id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$' and spice_level=3)=7,
  'Spice pacing matches the authored 1/4/7 distribution');

select is(
  (select count(*)::integer from public.together_character_versions
   where id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and published_at is not null and portrait_asset_key is null
     and appearance_config->>'portraitStatus'='slot_ready'
     and visual_identity->>'status'='pending_reference'
     and length(visual_identity->>'canonicalDescription')>180),
  12,'Every version has a detailed visual identity and an honest portrait slot');

select is(
  (select count(distinct visual_identity->>'canonicalDescription')::integer
   from public.together_character_versions
   where id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'),
  12,'All twelve men have distinct canonical appearance definitions');

select is(
  (select count(*)::integer from public.together_character_voice_profiles profile
   where profile.character_template_id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and profile.active and profile.provider_mappings->>'xai' in('leo','rex','sal')),
  12,'All twelve companions have stable approved male xAI voice mappings');

select ok(not exists(
  select 1 from public.together_character_templates template
  left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and (location.id is null or location.world_id<>'10000000-0000-4000-8000-000000000008')
),'Every first meeting uses a real Port Vervelle location');

select is(
  (select count(*)::integer from public.together_character_world_presence
   where character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and world_id='10000000-0000-4000-8000-000000000008' and presence_type='resident'),
  12,'Every new character is a Port Vervelle resident');

select ok(not exists(
  select 1 from public.together_character_world_presence
  where character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and world_id<>'10000000-0000-4000-8000-000000000008'
),'No new companion leaks into another world');

select is(
  (select count(*)::integer from public.together_character_homes
   where character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and active and source='authored' and reference_policy='text_only'),
  12,'Every new resident has a private authored home without a fake map venue');

select is(
  (select count(*)::integer from public.together_schedule_templates
   where character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
     and metadata->>'source'='port_vervelle_male_schedule_v1'),
  504,'Twelve residents each receive six authored blocks for all seven days');

select ok(not exists(
  select 1
  from public.together_character_versions version cross join generate_series(0,6) day_number
  left join public.together_schedule_templates schedule
    on schedule.character_version_id=version.id and schedule.day_of_week=day_number
   and schedule.metadata->>'source'='port_vervelle_male_schedule_v1'
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
  group by version.id,day_number having count(schedule.id)<>6
),'Every new resident-day has exactly six coherent schedule blocks');

select ok(not exists(
  select 1 from public.together_schedule_templates a
  join public.together_schedule_templates b
    on b.character_version_id=a.character_version_id and b.day_of_week=a.day_of_week and b.id<>a.id
   and a.start_minute<b.end_minute and b.start_minute<a.end_minute
  where a.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and a.metadata->>'source'='port_vervelle_male_schedule_v1'
    and b.metadata->>'source'='port_vervelle_male_schedule_v1'
),'No authored schedule places one character in two locations at once');

with ordered as(
  select schedule.*,
    lag(schedule.end_minute) over(
      partition by schedule.character_version_id,schedule.day_of_week
      order by schedule.start_minute
    ) previous_end
  from public.together_schedule_templates schedule
  where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and schedule.metadata->>'source'='port_vervelle_male_schedule_v1'
),daily as(
  select character_version_id,day_of_week,min(start_minute) first_minute,max(end_minute) last_minute
  from ordered group by character_version_id,day_of_week
)
select ok(
  not exists(select 1 from ordered where start_minute<>coalesce(previous_end,0))
  and not exists(select 1 from daily where first_minute<>0 or last_minute<>1440),
  'Every authored schedule covers the full local day without gaps');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and schedule.metadata->>'source'='port_vervelle_male_schedule_v1'
    and schedule.location_id is not null
    and location.world_id<>'10000000-0000-4000-8000-000000000008'
),'Every scheduled public location remains inside Port Vervelle');

select ok(not exists(
  select 1
  from public.together_character_versions version
  cross join generate_series(0,6) day_number
  cross join unnest(array[0,480,720,960,1200]) probe_minute
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and not exists(
      select 1 from public.together_schedule_templates schedule
      where schedule.character_version_id=version.id and schedule.day_of_week=day_number
        and schedule.metadata->>'source'='port_vervelle_male_schedule_v1'
        and schedule.start_minute<=probe_minute and schedule.end_minute>probe_minute
    )
),'Schedules resolve at 00:00, 08:00, 12:00, 16:00, and 20:00 every day');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and (select count(distinct coalesce(schedule.location_id::text,schedule.metadata->>'displayLocation'))
         from public.together_schedule_templates schedule
         where schedule.character_version_id=version.id and schedule.metadata->>'source'='port_vervelle_male_schedule_v1')<4
),'Every resident moves among at least four distinct public or private contexts');

select is(
  (select location.slug from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   join public.together_locations location on location.id=schedule.location_id
   where template.slug='enzo-moretti' and schedule.day_of_week=3 and schedule.start_minute<=720 and schedule.end_minute>720),
  'spiaggia-solana','Enzo is working at Solana Beach on a weekday afternoon');

select is(
  (select location.slug from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   join public.together_locations location on location.id=schedule.location_id
   where template.slug='idris-benali' and schedule.day_of_week=5 and schedule.start_minute<=1200 and schedule.end_minute>1200),
  'la-sirena','Idris is working the Friday night La Sirena event');

select is(
  (select location.slug from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   join public.together_locations location on location.id=schedule.location_id
   where template.slug='alessandro-moretti' and schedule.day_of_week=3 and schedule.start_minute<=1200 and schedule.end_minute>1200),
  'sotto-sale','Sandro is busy at Sotto Sale during dinner service');

select is(
  (select location.slug from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   join public.together_locations location on location.id=schedule.location_id
   where template.slug='nico-valenti' and schedule.day_of_week=3 and schedule.start_minute<=960 and schedule.end_minute>960),
  'studio-ondine','Nico is quietly working at Studio Ondine during a weekday afternoon');

select isnt(
  (select coalesce(location.slug,'home') from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   left join public.together_locations location on location.id=schedule.location_id
   where template.slug='luca-bianchi' and schedule.day_of_week=0 and schedule.start_minute<=720 and schedule.end_minute>720),
  'vervelle-general-clinic','Luca has a real Sunday away from the clinic');

select is(
  (select count(*)::integer from public.together_character_relationship_edges
   where metadata->>'source'='port_vervelle_male_expansion_v1'),
  76,'Thirty-eight authored connections are readable in both directions');

select is(
  (select count(*)::integer from public.together_character_relationship_edges edge
   join public.together_character_templates source on source.id=edge.source_template_id
   join public.together_character_templates target on target.id=edge.target_template_id
   where edge.world_id='10000000-0000-4000-8000-000000000008'
     and ((source.slug='alessandro-moretti' and target.slug='enzo-moretti' and edge.relationship_type='brothers')
       or (source.slug='enzo-moretti' and target.slug='alessandro-moretti' and edge.relationship_type='brothers')
       or (source.slug='idris-benali' and target.slug='lea-benali' and edge.relationship_type='older_cousins')
       or (source.slug='lea-benali' and target.slug='idris-benali' and edge.relationship_type='older_cousins'))),
  4,'The Moretti brothers and Benali cousins are explicit reciprocal family relationships');

select ok(
  (select count(*) from public.together_character_relationship_edges edge
   join public.together_character_templates source on source.id=edge.source_template_id
   join public.together_character_templates target on target.id=edge.target_template_id
   where edge.metadata->>'source'='port_vervelle_male_expansion_v1'
     and source.discovery_metadata->>'gender'='female'
     and target.discovery_metadata->>'gender'='man')>=20,
  'Existing Port Vervelle women receive direct authored awareness of the new men');

select is(
  (select count(*)::integer from public.together_event_templates
   where world_id='10000000-0000-4000-8000-000000000008'
     and metadata->>'source'='port_vervelle_male_expansion_v1' and active),
  7,'Seven schedule-aware Port Vervelle social events integrate both casts');

select is(
  (select count(*)::integer from public.together_story_arc_templates
   where specific_world_id='10000000-0000-4000-8000-000000000008'
     and slug like 'port-vervelle-%' and active),
  12,'Each new companion has one dialogue-driven personal story thread');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and published and discovery_metadata->>'gender'='female'),
  30,'The existing thirty-woman Port Vervelle cast remains intact');

select is(
  (select (metadata->>'residentCompanionCount')::integer from public.together_worlds where slug='port-vervelle'),
  42,'Port Vervelle advertises the complete forty-two-character roster');

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  cross join lateral jsonb_array_elements_text(version.default_social_graph) circle_slug
  left join public.together_character_templates friend on friend.slug=circle_slug
  where template.id::text ~ '^22000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and friend.id is null
),'Every new character-bible social reference resolves to a published companion');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
    and (version.life_config->'occupation'->'scheduleBlocks' is null
      or version.life_config->'scheduling'->>'scheduleProfile'<>'port_vervelle_male_v1')
),'Every new companion uses the existing Life Engine with the authored expansion profile');

select * from finish();
rollback;
