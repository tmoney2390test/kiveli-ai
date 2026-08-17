begin;
select plan(10);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
     and published and lifecycle_status='published' and visibility='public' and can_be_selected),
  23,
  'Twenty-three portrait-backed Juniper residents are published and selectable'
);

select is(
  (select count(*)::integer from public.together_character_versions
   where id::text ~ '^13000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
     and published_at is not null and portrait_asset_key is not null),
  23,
  'Every roster character has one published portrait-backed version'
);

select ok(
  not exists(
    select 1 from public.together_character_templates template
    left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
    where template.id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
      and (location.id is null or location.world_id<>'10000000-0000-4000-8000-000000000001'::uuid)
  ),
  'Every first meeting resolves to a canonical Juniper location'
);

select is(
  (select count(*)::integer from public.together_character_world_presence presence
   where presence.character_version_id::text ~ '^13000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
     and presence.world_id='10000000-0000-4000-8000-000000000001'::uuid
     and presence.presence_type='resident'),
  23,
  'Every roster character is a Juniper resident'
);

select ok(
  not exists(
    select 1 from public.together_character_versions version
    where version.id::text ~ '^13000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
      and exists(select 1 from public.together_schedule_templates schedule where schedule.character_version_id=version.id and schedule.metadata->>'source'='juniper_character_roster')
  ),
  'Legacy roster-wide full-day schedule templates are retired'
);

select ok(
  not exists(
    select 1 from public.together_character_versions version
    where version.id::text ~ '^13000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$'
      and (select count(*) from public.together_character_activity_templates activity where activity.character_version_id=version.id)<10
  ),
  'Every roster character has a ten-option generated activity bank'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$' and spice_level=1),
  6,
  'Six roster characters use one-pepper pacing'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$' and spice_level=2),
  9,
  'Nine roster characters use two-pepper pacing'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^12000000-0000-4000-8000-0000000001(0[1-9]|1[0-9]|2[0-3])$' and spice_level=3),
  8,
  'Eight roster characters use three-pepper pacing'
);

select is(
  (select version.portrait_asset_key from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id
   where template.slug='mateo-alvarez' and version.version=template.current_published_version),
  'mateo-alvarez',
  'The firefighter portrait is assigned to Mateo Alvarez'
);

select * from finish();
rollback;
