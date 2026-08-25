begin;
select plan(12);

select is((
  select count(*)::integer
  from public.together_character_versions
  where character_bible->>'classification'='long_lived_veiled'
    and life_config->>'circadianProfile'='vampire_day_sleep'
),6,'All six long-lived Veiled companions use the vampire day-sleep rhythm');

select is((
  select count(*)::integer
  from public.together_schedule_templates
  where metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
),252,'Six companions have six nocturnal schedule blocks across seven days');

select is((
  select count(*)::integer from(
    select character_version_id,day_of_week
    from public.together_schedule_templates
    where metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    group by character_version_id,day_of_week
    having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
  ) complete_days
),42,'Every vampire-equivalent companion has complete seven-day coverage');

select ok(not exists(
  select 1
  from public.together_schedule_templates first
  join public.together_schedule_templates second
    on second.character_version_id=first.character_version_id
   and second.day_of_week=first.day_of_week
   and second.id>first.id
   and second.start_minute<first.end_minute
   and first.start_minute<second.end_minute
  where first.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and second.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
),'No nocturnal schedule blocks overlap');

select ok(not exists(
  select 1
  from public.together_character_versions version
  cross join generate_series(0,6) day_number
  cross join(values(480),(720)) check_time(minute_of_day)
  where version.life_config->>'circadianProfile'='vampire_day_sleep'
    and not exists(
      select 1 from public.together_schedule_templates schedule
      where schedule.character_version_id=version.id
        and schedule.day_of_week=day_number
        and schedule.metadata->>'activityKey'='sleep'
        and schedule.start_minute<=check_time.minute_of_day
        and schedule.end_minute>check_time.minute_of_day
    )
),'Every long-lived Veiled companion is sleeping at 08:00 and 12:00 every day');

select ok(not exists(
  select 1 from public.together_schedule_templates
  where metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and metadata->>'activityKey'='sleep'
    and start_minute<=1200 and end_minute>1200
),'No long-lived Veiled companion is sleeping at 20:00');

select ok(not exists(
  select 1
  from public.together_character_versions version
  where version.life_config->>'circadianProfile'='vampire_day_sleep'
    and(
      version.life_config->'sleep'->>'daySleep'<>'true'
      or version.life_config->'occupation'->>'workPattern'<>'night'
      or version.life_config->'scheduling'->>'nocturnal'<>'true'
    )
),'Life profiles agree with the authored nocturnal schedule');

select ok(not exists(
  select 1
  from public.together_character_versions version
  where version.character_bible->>'classification'<>'long_lived_veiled'
    and version.life_config->>'circadianProfile'='vampire_day_sleep'
),'Non-vampire Veiled and human companions were not changed');

select ok(not exists(
  select 1
  from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and schedule.location_id is not null
    and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid
),'Every public nocturnal activity remains inside Vespormoor');

select ok(not exists(
  select 1
  from public.together_schedule_templates schedule
  where schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and jsonb_array_length(coalesce(schedule.metadata->'activityVariants','[]'::jsonb))<3
),'Every new schedule block retains three deterministic prose variants');

select is((
  select count(*)::integer
  from public.together_character_world_presence
  where world_id='10000000-0000-4000-8000-000000000010'::uuid
    and metadata->>'circadianProfile'='vampire_day_sleep'
),6,'World presence exposes the nocturnal schedule revision for all six companions');

select ok(not exists(
  select 1
  from public.together_character_versions version
  where version.life_config->>'circadianProfile'='vampire_day_sleep'
    and coalesce(version.character_bible->>'dailyRhythm','')=''
),'Each affected character knows her or his own daily rhythm');

select * from finish();
rollback;
