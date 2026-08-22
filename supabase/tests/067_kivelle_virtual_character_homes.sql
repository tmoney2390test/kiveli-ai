begin;
select plan(11);

select has_table('public','together_character_homes','character homes are canonical narrative records');
select has_view('public','together_character_home_catalog','character home catalog is available for review and export');

select is(
  (select count(*)::integer
   from public.together_character_versions version
   join public.together_character_templates template
     on template.id=version.character_template_id
    and template.current_published_version=version.version
    and template.published=true
   join public.together_character_world_presence presence
     on presence.character_version_id=version.id and presence.presence_type='resident'
   join public.together_worlds world on world.id=presence.world_id and world.published=true
   left join public.together_character_homes home
     on home.character_version_id=version.id and home.active=true
   where home.id is null),
  0,
  'every current published resident character has a home profile'
);

select is(
  (select count(*)::integer from public.together_character_homes where reference_policy<>'text_only'),
  0,
  'all seeded character homes intentionally use text-only environment grounding'
);

select is(
  (select count(*)::integer from public.together_character_homes
   where length(description)<120 or length(prompt_text)<300),
  0,
  'every home has full display prose and a full generation prompt'
);

select is(
  (select count(*)::integer from public.together_character_homes
   where canonical_visual_context->>'canonicalPrompt'<>prompt_text
      or canonical_visual_context->>'indoorOutdoor'<>'indoor'
      or canonical_visual_context->>'environmentReferencePolicy'<>'text_only'),
  0,
  'visual context carries the exact text-only indoor prompt contract'
);

select is(
  (select count(*)::integer from public.together_character_homes home
   join public.together_locations anchor on anchor.id=home.district_anchor_location_id
   where anchor.world_id<>home.world_id),
  0,
  'optional district anchors never cross world boundaries'
);

select ok(
  (select bool_and(prompt_text like '%separate canonical character identity reference%')
   from public.together_character_homes),
  'home prompts keep identity references separate from text-only environments'
);

select is(
  (select count(*)::integer from public.together_character_homes
   where prompt_text ilike '%private private %'),
  0,
  'home prompts contain no duplicated privacy wording'
);

select is(
  (select count(*)::integer
   from public.together_character_home_catalog
   where (world_slug='neon-kyo' and district_slug='aoyama-nine' and residence_type<>'precise glass-and-timber tower apartment')
      or (world_slug='port-vervelle' and district_slug='marina-solana' and residence_type<>'breezy marina apartment')
      or (world_slug='port-vervelle' and district_slug='piazza-aurelia' and residence_type<>'gracious apartment above the civic square')
      or (world_slug='port-vervelle' and district_slug='porto-vecchio' and residence_type<>'restored harbor-quarter flat')),
  0,
  'authored districts use their exact in-theme residence archetypes'
);

delete from public.together_character_homes
where character_version_id=(
  select presence.character_version_id
  from public.together_character_world_presence presence
  join public.together_character_homes home on home.character_version_id=presence.character_version_id
  where presence.presence_type='resident' and home.source='auto'
  order by presence.character_version_id limit 1
);

update public.together_character_world_presence
set home_location_id=home_location_id,updated_at=now()
where character_version_id=(
  select version.id
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
    and template.current_published_version=version.version
  join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident'
  left join public.together_character_homes home on home.character_version_id=version.id
  where template.published=true and home.id is null
  order by version.id limit 1
);

select is(
  (select count(*)::integer
   from public.together_character_versions version
   join public.together_character_templates template on template.id=version.character_template_id and template.published=true and template.current_published_version=version.version
   join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident'
   left join public.together_character_homes home on home.character_version_id=version.id
   where home.id is null),
  0,
  'resident-presence automation restores a missing home for future characters'
);

select * from finish();
rollback;
