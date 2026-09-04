-- Complete the visually reviewed Crownspire location-art set.
begin;

create temporary table vharadren_location_art_v2(slug text primary key) on commit drop;
insert into vharadren_location_art_v2(slug) values
  ('basilica-seven-flames'),
  ('blackglass-baths'),
  ('gilded-steps-market'),
  ('house-of-velvet-oaths'),
  ('lantern-gallows'),
  ('red-ledger-exchange');

update public.together_locations location
set
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'locationArtPack','vharadren_location_art_v2',
    'locationReferenceSourceKey','location:vharadren:'||location.slug||':canonical'
  ),
  updated_at=now()
from vharadren_location_art_v2 artwork
where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.slug=artwork.slug;

update public.together_worlds world
set
  metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
    'locationPhotoStatus','partial',
    'mappedLocationPhotoCount',14,
    'locationImageSlotCount',51,
    'locationArtPack','vharadren_location_art_v2'
  ),
  updated_at=now()
where world.id='10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  location_count integer;
  batch_asset_count integer;
  total_asset_count integer;
  ready_count integer;
begin
  select count(*) into location_count
  from public.together_locations location
  join vharadren_location_art_v2 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid;

  select count(*) into batch_asset_count
  from public.together_media_reference_assets asset
  join public.together_locations location on location.id=asset.location_id
  join vharadren_location_art_v2 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and asset.asset_role='location_canonical'
    and asset.source_key='location:vharadren:'||location.slug||':canonical'
    and asset.storage_bucket='kivelle-reference-media'
    and asset.active=true;

  select count(*) into total_asset_count
  from public.together_media_reference_assets asset
  join public.together_locations location on location.id=asset.location_id
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and asset.asset_role='location_canonical'
    and asset.active=true;

  select count(*) into ready_count
  from public.together_locations location
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and location.metadata->>'photoStatus'='ready';

  if location_count<>6 or batch_asset_count<>6 or total_asset_count<>14 or ready_count<>14 then
    raise exception 'Vharadren location art v2 integration failed: locations %, batch assets %, total assets %, ready %',location_count,batch_asset_count,total_asset_count,ready_count;
  end if;
end $$;

commit;
