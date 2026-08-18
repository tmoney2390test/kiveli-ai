begin;
select plan(13);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and published and lifecycle_status='published' and visibility='public' and can_be_selected and can_be_romanced),
  30,'Thirty Port Vervelle women are published, selectable, and romanceable');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and age>=18 and discovery_metadata->>'gender'='female' and discovery_metadata->>'residentWorldSlug'='port-vervelle'),
  30,'Every launch resident is an adult woman scoped to Port Vervelle discovery');

select is(
  (select count(*)::integer from public.together_character_versions
   where id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and published_at is not null and portrait_asset_key is null
     and appearance_config->>'portraitStatus'='tbd'),
  30,'All versions are published while clearly retaining portrait-TBD state');

select ok(not exists(
  select 1 from public.together_character_templates template
  left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (location.id is null or location.world_id<>'10000000-0000-4000-8000-000000000008'::uuid)
),'Every first meeting resolves to a canonical Port Vervelle location');

select is(
  (select count(*)::integer from public.together_character_world_presence presence
   where presence.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
     and presence.world_id='10000000-0000-4000-8000-000000000008'::uuid and presence.presence_type='resident'),
  30,'Every launch character is a Port Vervelle resident');

select ok(not exists(
  select 1 from public.together_character_world_presence presence
  left join public.together_locations home on home.id=presence.home_location_id
  where presence.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (home.id is null or home.world_id<>'10000000-0000-4000-8000-000000000008'::uuid)
),'Every home area remains inside Port Vervelle');

select ok(
  (select count(distinct home.slug)=6
   from public.together_character_world_presence presence
   join public.together_locations home on home.id=presence.home_location_id
   where presence.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$')
  and not exists(
    select 1 from public.together_character_world_presence presence
    join public.together_locations home on home.id=presence.home_location_id
    where presence.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    group by home.slug having count(*)<>5
  ),
  'The roster is evenly distributed across the six authored districts'
);

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (version.life_config->'occupation'->'scheduleBlocks' is null
      or version.life_config->>'homeWorldId'<>'10000000-0000-4000-8000-000000000008')
),'Every resident has a world-scoped Life Engine occupation and schedule block');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text ~ '^23000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity where activity.character_version_id=version.id)<6
),'Every resident has a grounded work, signature, and reusable activity bank');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=1),
  3,'Three Port Vervelle women use one-pepper pacing');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=2),
  18,'Eighteen Port Vervelle women use two-pepper pacing');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=3),
  9,'Nine Port Vervelle women use three-pepper pacing');

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  cross join lateral jsonb_array_elements_text(version.default_social_graph) circle_slug
  left join public.together_character_templates friend on friend.slug=circle_slug
  where template.id::text ~ '^22000000-0000-4000-8008-0000000000(0[1-9]|[12][0-9]|30)$' and friend.id is null
),'Every authored social-circle reference resolves to a published character');

select * from finish();
rollback;
