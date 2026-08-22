begin;

do $$
declare location_count integer;
begin
  select count(*) into location_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000009'::uuid;

  if location_count<>51 then
    raise exception 'Neon Kyo location art expects 51 canonical locations, found %',location_count;
  end if;
end $$;

update public.together_worlds set
  name='Neon Kyo',
  metadata=metadata||jsonb_build_object(
    'photoStatus','ready',
    'locationPhotoStatus','ready',
    'mappedLocationPhotoCount',51
  ),
  updated_at=now()
where id='10000000-0000-4000-8000-000000000009'::uuid;

update public.together_locations set
  description=replace(description,'NEON KYO','Neon Kyo'),
  visual_asset_key=slug,
  canonical_visual_context=replace(canonical_visual_context::text,'NEON KYO','Neon Kyo')::jsonb,
  metadata=metadata||jsonb_build_object('photoStatus','ready'),
  updated_at=now()
where world_id='10000000-0000-4000-8000-000000000009'::uuid;

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from public.together_worlds
  where id='10000000-0000-4000-8000-000000000009'::uuid
    and (name<>'Neon Kyo'
      or metadata->>'locationPhotoStatus'<>'ready'
      or (metadata->>'mappedLocationPhotoCount')::integer<>51);

  if invalid_count<>0 then
    raise exception 'Neon Kyo world identity or location-art metadata was not updated';
  end if;

  select count(*) into invalid_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000009'::uuid
    and (visual_asset_key is distinct from slug or metadata->>'photoStatus'<>'ready');

  if invalid_count<>0 then
    raise exception 'Neon Kyo has % locations without canonical art',invalid_count;
  end if;
end $$;

commit;
