begin;
select plan(13);

select is((
  select count(*)::integer from public.together_schedule_templates
  where character_version_id::text like '23000000-0000-4000-8010-%'
    and metadata->>'source'='vespormoor_authored_schedule_v2'
),1890,'Vespormoor has six rich authored schedule blocks for 45 residents across seven days');

select is((
  select count(*)::integer from(
    select character_version_id,day_of_week
    from public.together_schedule_templates
    where character_version_id::text like '23000000-0000-4000-8010-%'
    group by character_version_id,day_of_week having count(*)=6
  ) complete_days
),329,'Every Vespormoor resident has exactly six blocks every day');

select ok(not exists(
  select 1 from public.together_schedule_templates left_schedule
  join public.together_schedule_templates right_schedule
    on right_schedule.character_version_id=left_schedule.character_version_id
   and right_schedule.day_of_week=left_schedule.day_of_week
   and right_schedule.id>left_schedule.id
   and right_schedule.start_minute<left_schedule.end_minute
   and left_schedule.start_minute<right_schedule.end_minute
  where left_schedule.character_version_id::text like '23000000-0000-4000-8010-%'
),'Vespormoor schedules never overlap');

select ok(not exists(
  select 1 from public.together_character_versions version
  cross join generate_series(0,6) day_number
  cross join(values(0),(480),(720),(960),(1200)) check_time(minute_of_day)
  where version.id::text like '23000000-0000-4000-8010-%'
    and not exists(
      select 1 from public.together_schedule_templates schedule
      where schedule.character_version_id=version.id
        and schedule.day_of_week=day_number
        and schedule.start_minute<=check_time.minute_of_day
        and schedule.end_minute>check_time.minute_of_day
    )
),'Midnight, morning, midday, afternoon, and evening always resolve');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and(
      (schedule.location_id is not null and location.world_id<>'10000000-0000-4000-8000-000000000010')
      or(
        schedule.location_id is null
        and schedule.metadata->>'activityKey'<>'sleep'
        and schedule.metadata->>'routineKind'<>'home_morning'
      )
    )
),'Every public schedule block resolves inside Vespormoor');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and jsonb_array_length(coalesce(schedule.metadata->'activityVariants','[]'::jsonb))<3
),'Every schedule block has deterministic prose variation');

select ok((
  select count(distinct schedule.activity)
  from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and schedule.metadata->>'routineKind' in('main','evening')
)>=100,'Vespormoor main and evening routines retain substantial authored variety');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and schedule.activity in(
      'Taking an afternoon for a personal interest',
      'Spending the evening out in Vespormoor',
      'Taking a late Vespormoor evening',
      'Following a weekend interest away from work'
    )
),'The generic launch filler has been removed');

select is((
  select count(*)::integer from public.together_character_versions
  where id::text like '23000000-0000-4000-8010-%'
    and life_config->'scheduling'->>'scheduleProfile'='vespormoor_rich_weekly_v2'
),45,'Every resident advertises the rich weekly schedule profile');

select ok((
  select count(*) from public.together_schedule_templates
  where character_version_id::text like '23000000-0000-4000-8010-%'
    and metadata->>'communityAnchor' is not null
)>=35,'Social-circle anchor overlaps are authored across the roster');

select is((
  select count(*)::integer from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text like '22000000-0000-4000-8010-%'
    and version.portrait_asset_key=template.slug
    and jsonb_array_length(coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb))>0
),26,'Twenty-six supplied Vespormoor portraits are canonical identity references');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text like '23000000-0000-4000-8010-%'
    and coalesce(version.visual_identity->'referenceStoragePaths'->>0,'') ~* 'nude'
),'Profile-gallery alternates are never used as default portrait references');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and schedule.metadata->>'contextCue' is null
),'Every block states that routine presence is not a shared scene or invitation');

select * from finish();
rollback;
