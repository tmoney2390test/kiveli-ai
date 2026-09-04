-- Publish the first visually reviewed Vharadren location-art batch.
begin;

create temporary table vharadren_location_art_v1(slug text primary key) on commit drop;
insert into vharadren_location_art_v1(slug) values
  ('ashlands'),
  ('black-march'),
  ('crownspire'),
  ('dragonbone-citadel'),
  ('ember-isles'),
  ('ember-throne-hall'),
  ('shattered-coast'),
  ('verdant-reach');

update public.together_locations location
set
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'locationArtPack','vharadren_location_art_v1',
    'locationReferenceSourceKey','location:vharadren:'||location.slug||':canonical'
  ),
  updated_at=now()
from vharadren_location_art_v1 artwork
where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.slug=artwork.slug;

update public.together_worlds world
set
  metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
    'locationPhotoStatus','partial',
    'mappedLocationPhotoCount',8,
    'locationImageSlotCount',51,
    'locationArtPack','vharadren_location_art_v1'
  ),
  updated_at=now()
where world.id='10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  location_count integer;
  asset_count integer;
  ready_count integer;
begin
  select count(*) into location_count
  from public.together_locations location
  join vharadren_location_art_v1 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid;

  select count(*) into asset_count
  from public.together_media_reference_assets asset
  join public.together_locations location on location.id=asset.location_id
  join vharadren_location_art_v1 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and asset.asset_role='location_canonical'
    and asset.source_key='location:vharadren:'||location.slug||':canonical'
    and asset.storage_bucket='kivelle-reference-media'
    and asset.active=true;

  select count(*) into ready_count
  from public.together_locations location
  join vharadren_location_art_v1 artwork on artwork.slug=location.slug
  where location.world_id='10000000-0000-4000-8000-000000000013'::uuid
    and location.metadata->>'photoStatus'='ready';

  if location_count<>8 or asset_count<>8 or ready_count<>8 then
    raise exception 'Vharadren location art v1 integration failed: locations %, assets %, ready %',location_count,asset_count,ready_count;
  end if;
end $$;

commit;
