begin;

do $$
declare
  location_count integer;
begin
  select count(*) into location_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000010'::uuid;

  if location_count<>51 then
    raise exception 'Vespormoor location art expects 51 canonical locations, found %',location_count;
  end if;
end $$;

update public.together_worlds set
  metadata=metadata||jsonb_build_object(
    'photoStatus','hero_ready',
    'locationPhotoStatus','ready',
    'mappedLocationPhotoCount',51
  ),
  updated_at=now()
where id='10000000-0000-4000-8000-000000000010'::uuid;

update public.together_locations set
  metadata=metadata||jsonb_build_object(
    'photoStatus','ready',
    'imageSlotKey','vespormoor-location-'||slug
  ),
  visual_asset_key='vespormoor-location-'||slug,
  updated_at=now()
where world_id='10000000-0000-4000-8000-000000000010'::uuid;

do $$
declare
  invalid_count integer;
begin
  select count(*) into invalid_count
  from public.together_worlds
  where id='10000000-0000-4000-8000-000000000010'::uuid
    and (
      metadata->>'locationPhotoStatus'<>'ready'
      or (metadata->>'mappedLocationPhotoCount')::integer<>51
    );

  if invalid_count<>0 then
    raise exception 'Vespormoor location-art metadata was not updated';
  end if;

  select count(*) into invalid_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000010'::uuid
    and (
      visual_asset_key is distinct from 'vespormoor-location-'||slug
      or metadata->>'photoStatus'<>'ready'
    );

  if invalid_count<>0 then
    raise exception 'Vespormoor has % locations without canonical art metadata',invalid_count;
  end if;
end $$;

commit;
