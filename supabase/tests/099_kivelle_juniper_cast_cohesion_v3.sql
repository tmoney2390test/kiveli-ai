begin;
select plan(27);

select is((select count(*)::integer from public.together_character_templates
  where slug=any(array['alex','avery','chloe','elena','harper','maya','riley','sofia'])
    and not published and lifecycle_status='archived' and visibility='unlisted' and not can_be_selected),8,
  'Eight thin launch companions are retired from discovery without deletion');

select is((select count(*)::integer
  from public.together_character_world_presence presence
  join public.together_character_versions version on version.id=presence.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where presence.world_id='10000000-0000-4000-8000-000000000001' and presence.presence_type='resident'
    and template.published and template.lifecycle_status='published' and template.can_be_selected),36,
  'Juniper City has 36 active selectable residents');

select is((select count(*)::integer from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%'),13,
  'The targeted expansion adds thirteen fully authored companions');

select is((select count(*)::integer from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%' and discovery_metadata->>'gender'='man'),8,
  'The expansion includes eight men');

select is((select count(*)::integer from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%' and discovery_metadata->>'gender'='nonbinary'),2,
  'The expansion includes two explicitly nonbinary companions');

select is((select count(*)::integer from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%' and discovery_metadata->>'gender'='woman'),3,
  'The expansion includes three women in underused civic, medical, and Riverside roles');

select ok((select count(*)>=10 from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%' and age between 35 and 50),
  'The expansion materially improves the age 35 to 50 roster');

select ok(not exists(select 1 from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%' and age<18),
  'Every new romanceable companion is an adult');

select ok(not exists(select 1 from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%'
    and(coalesce(first_meeting->>'location_id','')='' or coalesce(first_meeting->>'opening_line','')='')),
  'Every new companion has a concrete first meeting');

select ok(not exists(select 1
  from public.together_character_templates template
  left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text like '22000000-0000-4000-8001-0000000002%'
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000001'::uuid),
  'Every new first meeting resolves inside Juniper City');

select ok(not exists(select 1 from public.together_character_versions
  where id::text like '23000000-0000-4000-8001-0000000002%'
    and(coalesce(pronouns,'')='' or coalesce(relationship_config,'{}'::jsonb)='{}'::jsonb)),
  'Every new companion has pronouns and relationship configuration');

select ok(not exists(select 1 from public.together_character_versions
  where id::text like '23000000-0000-4000-8001-0000000002%'
    and jsonb_array_length(coalesce(character_bible->'anecdotes','[]'::jsonb))<2),
  'Every new companion has at least two authored revealable anecdotes');

select ok(not exists(select 1 from public.together_character_versions
  where id::text like '23000000-0000-4000-8001-0000000002%'
    and(coalesce(character_bible->>'depthVersion','0')::integer<5 or coalesce(character_bible->>'dialogueTone','')='')),
  'Every new companion meets the depth-v5 dialogue standard');

select is((select count(*)::integer from public.together_character_voice_profiles
  where character_template_id::text like '22000000-0000-4000-8001-0000000002%' and active),13,
  'Every new companion has a stable character-specific voice profile');

select ok(not exists(
  select character_version_id from public.together_character_place_profiles
  where character_version_id::text like '23000000-0000-4000-8001-0000000002%'
  group by character_version_id having count(*)<5
),'Every new companion has at least five place perspectives');

select ok(not exists(select 1 from public.together_character_templates
  where id::text like '22000000-0000-4000-8001-0000000002%'
    and discovery_metadata->>'portraitStatus'<>'pending'),
  'New portrait slots fail honestly as pending instead of claiming missing assets are ready');

select is((select count(*)::integer from public.together_schedule_templates
  where metadata->>'source'='juniper_city_authored_schedule_v3'),1512,
  'All 36 Juniper residents have six schedule blocks for seven days');

select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where metadata->>'source'='juniper_city_authored_schedule_v3'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) days),252,'Every Juniper resident-day has complete coverage');

select ok(not exists(
  select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second
    on second.character_version_id=first.character_version_id and second.day_of_week=first.day_of_week and second.id>first.id
   and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.metadata->>'source'='juniper_city_authored_schedule_v3' and second.metadata->>'source'='juniper_city_authored_schedule_v3'
),'Juniper schedules never overlap themselves');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'source'='juniper_city_authored_schedule_v3'
    and((schedule.location_id is not null and location.world_id<>'10000000-0000-4000-8000-000000000001')
      or(schedule.location_id is null and schedule.metadata->>'activityKey'<>'sleep' and schedule.metadata->>'routineKind' not in('home_morning','home_evening','prep_work')))
),'Every public routine resolves to a real Juniper place');

select ok(not exists(select 1 from public.together_schedule_templates
  where metadata->>'source'='juniper_city_authored_schedule_v3'
    and jsonb_array_length(coalesce(metadata->'activityVariants','[]'::jsonb))<3),
  'Every schedule block has three natural presentation variants');

select ok(not exists(
  with active as(
    select template.id
    from public.together_character_world_presence presence
    join public.together_character_versions version on version.id=presence.character_version_id
    join public.together_character_templates template on template.id=version.character_template_id
    where presence.world_id='10000000-0000-4000-8000-000000000001' and presence.presence_type='resident'
      and template.published and template.lifecycle_status='published' and template.can_be_selected
  ), degree as(
    select active.id,count(edge.id) degree_count from active
    left join public.together_character_relationship_edges edge
      on edge.world_id='10000000-0000-4000-8000-000000000001' and edge.source_template_id=active.id
    group by active.id
  ) select 1 from degree where degree_count<4
),'Every active Juniper companion has at least four authored social relationships');

select is((select count(*)::integer from public.together_event_templates
  where metadata->>'source'='juniper_city_cohesion_v3' and active),8,
  'Juniper has eight new recurring shared rhythms');

select ok(not exists(
  with active as(
    select template.id
    from public.together_character_world_presence presence
    join public.together_character_versions version on version.id=presence.character_version_id
    join public.together_character_templates template on template.id=version.character_template_id
    where presence.world_id='10000000-0000-4000-8000-000000000001' and presence.presence_type='resident'
      and template.published and template.lifecycle_status='published' and template.can_be_selected
  ) select 1 from active where not exists(
    select 1 from public.together_event_templates event
    where event.metadata->>'source'='juniper_city_cohesion_v3' and active.id=any(event.participant_template_ids)
  )
),'Every active Juniper companion belongs to at least one recurring city rhythm');

select is((select count(*)::integer from public.together_story_arc_templates
  where prerequisites->>'source'='juniper_city_story_pack_v3' and active),23,
  'Twenty-three previously story-empty or new companions receive personal arcs');

select ok(not exists(select 1 from public.together_story_arc_templates
  where prerequisites->>'source'='juniper_city_story_pack_v3'
    and(jsonb_array_length(chapters)<>3 or coalesce(prerequisites->>'dialogueDriven','false')<>'true')),
  'Every new Juniper arc is a three-step dialogue-driven thread');

select is((select metadata->>'scheduleProfile' from public.together_worlds where slug='juniper-city'),
  'juniper_city_rich_weekly_v3','Juniper advertises the unified rich schedule pack');

select * from finish();
rollback;
