begin;
select plan(26);

select is((select count(*)::integer from public.together_character_templates
  where slug in('jun-park','rowan-hale') and discovery_metadata->>'gender'='woman' and discovery_metadata->>'pronouns'='she/her'),2,
  'Jun Park and Rowan Hale are canonically women');

select is((select count(*)::integer
  from public.together_character_templates template
  join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
  where template.slug in('jun-park','rowan-hale') and version.pronouns='she/her'
    and version.appearance_config->>'gender'='woman' and version.visual_identity->>'gender'='woman'),2,
  'Jun and Rowan carry female identity through their published versions');

select ok(not exists(
  select 1
  from public.together_character_templates template
  join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
  where template.slug in('jun-park','rowan-hale')
    and(lower(version.visual_identity->>'canonicalDescription') like '% man %'
      or lower(version.visual_identity->>'canonicalDescription') like '% male %')
),'Jun and Rowan no longer carry male visual descriptions');

select is((select count(*)::integer
  from public.together_character_templates template
  join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
  where template.slug in('jun-park','rowan-hale') and template.discovery_metadata->>'portraitStatus'='ready'
    and version.visual_identity->>'status'='reference_ready'
    and jsonb_array_length(coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb))>=1),2,
  'The existing Jun and Rowan female portrait references remain ready');

select is((select count(*)::integer
  from public.together_character_voice_profiles profile
  join public.together_character_templates template on template.id=profile.character_template_id
  where template.slug in('jun-park','rowan-hale') and profile.active and profile.characteristics->>'gender'='woman'),2,
  'Jun and Rowan have persistent female voice profiles');

select is((select count(*)::integer from public.together_character_templates
  where slug in('ren-takahashi','gideon-price') and published and lifecycle_status='published'
    and visibility='public' and can_be_selected and can_be_romanced),2,
  'Ren and Gideon are fully selectable romanceable companions');

select is((select age from public.together_character_templates where slug='ren-takahashi'),34,
  'Ren Takahashi is 34');

select is((select age from public.together_character_templates where slug='gideon-price'),50,
  'Gideon Price is 50');

select is((select discovery_metadata->>'background' from public.together_character_templates where slug='ren-takahashi'),
  'Japanese-British conservation engineer','Ren is the requested Asian male companion');

select is((select count(*)::integer from public.together_character_templates
  where slug in('ren-takahashi','gideon-price') and discovery_metadata->>'gender'='man' and discovery_metadata->>'pronouns'='he/him'),2,
  'Both additions are canonically men');

select ok(not exists(select 1 from public.together_character_templates
  where slug in('ren-takahashi','gideon-price') and(coalesce(first_meeting->>'location_id','')='' or coalesce(first_meeting->>'opening_line','')='')),
  'Both additions have concrete first meetings');

select ok(not exists(
  select 1 from public.together_character_templates template
  left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.slug in('ren-takahashi','gideon-price')
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid
),'New first meetings resolve inside Vespormoor');

select is((select count(*)::integer
  from public.together_character_world_presence presence
  where presence.world_id='10000000-0000-4000-8000-000000000010'
    and presence.character_version_id in('23000000-0000-4000-8010-000000000046','23000000-0000-4000-8010-000000000047')
    and presence.presence_type='resident'),2,
  'Both additions are Vespormoor residents');

select is((select count(*)::integer from public.together_character_voice_profiles
  where character_template_id in('22000000-0000-4000-8010-000000000046','22000000-0000-4000-8010-000000000047') and active),2,
  'Both additions have stable voice profiles');

select ok(not exists(select 1 from public.together_character_versions
  where id in('23000000-0000-4000-8010-000000000046','23000000-0000-4000-8010-000000000047')
    and(jsonb_array_length(coalesce(character_bible->'anecdotes','[]'::jsonb))<2
      or coalesce(character_bible->>'depthVersion','0')::integer<5
      or coalesce(character_bible->>'dialogueTone','')='')),
  'Both additions meet the depth-v5 character standard');

select ok(not exists(
  select character_version_id from public.together_character_place_profiles
  where character_version_id in('23000000-0000-4000-8010-000000000046','23000000-0000-4000-8010-000000000047')
  group by character_version_id having count(*)<5
),'Both additions have at least five place perspectives');

select is((select count(*)::integer from public.together_schedule_templates
  where metadata->>'source'='vespormoor_authored_schedule_v3'),84,
  'Both additions have six schedule blocks for seven days');

select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where metadata->>'source'='vespormoor_authored_schedule_v3'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) days),14,'Every new resident-day has complete coverage');

select ok(not exists(
  select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second
    on second.character_version_id=first.character_version_id and second.day_of_week=first.day_of_week and second.id>first.id
   and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.metadata->>'source'='vespormoor_authored_schedule_v3' and second.metadata->>'source'='vespormoor_authored_schedule_v3'
),'New schedules never overlap themselves');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'source'='vespormoor_authored_schedule_v3'
    and schedule.location_id is not null
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid
),'Every public schedule block resolves to a Vespormoor place');

select ok(not exists(select 1 from public.together_schedule_templates
  where metadata->>'source'='vespormoor_authored_schedule_v3'
    and jsonb_array_length(coalesce(metadata->'activityVariants','[]'::jsonb))<3),
  'Every schedule block has three presentation variants');

select ok(not exists(
  select template.id
  from public.together_character_templates template
  where template.slug in('ren-takahashi','gideon-price') and(
    select count(*) from public.together_character_relationship_edges edge
    where edge.world_id='10000000-0000-4000-8000-000000000010' and edge.source_template_id=template.id
  )<5
),'Each addition has at least five directed social relationships');

select is((select count(*)::integer from public.together_story_arc_templates
  where slug in('vespormoor-stone-that-remembers','vespormoor-repeated-patient') and active),2,
  'Both additions receive dialogue-driven story arcs');

select ok(not exists(select 1 from public.together_story_arc_templates
  where slug in('vespormoor-stone-that-remembers','vespormoor-repeated-patient')
    and(jsonb_array_length(chapters)<>3 or coalesce(prerequisites->>'dialogueDriven','false')<>'true')),
  'Both new arcs are three-step dialogue-driven stories');

select ok((select
  '22000000-0000-4000-8010-000000000046'::uuid=any(participant_template_ids)
  and '22000000-0000-4000-8010-000000000047'::uuid=any(participant_template_ids)
  from public.together_event_templates where id='3a000000-0000-4000-8010-000000000004'),
  'Both additions can appear at High Gardens Open Afternoon');

select is((select metadata->>'residentCompanionCount' from public.together_worlds where slug='vespormoor'),
  '47','Vespormoor advertises the expanded 47-person roster');

select * from finish();
rollback;
