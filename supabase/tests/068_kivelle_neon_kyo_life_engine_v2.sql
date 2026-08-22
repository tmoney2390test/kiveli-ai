begin;
select plan(18);

select is(
  (select count(*)::integer from public.together_character_versions version
   where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and (version.life_config->>'version')::integer=2
     and version.life_config->'scheduling'->>'generationVersion'='life_engine_v2'
     and version.life_config->'scheduling'->>'scheduleProfile'='neon_kyo_life_v2'),
  30,'All NEON KYO residents use the rich Life Engine V2 calendar profile');

select ok(not exists(
  select 1 from public.together_character_versions version
  cross join lateral jsonb_array_elements(version.life_config->'occupation'->'scheduleBlocks') block
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid
   and location.slug=block->>'primaryLocationSlug'
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and location.id is null
),'Every occupation block resolves to a canonical NEON KYO place');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=version.id
           and activity.metadata->>'source'='neon_kyo_life_v2') not between 12 and 16
),'Every resident has twelve to sixteen work, home, public-place, and interest activities');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=version.id
           and left(activity.activity_key,9)='interest_')<5
),'Every resident has at least five character-specific interest activities');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  where activity.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and activity.metadata->>'source'='neon_kyo_life_v2'
    and (activity.title~*'somewhere nearby|focused on work|taking care of a few things'
      or coalesce(activity.metadata->>'activityLabel','')=''
      or coalesce(activity.metadata->>'upcomingHint','')='')
),'Calendar activity presentation is specific and complete');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  left join lateral unnest(activity.location_slugs) as activity_location(slug) on true
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid and location.slug=activity_location.slug
  where activity.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and activity.metadata->>'source'='neon_kyo_life_v2'
    and activity_location.slug is not null and location.id is null
),'Every scheduled interest and activity remains inside NEON KYO');

select is(
  (select count(*)::integer from public.together_schedule_templates schedule
   where schedule.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'),
  1050,'Thirty residents each have five authored blocks for all seven days');

select ok(not exists(
  select 1
  from public.together_character_versions version cross join generate_series(0,6) day_number
  left join public.together_schedule_templates schedule
    on schedule.character_version_id=version.id and schedule.day_of_week=day_number
   and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
  group by version.id,day_number having count(schedule.id)<>5
),'Every resident-day has exactly five coherent calendar blocks');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
    and schedule.location_id is not null
    and location.world_id<>'10000000-0000-4000-8000-000000000009'::uuid
),'Authored calendar locations cannot cross worlds');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  where schedule.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
    and schedule.metadata->>'priority'='preferred_activity'
    and left(coalesce(schedule.metadata->>'activityKey',''),9)<>'interest_'
),'Every personal calendar block is grounded in that resident’s interests');

select is(
  (select count(distinct version.id)::integer
   from public.together_character_versions version
   cross join lateral jsonb_array_elements(version.life_config->'occupation'->'scheduleBlocks') block
   where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and (block->'startRange'->>'startMinute')::integer
       +(block->'durationMinutes'->>0)::integer>1440),
  11,'Eleven night workers retain true after-midnight dynamic shifts');

select is(
  (select count(distinct schedule.character_version_id)::integer
   from public.together_schedule_templates schedule
   where schedule.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
     and schedule.metadata->>'overnightContinuation'='true'),
  11,'Every night worker has visible next-day continuation blocks');

select is(
  (select count(*)::integer
   from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug in('rika-senzaki','zhen-li','piper-shaw','rin-akiyama','freya-keller','fumi-arai','isabella-reyes')
     and version.version=template.current_published_version
     and jsonb_array_length(version.life_config->'occupation'->'scheduleBlocks')=2),
  7,'Residents with rotating sites, study, consulting, or second work retain both commitments');

select ok(
  (select count(*)=3
   from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug='piper-shaw'
     and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
     and schedule.metadata->>'dayShape'='split_day'
     and schedule.metadata->>'activityKey'='occupation_secondary')
  and
  (select count(*)=3
   from public.together_schedule_templates schedule
   join public.together_character_versions version on version.id=schedule.character_version_id
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug='piper-shaw'
     and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
     and schedule.metadata->>'dayShape'='split_day'
     and schedule.metadata->>'activityKey'='occupation_primary'),
  'Piper’s fashion-tech classes and Atrium shifts both appear on split days');

select is(
  (select count(*)::integer from public.together_character_world_presence presence
   where presence.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and presence.metadata->>'dynamicSchedule'='true'
     and presence.metadata->>'authoredCalendar'='true'
     and presence.metadata->>'scheduleProfile'='neon_kyo_life_v2'),
  30,'World presence advertises rich calendar support for all residents');

select ok(not exists(
  select 1 from public.together_character_schedule_events event
  join public.together_character_instances instance on instance.id=event.character_instance_id
  where instance.character_template_id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and event.source in('generated','recurring') and event.starts_at>now()
),'Stale future generated rows are removed for safe V2 regeneration');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(distinct schedule.metadata->>'activityKey')
         from public.together_schedule_templates schedule
         where schedule.character_version_id=version.id
           and schedule.metadata->>'source'='neon_kyo_authored_schedule_v1')<6
),'Every weekly calendar contains at least six distinct activity beats');

select ok(
  (select metadata->>'residentCalendarVersion'='2'
     and metadata->>'residentCalendarProfile'='neon_kyo_life_v2'
     and (metadata->>'residentCalendarCount')::integer=30
   from public.together_worlds where slug='neon-kyo'),
  'The NEON KYO catalog publishes the rich resident-calendar contract');

select * from finish();
rollback;
