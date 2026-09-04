-- Complete the visually reviewed Shattered Coast location-art set.
begin;

create temporary table vharadren_location_art_v6(slug text primary key) on commit drop;
insert into vharadren_location_art_v6(slug) values
  ('drowned-crown-palace'),
  ('greymere-shipyard'),
  ('knifeharbor-market'),
  ('lantern-rooms'),
  ('saint-orlas-lighthouse'),
  ('salt-widow-tavern'),
  ('tidevault-prison');

update public.together_locations location
set
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'locationArtPack','vharadren_location_art_v6',
    'locationReferenceSourceKey','location:vharadren:'||location.slug||':canonical'
  ),
  updated_at=now()
from vharadren_location_art_v6 artwork
where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.slug=artwork.slug;

update public.together_worlds world
set
  metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
    'locationPhotoStatus','partial',
    'mappedLocationPhotoCount',43,
    'locationImageSlotCount',51,
    'locationArtPack','vharadren_location_art_v6'
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
  join vharadren_location_art_v6 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid;

  select count(*) into batch_asset_count
  from public.together_media_reference_assets asset
  join public.together_locations location on location.id=asset.location_id
  join vharadren_location_art_v6 artwork on artwork.slug=location.slug
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

  if location_count<>7 or batch_asset_count<>7 or total_asset_count<>43 or ready_count<>43 then
    raise exception 'Vharadren location art v6 integration failed: locations %, batch assets %, total assets %, ready %',location_count,batch_asset_count,total_asset_count,ready_count;
  end if;
end $$;

commit;
