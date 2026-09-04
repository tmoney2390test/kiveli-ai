-- Complete the visually reviewed Ashlands set and the full Vharadren location catalog.
begin;

create temporary table vharadren_location_art_v7(slug text primary key) on commit drop;
insert into vharadren_location_art_v7(slug) values
  ('ash-mother-infirmary'),
  ('chainbreakers-market'),
  ('cinder-camp'),
  ('glass-battlefield'),
  ('old-imperial-waystation'),
  ('saintless-house'),
  ('unshackled-cup'),
  ('vault-nameless-kings');

update public.together_locations location
set
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'locationArtPack','vharadren_location_art_v7',
    'locationReferenceSourceKey','location:vharadren:'||location.slug||':canonical'
  ),
  updated_at=now()
from vharadren_location_art_v7 artwork
where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.slug=artwork.slug;

update public.together_worlds world
set
  metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
    'locationPhotoStatus','ready',
    'mappedLocationPhotoCount',51,
    'locationImageSlotCount',51,
    'locationArtPack','vharadren_location_art_v7'
  ),
  updated_at=now()
where world.id='10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  location_count integer;
  batch_asset_count integer;
  total_asset_count integer;
  ready_count integer;
  invalid_reference_count integer;
begin
  select count(*) into location_count
  from public.together_locations location
  join vharadren_location_art_v7 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid;

  select count(*) into batch_asset_count
  from public.together_media_reference_assets asset
  join public.together_locations location on location.id=asset.location_id
  join vharadren_location_art_v7 artwork on artwork.slug=location.slug
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

  select count(*) into invalid_reference_count
  from public.together_locations location
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and (
      location.metadata->>'locationReferenceSourceKey' is distinct from 'location:vharadren:'||location.slug||':canonical'
      or not exists(
        select 1
        from public.together_media_reference_assets asset
        where asset.location_id=location.id
          and asset.asset_role='location_canonical'
          and asset.source_key='location:vharadren:'||location.slug||':canonical'
          and asset.storage_bucket='kivelle-reference-media'
          and asset.active=true
      )
    );

  if location_count<>8 or batch_asset_count<>8 or total_asset_count<>51 or ready_count<>51 or invalid_reference_count<>0 then
    raise exception 'Vharadren location art v7 integration failed: locations %, batch assets %, total assets %, ready %, invalid references %',location_count,batch_asset_count,total_asset_count,ready_count,invalid_reference_count;
  end if;
end $$;

commit;
