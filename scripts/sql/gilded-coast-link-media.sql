-- Run only after sync-kivelle-reference-media --world=gilded-coast --apply.
-- This does not publish the world. All 36 portraits, 42 place references,
-- and the world image must already be present or the transaction aborts.
begin;
do $gilded_media$
declare
  v_world uuid := '10000000-0000-4000-8000-000000000014'::uuid;
  v_portraits integer;
  v_places integer;
  v_world_images integer;
begin
  select count(*) into v_portraits
  from public.together_character_world_presence presence
  join public.together_character_versions version on version.id=presence.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_media_reference_assets asset on asset.character_version_id=version.id
    and asset.asset_role='character_identity' and asset.active
    and asset.storage_bucket='kivelle-character-reference'
    and asset.source_key='character:'||template.slug||':identity'
  where presence.world_id=v_world and presence.presence_type='resident';
  select count(*) into v_places
  from public.together_locations location
  join public.together_media_reference_assets asset on asset.location_id=location.id
    and asset.asset_role='location_canonical' and asset.active
    and asset.source_key='location:gilded-coast:'||location.slug||':canonical'
  where location.world_id=v_world and location.owner_user_id is null and location.archived_at is null;
  select count(*) into v_world_images
  from public.together_media_reference_assets asset
  where asset.world_id=v_world and asset.asset_role='world_canonical' and asset.active
    and asset.source_key='world:gilded-coast:canonical';
  if v_portraits<>36 or v_places<>42 or v_world_images<>1 then
    raise exception 'Gilded Coast media incomplete: portraits %, places %, world images %',v_portraits,v_places,v_world_images;
  end if;

  -- Use the resident version as the update target, so no template/instance
  -- relationship is inferred from a portrait filename.
  update public.together_character_versions version
  set visual_identity=jsonb_set(
        coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object(
          'status','reference_ready','referenceOrigin','generated_fictional',
          'adultMediaReferenceEligible',true,'portraitPack','gilded_coast_v1'),
        '{referenceStoragePaths}',jsonb_build_array(asset.storage_path),true),
      appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
        'photoStatus','ready','portraitStatus','reference_ready',
        'referenceStoragePath',asset.storage_path,'referenceCount',1),
      portrait_asset_key=(select template.slug from public.together_character_templates template where template.id=version.character_template_id),
      updated_at=now()
  from public.together_character_world_presence presence
  join public.together_media_reference_assets asset on asset.character_version_id=presence.character_version_id
    and asset.asset_role='character_identity' and asset.active
    and asset.storage_bucket='kivelle-character-reference'
  where version.id=presence.character_version_id and presence.world_id=v_world
    and presence.presence_type='resident'
    and asset.source_key='character:'||(select template.slug from public.together_character_templates template where template.id=version.character_template_id)||':identity';

  update public.together_character_templates template
  set discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
      'portraitStatus','ready','portraitSlotKey','gilded-coast-character-'||template.slug,
      'portraitPack','gilded_coast_v1','portraitFocalPosition','top'),updated_at=now()
  from public.together_character_world_presence presence
  join public.together_character_versions version on version.id=presence.character_version_id
  where presence.world_id=v_world and presence.presence_type='resident'
    and template.id=version.character_template_id;

  update public.together_character_world_presence presence
  set metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
      'portraitStatus','ready','portraitPack','gilded_coast_v1','portraitReferenceCount',1),updated_at=now()
  where presence.world_id=v_world and presence.presence_type='resident';

  update public.together_locations location
  set metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','ready','assetStatus','reference_ready'),updated_at=now()
  where location.world_id=v_world and location.owner_user_id is null and location.archived_at is null;

  update public.together_worlds world
  set metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','ready','locationPhotoStatus','reference_ready',
      'residentPortraitStatus','reference_ready','mappedResidentPortraitCount',36,
      'mappedLocationPhotoCount',42,'releaseStatus','media_ready'),updated_at=now()
  where world.id=v_world;
end $gilded_media$;
commit;
