-- Final release gate. Run only after media linking, database tests, and
-- live staging checks pass. It publishes the world and enables its Pulse.
begin;
do $gilded_release$
declare
  v_world uuid := '10000000-0000-4000-8000-000000000014'::uuid;
  v_residents integer;
  v_places integer;
  v_portraits integer;
  v_place_images integer;
  v_routine integer;
  v_major integer;
  v_scenarios integer;
begin
  select count(*) into v_residents from public.together_character_world_presence
    where world_id=v_world and presence_type='resident';
  select count(*) into v_places from public.together_locations
    where world_id=v_world and owner_user_id is null and archived_at is null;
  select count(*) into v_portraits
    from public.together_character_world_presence presence
    join public.together_character_versions version on version.id=presence.character_version_id
    where presence.world_id=v_world and presence.presence_type='resident'
      and version.visual_identity->>'status'='reference_ready'
      and jsonb_array_length(coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb))>=1;
  select count(*) into v_place_images from public.together_locations
    where world_id=v_world and owner_user_id is null and archived_at is null
      and metadata->>'photoStatus'='ready';
  select count(*) into v_routine from public.together_world_pulse_templates
    where world_id=v_world and active and coalesce(metadata->>'pulseTier','routine')='routine';
  select count(*) into v_major from public.together_world_pulse_templates
    where world_id=v_world and active and metadata->>'pulseTier'='major';
  select count(*) into v_scenarios from public.together_scenario_definitions
    where world_id=v_world;
  if v_residents<>36 or v_places<>42 or v_portraits<>36 or v_place_images<>42
    or v_routine<>200 or v_major<>15 or v_scenarios<>8 then
    raise exception 'Gilded Coast release blocked: residents %, places %, portraits %, place images %, routine %, major %, scenarios %',
      v_residents,v_places,v_portraits,v_place_images,v_routine,v_major,v_scenarios;
  end if;
  update public.together_worlds set published=true,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('releaseStatus','published'),
    updated_at=now() where id=v_world;
  update public.together_world_pulse_settings set enabled=true,updated_at=now()
    where world_id=v_world;
end $gilded_release$;
commit;
