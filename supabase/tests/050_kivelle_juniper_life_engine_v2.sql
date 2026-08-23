begin;
select plan(13);

select is(
  (select count(*)::integer from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id
   where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
     and version.version=template.current_published_version
     and (version.life_config->>'version')::integer=2
     and version.life_config->'occupation'->>'workPattern' in('fixed_weekdays','shifts','freelance','hybrid','student')),
  23,
  'All 23 roster residents use Life Engine V2 occupation profiles'
);

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and jsonb_array_length(version.life_config->'occupation'->'scheduleBlocks')=0
), 'Every resident has at least one authored occupation block');

select ok(exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  cross join lateral jsonb_array_elements(version.life_config->'occupation'->'scheduleBlocks') block
  where template.slug='priya-kapoor' and (block->'startRange'->>'startMinute')::integer>=1140
    and (block->'durationMinutes'->>1)::integer>=600
), 'Priya has a genuine cross-midnight hospital rotation');

select ok(exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('lena-park','samira-haddad','brooke-sullivan')
    and jsonb_array_length(version.life_config->'occupation'->'scheduleBlocks')=2
), 'Student dual-role profiles contain separate school and work blocks');

select is(
  (select count(*)::integer from public.together_locations where slug in(
    'juniper-general-hospital','alder-elementary-school','mercer-row-law-offices','alder-central-precinct',
    'juniper-firehouse-14','forgeworks-design-lab','juniper-college','summit-climbing-hall'
  ) and world_id='10000000-0000-4000-8000-000000000001'),
  8,
  'Professional and student routines resolve to eight canonical Juniper places'
);

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and (activity.title~*'nearby|focused on work|in the middle of a project|taking care of a few things'
      or coalesce(activity.metadata->>'activityLabel','')~*'nearby|focused on work|in the middle of a project|taking care of a few things')
), 'Roster activity presentation contains no banned vague phrases');

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and (select count(*) from public.together_character_activity_templates activity where activity.character_version_id=version.id) not between 8 and 14
), 'Every resident has between 8 and 14 available activity templates');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and activity.metadata->>'rare'='true' and activity.maximum_weekly_frequency>1
), 'Rare signature activities are capped at once per week');

select ok(not exists(
  select 1 from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and activity.metadata->>'source'='juniper_life_v2'
    and (coalesce(activity.metadata->>'activityLabel','')='' or coalesce(activity.metadata->>'upcomingHint','')='')
), 'Every V2 activity has authored current and upcoming presentation');

select ok(exists(
  select 1 from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug='nia-brooks' and activity.metadata->>'outcomeEligible'='true'
), 'Nia has deterministic outcome-eligible activity content');

select ok(exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug='sophie-laurent'
    and version.version=template.current_published_version
    and version.life_config->'occupation'->>'primaryLocationSlug'='moss-and-crumb'
), 'Sophie remains grounded in Moss and Crumb');

select ok(exists(
  select 1 from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug='mateo-alvarez' and activity.location_slugs@>array['juniper-firehouse-14']
), 'Mateo has a canonical firehouse routine');

select ok(not exists(
  select 1 from public.together_character_schedule_events event
  join public.together_character_instances instance on instance.id=event.character_instance_id
  join public.together_character_templates template on template.id=instance.character_template_id
  where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
    and event.generation_version='life_engine_v1' and event.source in('generated','recurring') and event.starts_at>now()
), 'No stale future V1 generated rows remain for the upgraded roster');

select * from finish();
rollback;
