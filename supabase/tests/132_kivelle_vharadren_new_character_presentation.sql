begin;
select plan(4);

select is(
  (
    select count(*)::integer
    from public.together_schedule_templates
    where character_version_id in (
      '25000000-0000-4000-8013-000000000051'::uuid,
      '25000000-0000-4000-8013-000000000052'::uuid
    )
      and metadata->>'scheduleMode' = 'authored'
      and metadata->>'profileVisibility' = 'visible'
  ),
  84,
  'Maris and Celia expose a complete authoritative weekly schedule'
);

select is(
  (
    select count(*)::integer
    from public.together_character_versions version
    join public.together_character_templates template
      on template.id = version.character_template_id
     and template.current_published_version = version.version
    where template.slug in ('princess-maris-vaelorian', 'celia-thatch')
      and version.portrait_asset_key = template.slug
      and version.appearance_config->>'portraitStatus' = 'reference_ready'
  ),
  2,
  'Both new characters resolve their current canonical portrait'
);

select is(
  (
    select count(*)::integer
    from public.together_character_world_presence
    where character_version_id in (
      '25000000-0000-4000-8013-000000000051'::uuid,
      '25000000-0000-4000-8013-000000000052'::uuid
    )
      and world_id = '10000000-0000-4000-8000-000000000013'::uuid
      and presence_type = 'resident'
      and metadata->>'scheduleMode' = 'authored'
      and metadata->>'portraitStatus' = 'ready'
  ),
  2,
  'Both new characters are active Vharadren residents with presentation metadata'
);

select is(
  (
    select count(*)::integer
    from public.together_character_templates
    where slug in ('princess-maris-vaelorian', 'celia-thatch')
      and published = true
      and can_be_selected = true
      and lifecycle_status = 'published'
      and visibility = 'public'
      and discovery_metadata->>'portraitStatus' = 'ready'
  ),
  2,
  'Both new characters remain discoverable and selectable'
);

select * from finish();
rollback;
