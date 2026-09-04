-- Promote the improved Red Hour image to the active private generation reference.
-- The earlier revision remains stored for historical jobs that already snapshot it.
begin;

update public.together_media_reference_assets asset
set active=false,updated_at=now()
where asset.asset_role='location_canonical'
  and asset.source_key='location:juniper-city:red-hour:canonical'
  and asset.sha256 is distinct from 'ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825';

insert into public.together_media_reference_assets(
  asset_role,location_id,source_key,storage_bucket,storage_path,content_type,
  width,height,byte_size,sha256,revision,active,metadata
)
select
  'location_canonical',
  location.id,
  'location:juniper-city:red-hour:canonical',
  'kivelle-reference-media',
  'location_canonical/location:juniper-city:red-hour:canonical/ed68961af6c499fb29e8.jpg',
  'image/jpeg',
  1280,
  720,
  210151,
  'ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825',
  coalesce((
    select max(existing.revision)+1
    from public.together_media_reference_assets existing
    where existing.asset_role='location_canonical'
      and existing.source_key='location:juniper-city:red-hour:canonical'
  ),1),
  true,
  jsonb_build_object(
    'syncedBy','202609040032_kivelle_red_hour_location_art_v2',
    'sourcePath','/apps/together/assets/locations/juniper-city/red-hour.jpg',
    'visualRevision','upscale_cabaret_v2'
  )
from public.together_locations location
join public.together_worlds world on world.id=location.world_id
where world.slug='juniper-city'
  and location.slug='red-hour'
  and not exists(
    select 1
    from public.together_media_reference_assets existing
    where existing.asset_role='location_canonical'
      and existing.source_key='location:juniper-city:red-hour:canonical'
      and existing.sha256='ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825'
  );

update public.together_media_reference_assets asset
set
  active=true,
  storage_path='location_canonical/location:juniper-city:red-hour:canonical/ed68961af6c499fb29e8.jpg',
  updated_at=now()
where asset.asset_role='location_canonical'
  and asset.source_key='location:juniper-city:red-hour:canonical'
  and asset.sha256='ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825';

update public.together_locations location
set
  visual_asset_key=location.slug,
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'packagedAsset',true,
    'locationReferenceSourceKey','location:juniper-city:red-hour:canonical',
    'locationArtRevision','upscale_cabaret_v2'
  ),
  updated_at=now()
from public.together_worlds world
where world.id=location.world_id
  and world.slug='juniper-city'
  and location.slug='red-hour';

do $$
begin
  if not exists(
    select 1 from public.together_media_reference_assets asset
    where asset.asset_role='location_canonical'
      and asset.source_key='location:juniper-city:red-hour:canonical'
      and asset.sha256='ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825'
      and asset.active=true
  ) then
    raise exception 'The Red Hour canonical reference revision was not activated';
  end if;

  if exists(
    select 1 from public.together_media_reference_assets asset
    where asset.asset_role='location_canonical'
      and asset.source_key='location:juniper-city:red-hour:canonical'
      and asset.sha256 is distinct from 'ed68961af6c499fb29e8662512babb1049ef4cdeb5272eecdda5e9d249188825'
      and asset.active=true
  ) then
    raise exception 'The Red Hour has more than one active visual revision';
  end if;

  if not exists(
    select 1 from storage.objects object
    where object.bucket_id='kivelle-reference-media'
      and object.name='location_canonical/location:juniper-city:red-hour:canonical/ed68961af6c499fb29e8.jpg'
  ) then
    raise exception 'The Red Hour canonical object is missing from private storage';
  end if;
end $$;

commit;
