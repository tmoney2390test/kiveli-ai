begin;
select plan(13);

select is(
  (select count(*)::integer from public.together_character_versions version
   where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and (version.life_config->>'version')::integer=2
     and version.life_config->'scheduling'->>'generationVersion'='port_vervelle_authored_weekly_v3'
     and version.life_config->'scheduling'->>'scheduleProfile'='port_vervelle_rich_weekly_v3'),
  30,'All original Port Vervelle residents use the current Life Engine schedule profile');

select ok(not exists(
  select 1 from public.together_character_versions version
  cross join lateral jsonb_array_elements(version.life_config->'occupation'->'scheduleBlocks') block
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid
   and location.slug=block->>'primaryLocationSlug'
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and location.id is null
),'Every occupation block resolves to a canonical Port Vervelle place');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=version.id
           and activity.metadata->>'source'='port_vervelle_life_v2') not between 9 and 11
),'Every resident has nine to eleven dynamic work, home, and interest activities');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=version.id
           and left(activity.activity_key,9)='interest_')<4
),'Every resident has at least four character-specific interest activities');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  where activity.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and activity.metadata->>'source'='port_vervelle_life_v2'
    and (activity.title~*'somewhere nearby|focused on work|taking care of a few things'
      or coalesce(activity.metadata->>'activityLabel','')=''
      or coalesce(activity.metadata->>'upcomingHint','')='')
),'Dynamic activity presentation is specific and complete');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  left join lateral unnest(activity.location_slugs) as activity_location(slug) on true
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid and location.slug=activity_location.slug
  where activity.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and activity.metadata->>'source'='port_vervelle_life_v2'
    and activity_location.slug is not null and location.id is null
),'Every scheduled interest and activity remains inside Port Vervelle');

select is(
  (select count(*)::integer from public.together_schedule_templates schedule
   where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'),
  1260,'Thirty original residents each have six authored blocks for all seven days');

select ok(not exists(
  select 1
  from public.together_character_versions version cross join generate_series(0,6) day_number
  left join public.together_schedule_templates schedule
    on schedule.character_version_id=version.id and schedule.day_of_week=day_number
   and schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
  group by version.id,day_number having count(schedule.id)<>6
),'Every original resident-day has exactly six coherent schedule blocks');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'
    and schedule.location_id is not null
    and location.world_id<>'10000000-0000-4000-8000-000000000008'::uuid
),'Authored schedule locations cannot cross worlds');

select ok(exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  cross join lateral jsonb_array_elements(version.life_config->'occupation'->'scheduleBlocks') block
  where template.slug='eva-moreau'
    and (block->'startRange'->>'startMinute')::integer>=1080
),'Eva has a genuine late-night La Sirena work rhythm');

select ok(
  (select jsonb_array_length(version.life_config->'occupation'->'scheduleBlocks')=2
   from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug='inez-el-mansouri' and version.version=template.current_published_version)
  and
  (select jsonb_array_length(version.life_config->'occupation'->'scheduleBlocks')=2
   from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug='emilia-rossi' and version.version=template.current_published_version),
  'Inez and Emilia retain distinct school/work and daytime/overnight commitments');

select is(
  (select count(*)::integer from public.together_character_world_presence presence
   where presence.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and presence.metadata->>'dynamicSchedule'='true'
     and presence.metadata->>'scheduleProfile'='port_vervelle_rich_weekly_v3'),
  30,'World presence advertises current dynamic schedule support for all original residents');

select ok(not exists(
  select 1 from public.together_character_schedule_events event
  join public.together_character_instances instance on instance.id=event.character_instance_id
  where instance.character_template_id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and event.source in('generated','recurring') and event.starts_at>now()
),'Stale future generated rows are removed for safe V2 regeneration');

select * from finish();
rollback;
