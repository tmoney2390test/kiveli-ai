begin;

-- Promote the prepared Vespormoor shell to a complete playable world without
-- introducing a parallel world model. IDs remain stable for existing saves.
update public.together_worlds
set
  description='A secluded gothic mountain university town where modern life, old families, and human-presenting Veiled residents meet around the dark waters of Lake Vesper.',
  published=true,
  access_type='subscription',
  entitlement_key='worlds.standard',
  metadata=(metadata - 'supernaturalResidents' - 'covenantRules') || jsonb_build_object(
    'releaseStatus','playable',
    'contentStatus','complete_world_v1',
    'locationCatalogStatus','ready',
    'residentRosterStatus','ready',
    'residentCompanionCount',45,
    'residentRosterVersion',1,
    'locationPhotoStatus','individual_slots_ready',
    'mappedLocationPhotoCount',0,
    'locationImageSlotCount',51,
    'tagline','Every family keeps a secret. The lake keeps all of them.',
    'genreTags',jsonb_build_array('Gothic Romance','Mystery','University','Light Supernatural'),
    'supernaturalResidents',jsonb_build_array('witches','long-lived Veiled','Lake-Touched Veiled','empaths','intuitives','people with subtle inherited affinities'),
    'supernaturalRules',jsonb_build_array(
      'All Veiled are essentially human in appearance.',
      'There are no public creature races, transformations, monster bodies, or grotesque supernatural anatomy.',
      'Unusual abilities are subtle, personal, and normally deniable to outsiders.',
      'Vespormoor is a modern town; phones, cars, social media, contemporary work, and university life are ordinary.'
    ),
    'covenantRules',jsonb_build_array(
      'Keep the Veiled secret from the outside world.',
      'Never coerce or prey upon an unwilling person.',
      'Use unusual abilities with restraint.',
      'Do not bring old supernatural conflicts into the valley.'
    ),
    'canonicalLore',jsonb_build_object(
      'origin','Vespormoor was founded in 1712 by Lucien Vesper and his sister Isolde around Lake Vesper.',
      'founding','The settlement became a refuge for ordinary people and human-presenting people with unusual abilities or bloodlines.',
      'covenant','The Vesper Covenant requires secrecy, mutual protection, and restraint in the use of unusual abilities.',
      'burningWinter','The Burning Winter of 1846 destroyed much of Old Vesper. Lucien disappeared afterward; Isolde vanished decades later.',
      'lakeWarning','Nothing beneath the water shall be awakened.',
      'modernDay','A contemporary university town known for its castle-estate campus, lake, forests, spas, history, nightlife, and eccentric traditions.',
      'presentThreat','Lights move beneath Lake Vesper, old properties are becoming active again, subtle magic is behaving unpredictably, and Vesper House sometimes glows at night.'
    ),
    'worldBehavior',jsonb_build_object(
      'ordinaryLifeFirst',true,
      'topics',jsonb_build_array('classes','work','dating','local gossip','food','parties','weather','hobbies','friends','family','nightlife','plans'),
      'supernaturalDisclosure','Reveal only according to character knowledge, trust, relationship, circumstance, and story progress.',
      'avoid',jsonb_build_array('constant supernatural exposition','announcing magical identity unprompted','monster fantasy','historical-costume default')
    )
  ),
  visual_context=visual_context || jsonb_build_object(
    'setting','A modern secluded gothic mountain university town surrounding Lake Vesper.',
    'architecture',jsonb_build_array('Victorian and gothic townhouses','rain-dark civic stone','warm contemporary cafes inside old buildings','enormous connected castle-estate university','old family estates'),
    'visualStyle',jsonb_build_array('photorealistic contemporary gothic romance','wet cobblestone and amber lamps','cool fog against warm interiors','autumn vegetation','subtle mystery'),
    'modernity',jsonb_build_array('phones','cars','social media','modern jobs','university life','contemporary fashion'),
    'avoid',jsonb_build_array('overt high-fantasy spectacle','visible monsters','transformations','grotesque anatomy','historical costume by default','graphic horror','cyberpunk neon','theme-park Gothic')
  ),
  updated_at=now()
where id='10000000-0000-4000-8000-000000000010';

-- Adopt the author-specified public slugs while preserving old route spellings
-- as aliases for planner/search compatibility.
create temporary table vespormoor_slug_updates(
  location_index integer primary key,
  canonical_slug text not null,
  legacy_slug text
) on commit drop;

insert into vespormoor_slug_updates values
  (7,'vesper-square',null),(8,'black-lantern','the-black-lantern'),(9,'morrow-and-quill',null),
  (10,'belladonna-apothecary',null),(11,'mourning-cup','the-mourning-cup'),(12,'saint-orison-chapel',null),(13,'velvet-thorn',null),
  (14,'vesper-house',null),(15,'blackwood-estate',null),(16,'rosegrave-gardens',null),(17,'the-conservatory',null),
  (18,'hawthorne-riding-club',null),(19,'vesper-heights-overlook',null),(20,'vale-house',null),
  (21,'glasswater-pier',null),(22,'stillwater-house',null),(23,'drowned-bell','the-drowned-bell'),
  (24,'vesper-boatworks',null),(25,'moonwake-baths',null),(26,'whisper-dock',null),(27,'sunken-chapel','the-sunken-chapel'),
  (28,'grand-hall','the-grand-hall'),(29,'blackglass-library',null),(30,'vesper-tower',null),(31,'the-cloisters',null),
  (32,'blackwood-dormitories',null),(33,'anatomy-hall',null),(34,'observatory','the-observatory'),
  (35,'undercroft','the-undercroft'),(36,'rookery-house',null),(37,'high-gardens','the-high-gardens'),
  (38,'thornwood-trailhead',null),(39,'witchs-falls',null),(40,'foxglove-retreats','foxglove-cabin-retreats'),
  (41,'crooked-oak','the-crooked-oak'),(42,'moonstone-quarry',null),(43,'standing-stones','the-standing-stones'),
  (44,'morrow-vale-ranger-station',null),(45,'nocturne',null),(46,'crimson-room','the-crimson-room'),
  (47,'black-veil-tattoo',null),(48,'dead-letter',null),(49,'afterdark-diner',null),(50,'red-market','the-red-market'),
  (51,'saint-mercy-hotel',null);

update public.together_locations location
set
  slug=seed.canonical_slug,
  visual_asset_key='vespormoor-location-'||seed.canonical_slug,
  metadata=location.metadata || jsonb_strip_nulls(jsonb_build_object(
    'photoStatus','slot_ready',
    'imageSlotKey','vespormoor-location-'||seed.canonical_slug,
    'aliases',case when seed.legacy_slug is null then location.metadata->'aliases' else coalesce(location.metadata->'aliases','[]'::jsonb)||to_jsonb(seed.legacy_slug) end,
    'source','vespormoor_world_v1'
  )),
  canonical_visual_context=location.canonical_visual_context || jsonb_build_object(
    'referenceAssetKey','vespormoor-location-'||seed.canonical_slug,
    'worldAesthetic',jsonb_build_array('photorealistic','modern gothic','rain','amber lamps','fog','autumn','Lake Vesper'),
    'avoid',jsonb_build_array('historical costume by default','visible monsters','fantasy creature anatomy','generic reused district image')
  ),
  updated_at=now()
from vespormoor_slug_updates seed
where location.id=('29000000-0000-4000-8000-'||lpad(seed.location_index::text,12,'0'))::uuid;

-- Districts also receive their own stable image slots.
update public.together_locations
set visual_asset_key='vespormoor-location-'||slug,
    metadata=metadata||jsonb_build_object('photoStatus','slot_ready','imageSlotKey','vespormoor-location-'||slug,'source','vespormoor_world_v1'),
    canonical_visual_context=canonical_visual_context||jsonb_build_object('referenceAssetKey','vespormoor-location-'||slug),
    updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and parent_location_id is null;

update public.together_locations
set description='A rustic tavern and restaurant frequented by locals, hikers, rangers, and forest workers.',
    canonical_lore=jsonb_set(coalesce(canonical_lore,'{}'::jsonb),'{summary}',to_jsonb('A rustic Thornwood tavern shared by locals, hikers, rangers, and forest workers.'::text),true),
    updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='crooked-oak';

update public.together_locations
set description='An old waterfront tavern popular with boat crews, students, locals, and discreet Veiled regulars.',updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='drowned-bell';

update public.together_locations
set description='An exclusive members-only lounge popular with old families, artists, and discreet Veiled residents.',updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='crimson-room';

update public.together_locations
set description='A hidden nighttime marketplace for rare ingredients, warded objects, information, and discreet services.',
    possible_activities=array['night market','rare ingredients','information trading','unusual goods']::text[],updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='red-market';

-- The previous preview lore stored a few neighbor slugs inline. Keep those
-- references coherent after the public slug promotion.
update public.together_locations
set canonical_lore=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      canonical_lore::text,
      'the-black-lantern','black-lantern'),'the-mourning-cup','mourning-cup'),'the-drowned-bell','drowned-bell'),
      'the-sunken-chapel','sunken-chapel'),'the-grand-hall','grand-hall'),'the-observatory','observatory'),
      'the-undercroft','undercroft'),'the-high-gardens','high-gardens'),'foxglove-cabin-retreats','foxglove-retreats'),
      'the-crooked-oak','crooked-oak'),'the-standing-stones','standing-stones'),'the-crimson-room','crimson-room'),
      'the-red-market','red-market')::jsonb,
    updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010';

-- Repair location anchors from the depth pack that intentionally shipped
-- before the final public slugs were selected. Lake-wide facts anchor to the
-- Lakeward district instead of inventing a fake Lake Vesper venue.
update public.together_world_facts fact set location_id=location.id,updated_at=now()
from public.together_locations location
where fact.world_id='10000000-0000-4000-8000-000000000010'
  and location.world_id=fact.world_id
  and location.slug=case
    when fact.slug='vesper-missing-clause' then 'undercroft'
    when fact.slug='vesper-standing-stones' then 'standing-stones'
    when fact.slug='vesper-red-market-debts' then 'red-market'
    when fact.slug in('vesper-lake-remembers','vesper-lake-warning','vesper-lake-lights','vesper-animals-avoid-shore','vesper-night-boating','vesper-lake-ice') then 'lakeward'
  end
  and fact.slug in('vesper-missing-clause','vesper-standing-stones','vesper-red-market-debts','vesper-lake-remembers','vesper-lake-warning','vesper-lake-lights','vesper-animals-avoid-shore','vesper-night-boating','vesper-lake-ice');

update public.together_dialogue_opportunities item set location_id=location.id,updated_at=now()
from public.together_locations location
where item.world_id='10000000-0000-4000-8000-000000000010' and location.world_id=item.world_id
  and ((item.slug='vespormoor-missing-clause' and location.slug='undercroft')
    or (item.slug='vespormoor-lake-remembers' and location.slug='lakeward'));

update public.together_scene_interaction_beats item set location_id=location.id,updated_at=now()
from public.together_locations location
where item.world_id='10000000-0000-4000-8000-000000000010' and location.world_id=item.world_id
  and ((item.slug='vespormoor-missing-clause' and location.slug='undercroft')
    or (item.slug='vespormoor-lake-remembers' and location.slug='lakeward'));

-- Earlier authored depth used predatory vampire language. Preserve the consent
-- rule while aligning it to this world's subtle, human-presenting Veiled canon.
update public.together_world_facts set
  title='Covenant non-coercion',
  fact_text='The Vesper Covenant forbids using an unusual ability, influence, or old-family power to coerce an unwilling person.',
  category='law',content_level='standard',topic_tags=array['covenant','consent','veiled','non-coercion'],
  trigger_terms=array['covenant consent','use an ability','coercion','unwilling person'],updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='vesper-unwilling-prey';

update public.together_dialogue_opportunities set
  topic='Covenant rules against coercion',
  angle='Why subtle abilities and inherited influence make affirmative consent especially important.',
  content_level='standard',topic_tags=array['covenant','consent','ability','power'],
  trigger_terms=array['covenant consent','ability influence','coercion'],updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='vespormoor-unwilling-prey';

update public.together_scene_interaction_beats set
  title='Covenant rules against coercion',
  seed='A Veiled companion may establish or restate how unusual abilities remain subordinate to consent; no influence or intimacy is assumed.',
  content_level='standard',topic_tags=array['covenant','consent','ability','power'],updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010' and slug='vespormoor-unwilling-prey';

-- Opening hours power place cards and planning availability. Outdoor and
-- landmark rows intentionally remain ungated unless they have controlled access.
update public.together_locations set hours=case
  when slug='black-lantern' then '{"open":"16:00","close":"02:00"}'::jsonb
  when slug='morrow-and-quill' then '{"open":"09:00","close":"21:00"}'::jsonb
  when slug='belladonna-apothecary' then '{"open":"09:00","close":"18:00"}'::jsonb
  when slug='mourning-cup' then '{"open":"06:30","close":"20:00"}'::jsonb
  when slug='saint-orison-chapel' then '{"open":"07:00","close":"20:00"}'::jsonb
  when slug='velvet-thorn' then '{"open":"18:00","close":"02:00"}'::jsonb
  when slug='the-conservatory' then '{"open":"11:30","close":"23:00"}'::jsonb
  when slug='hawthorne-riding-club' then '{"open":"06:00","close":"19:00"}'::jsonb
  when slug='stillwater-house' then '{"open":"17:00","close":"00:00"}'::jsonb
  when slug='drowned-bell' then '{"open":"12:00","close":"02:00"}'::jsonb
  when slug='vesper-boatworks' then '{"open":"07:00","close":"19:00"}'::jsonb
  when slug='moonwake-baths' then '{"open":"08:00","close":"22:00"}'::jsonb
  when slug='blackglass-library' then '{"open":"07:00","close":"00:00"}'::jsonb
  when slug='anatomy-hall' then '{"open":"07:00","close":"22:00"}'::jsonb
  when slug='observatory' then '{"open":"15:00","close":"02:00"}'::jsonb
  when slug='rookery-house' then '{"open":"07:00","close":"01:00"}'::jsonb
  when slug='foxglove-retreats' then '{"open":"00:00","close":"24:00"}'::jsonb
  when slug='crooked-oak' then '{"open":"11:00","close":"00:00"}'::jsonb
  when slug='morrow-vale-ranger-station' then '{"open":"06:00","close":"22:00"}'::jsonb
  when slug='nocturne' then '{"open":"21:00","close":"04:00"}'::jsonb
  when slug='crimson-room' then '{"open":"18:00","close":"03:00"}'::jsonb
  when slug='black-veil-tattoo' then '{"open":"11:00","close":"22:00"}'::jsonb
  when slug='dead-letter' then '{"open":"18:00","close":"02:00"}'::jsonb
  when slug='afterdark-diner' then '{"open":"00:00","close":"24:00"}'::jsonb
  when slug='red-market' then '{"open":"20:00","close":"03:00"}'::jsonb
  when slug='saint-mercy-hotel' then '{"open":"00:00","close":"24:00"}'::jsonb
  else hours
end,updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010';

do $$
declare district_count int; place_count int; slot_count int;
begin
  select count(*) filter(where parent_location_id is null),count(*) filter(where parent_location_id is not null),count(*) filter(where visual_asset_key is not null)
  into district_count,place_count,slot_count
  from public.together_locations where world_id='10000000-0000-4000-8000-000000000010';
  if district_count<>6 or place_count<>45 or slot_count<>51 then
    raise exception 'Vespormoor catalog validation failed: districts %, places %, image slots %',district_count,place_count,slot_count;
  end if;
end $$;

commit;
