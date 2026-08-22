begin;
select plan(18);

select is(
  (select count(*)::integer from public.together_locations
   where world_id='10000000-0000-4000-8000-000000000009'
     and slug in('paper-moon-books','lantern-street','tea-house-aoi')),
  3,
  'all three cast-schedule support venues exist in Old Kyo'
);

select is(
  (select count(*)::integer from public.together_locations
   where world_id='10000000-0000-4000-8000-000000000009'),
  51,
  'NEON KYO now contains six districts and forty-five public places'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and published and lifecycle_status='published' and visibility='public'
     and can_be_selected and can_be_romanced),
  30,
  'thirty NEON KYO women are published, selectable, and romanceable'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and age>=18 and discovery_metadata->>'gender'='female'
     and discovery_metadata->>'residentWorldSlug'='neon-kyo'),
  30,
  'every NEON KYO cast member is an adult woman scoped to world discovery'
);

select is(
  (select count(*)::integer from public.together_character_versions
   where id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and published_at is not null and portrait_asset_key is not null
     and appearance_config->>'photoStatus'='ready'
     and appearance_config->>'portraitStatus'='ready'
     and visual_identity->>'status'='pending_reference'
     and jsonb_array_length(appearance_candidates)=0),
  30,
  'all thirty published versions resolve packaged launch portraits'
);

select ok(not exists(
  select 1 from public.together_character_templates template
  left join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (location.id is null or location.world_id<>'10000000-0000-4000-8000-000000000009'::uuid)
),'every first meeting resolves to a canonical NEON KYO place');

select is(
  (select count(*)::integer from public.together_character_world_presence presence
   where presence.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and presence.world_id='10000000-0000-4000-8000-000000000009'
     and presence.presence_type='resident'),
  30,
  'every cast member is a NEON KYO resident'
);

select ok(
  (select count(distinct home.slug)=6
   from public.together_character_world_presence presence
   join public.together_locations home on home.id=presence.home_location_id
   where presence.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$')
  and not exists(
    select 1 from public.together_character_world_presence presence
    join public.together_locations home on home.id=presence.home_location_id
    where presence.character_version_id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    group by home.slug having count(*)<>5
  ),
  'five residents belong to each of the six NEON KYO districts'
);

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (version.life_config->'occupation'->'scheduleBlocks' is null
      or version.life_config->>'homeWorldId'<>'10000000-0000-4000-8000-000000000009'
      or jsonb_array_length(version.life_config->'publicScheduleNotes')<4)
),'every resident retains a world-scoped occupation and supplied public schedule');

select ok(not exists(
  select 1 from public.together_character_versions version
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=version.id)<7
),'every resident has work, signature, home, errand, and public-place activities');

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=1),
  5,
  'five NEON KYO women use one-pepper pacing'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=2),
  17,
  'seventeen NEON KYO women use two-pepper pacing'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$' and spice_level=3),
  8,
  'eight NEON KYO women use three-pepper pacing'
);

select is(
  (select count(*)::integer from public.together_character_templates
   where id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
     and discovery_metadata->>'species' in('autonomous_synthetic','bio_synthetic')),
  4,
  'Noa, EVA, Kira, and Iori retain synthetic identities'
);

select ok(not exists(
  select 1 from public.together_character_versions version
  cross join lateral jsonb_array_elements_text(version.life_config->'publicLocationSlugs') authored_slug
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009' and location.slug=authored_slug
  where version.id::text~'^23000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and location.id is null
),'every supplied public schedule location resolves inside NEON KYO');

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  cross join lateral jsonb_array_elements_text(version.default_social_graph) circle_slug
  left join public.together_character_templates friend on friend.slug=circle_slug
  where template.id::text~'^22000000-0000-4000-8009-0000000000(0[1-9]|[12][0-9]|30)$'
    and friend.id is null
),'every authored social-circle reference resolves to a published character');

select ok(
  exists(select 1 from public.together_character_templates where slug='vittoria-bellandi' and name='Vittoria Bellandi' and occupation='Assistant Curator at Gallery Null')
  and exists(select 1 from public.together_character_templates where slug='sofia-bellini' and discovery_metadata->>'residentWorldSlug'='port-vervelle'),
  'Vittoria Bellandi is distinct from Port Vervelle resident Sofia Bellini'
);

select is(
  (select count(*)::integer
   from public.together_character_relationship_edges edge
   join public.together_character_templates source on source.id=edge.source_template_id
   join public.together_character_templates target on target.id=edge.target_template_id
   where edge.world_id='10000000-0000-4000-8000-000000000009'
     and source.slug in('noa-7','eva-aoyama','kira-3','iori')
     and target.slug in('noa-7','eva-aoyama','kira-3','iori')),
  0,
  'the four synthetics are not incorrectly forced into one social clique'
);

select * from finish();
rollback;
