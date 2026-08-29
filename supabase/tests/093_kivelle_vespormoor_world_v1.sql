begin;
select plan(25);

select is((select count(*)::integer from public.together_worlds where slug='vespormoor' and published),1,'Vespormoor is published');
select is((select metadata->>'contentStatus' from public.together_worlds where slug='vespormoor'),'complete_world_v1','Vespormoor is complete rather than a preview');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and parent_location_id is null),6,'Six districts are available');
select is((select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and parent_location_id is not null),45,'Forty-five public places are available');
select is((select count(distinct visual_asset_key)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000010'),51,'Every location has a distinct image slot');
select ok(not exists(select 1 from public.together_locations where world_id='10000000-0000-4000-8000-000000000010' and visual_asset_key is null),'No Vespormoor location is missing an image slot');

select is((select count(*)::integer from public.together_character_templates where id::text like '22000000-0000-4000-8010-%' and published and can_be_selected),47,'All 47 residents are selectable');
select is((select count(*)::integer from public.together_character_versions where id::text like '23000000-0000-4000-8010-%' and published_at is not null),47,'All residents have a published version');
select is((select count(*)::integer from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000010' and presence_type='resident' and character_version_id::text like '23000000-0000-4000-8010-%'),47,'All residents have world presence');
select ok(not exists(select 1 from public.together_character_templates where id::text like '22000000-0000-4000-8010-%' and age<18),'Every companion is an adult');
select ok(not exists(select 1 from public.together_character_templates where id::text like '22000000-0000-4000-8010-%' and (first_meeting->>'world_id' is null or first_meeting->>'location_id' is null or first_meeting->>'opening_line' is null)),'Every companion has an authored first meeting');
select ok(not exists(select 1 from public.together_character_versions where id::text like '23000000-0000-4000-8010-%' and (character_bible->>'storyHook' is null or communication_style->>'signature' is null or visual_identity->>'canonicalDescription' is null)),'Every companion has story, voice, and portrait grounding');
select is((select count(*)::integer from public.together_character_voice_profiles where character_template_id::text like '22000000-0000-4000-8010-%' and active),47,'Every companion has a stable voice profile');
select is((select count(*)::integer from public.together_character_homes where character_version_id::text like '23000000-0000-4000-8010-%' and active),47,'Every companion has a private virtual home');

select is((select count(*)::integer from(
  select schedule.character_version_id,schedule.day_of_week
  from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
  group by schedule.character_version_id,schedule.day_of_week having count(*)>=5
) complete_days),329,'Every companion has at least five authored blocks on all seven days');
select ok(not exists(
  select 1 from public.together_schedule_templates left_schedule
  join public.together_schedule_templates right_schedule
    on right_schedule.character_version_id=left_schedule.character_version_id
   and right_schedule.day_of_week=left_schedule.day_of_week and right_schedule.id>left_schedule.id
   and right_schedule.start_minute<left_schedule.end_minute and left_schedule.start_minute<right_schedule.end_minute
  where left_schedule.character_version_id::text like '23000000-0000-4000-8010-%'
),'Authored schedules never place a companion in two places at once');
select ok(not exists(
  select 1 from public.together_character_versions version
  cross join(values(480),(720),(960),(1200)) check_time(minute_of_day)
  where version.id::text like '23000000-0000-4000-8010-%'
    and not exists(select 1 from public.together_schedule_templates schedule where schedule.character_version_id=version.id and schedule.day_of_week=3 and schedule.start_minute<=check_time.minute_of_day and schedule.end_minute>check_time.minute_of_day)
),'Every Wednesday schedule resolves at 08:00, 12:00, 16:00, and 20:00');
select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('mirelle-voss','dahlia-kane','katya-morozova','roxy-bell','luca-ferraro')
    and not exists(select 1 from public.together_schedule_templates schedule where schedule.character_version_id=version.id and schedule.day_of_week=6 and schedule.start_minute=0 and schedule.location_id is not null)
),'Nightlife workers have canonical public presence at midnight');
select ok(not exists(select 1 from public.together_schedule_templates schedule join public.together_locations location on location.id=schedule.location_id where schedule.character_version_id::text like '23000000-0000-4000-8010-%' and location.world_id<>'10000000-0000-4000-8000-000000000010'),'Schedules never cross world boundaries');

select ok((select count(*) from public.together_character_relationship_edges where world_id='10000000-0000-4000-8000-000000000010')>=80,'Vespormoor has a substantial but bounded social graph');
select is((select relationship_type from public.together_character_relationship_edges edge join public.together_character_templates source on source.id=edge.source_template_id join public.together_character_templates target on target.id=edge.target_template_id where edge.world_id='10000000-0000-4000-8000-000000000010' and source.slug='hannah-mercer' and target.slug='owen-mercer'),'siblings','Authored family relationships override generic circles');
select is((select count(*)::integer from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000010' and active),6,'Six recurring ambient event templates are active');
select is((select count(*)::integer from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000010' and active),9,'Nine dialogue-driven mystery arcs are active');
select ok(not exists(select 1 from public.together_world_facts where world_id='10000000-0000-4000-8000-000000000010' and slug in('vesper-missing-clause','vesper-standing-stones','vesper-red-market-debts','vesper-lake-remembers','vesper-lake-warning','vesper-lake-lights') and location_id is null),'Location-specific depth facts resolve to canonical Vespormoor places');
select ok(lower((select metadata::text from public.together_worlds where slug='vespormoor')) !~ 'vampire|shapeshifter','Vespormoor canon does not drift into monster races');

select * from finish();
rollback;
