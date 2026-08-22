begin;

with photographed(slug) as (
  values
    ('locanda-vela'),
    ('palazzo-sereno'),
    ('hotel-coralline'),
    ('casa-livia'),
    ('hotel-celeste'),
    ('celeste-spa')
)
update public.together_locations as location
set visual_asset_key=location.slug,
    metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','ready',
      'packagedAsset',true
    ),
    updated_at=now()
from public.together_worlds as world,photographed
where world.slug='port-vervelle'
  and location.world_id=world.id
  and location.slug=photographed.slug;

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','partial',
      'mappedLocationPhotoCount',43
    ),
    updated_at=now()
where slug='port-vervelle';

-- Register every Port Vervelle asset that the earlier packaged-art migration
-- declared ready but that had not actually been copied into Expo or private
-- reference storage, plus the four newly supplied hotel images.
with asset_seed(slug,sha256,storage_path,byte_size,width,height) as (
  values
    ('belvedere-garden','2af35fd7251b985153b726628037744890971a40209fa0c4142d948760f35197','location_canonical/location:port-vervelle:belvedere-garden:canonical/2af35fd7251b985153b7.png',2520267,1448,1086),
    ('capo-vervelle','0b7a53a9e794690a7b1663416e5275c71984127aaa59427b4537a4bfed2dbed0','location_canonical/location:port-vervelle:capo-vervelle:canonical/0b7a53a9e794690a7b16.png',2733527,1535,1024),
    ('celeste-spa','cfbcfb835bec6ce0de410fdac423a983c5b12d777c32a17b83ef2fb04ef5e3b3','location_canonical/location:port-vervelle:celeste-spa:canonical/cfbcfb835bec6ce0de41.png',2778034,1448,1086),
    ('domaine-vervelle','3134902a1b35f887cb586aa542b764068b73e7413dabe9a34902a92b548bdcb4','location_canonical/location:port-vervelle:domaine-vervelle:canonical/3134902a1b35f887cb58.png',2848859,1536,1024),
    ('hotel-celeste','ccd6d4c1b9fa3ec4cd6041cd3765427ef79124c8301df3f9f94934dbee2a1eca','location_canonical/location:port-vervelle:hotel-celeste:canonical/ccd6d4c1b9fa3ec4cd60.png',2528773,1535,1024),
    ('mercato-vecchio','5e4c9cdedfb87e8bd23813c5ff3101fd97b36e519c78fd4dba72cd03f41e2186','location_canonical/location:port-vervelle:mercato-vecchio:canonical/5e4c9cdedfb87e8bd238.png',2994938,1448,1086),
    ('officina-moretti','7b39c05664b5e132f9054f372c5c70ae53d5182cbb75dabceb8b53187e89dfee','location_canonical/location:port-vervelle:officina-moretti:canonical/7b39c05664b5e132f905.png',2727556,1448,1086),
    ('piccolo-cinema','54aeadd99356de9c3c987bb53855fd70a55ee0911aa0839b27187468cca7ebe2','location_canonical/location:port-vervelle:piccolo-cinema:canonical/54aeadd99356de9c3c98.png',2159259,1448,1086),
    ('vervelle-cooperative','3a9bf2820848a22a5d54990982b3ea8726b497d622799bfd6e20237f9fc605d0','location_canonical/location:port-vervelle:vervelle-cooperative:canonical/3a9bf2820848a22a5d54.png',2626350,1448,1086),
    ('vervelle-design-works','535c84a1b5b9a569c80e7ae0e2fc0d58c07643bed907b686efa48c718c51e0a2','location_canonical/location:port-vervelle:vervelle-design-works:canonical/535c84a1b5b9a569c80e.png',2946719,1448,1086),
    ('vervelle-general-clinic','fceb1433c8a1cf073ad98fd056e5ed4c263180ddc68a01b47306cbac292a0564','location_canonical/location:port-vervelle:vervelle-general-clinic:canonical/fceb1433c8a1cf073ad9.png',2710658,1448,1086),
    ('locanda-vela','7e5dd503ced0d8836c1bc4dbd97c1b4cfa09f7983b8ebdd863ccc185b10e064c','location_canonical/location:port-vervelle:locanda-vela:canonical/7e5dd503ced0d8836c1b.png',3038713,1448,1086),
    ('palazzo-sereno','ae600fb9093425446285b29d94f7271fe53fd753640d190e94765f55b4c1b66f','location_canonical/location:port-vervelle:palazzo-sereno:canonical/ae600fb9093425446285.png',2818754,1448,1086),
    ('hotel-coralline','66cbe276d0348b6fb559363a8c9b317a4a23d1f463e0e8e99a14107a2ebd3bc8','location_canonical/location:port-vervelle:hotel-coralline:canonical/66cbe276d0348b6fb559.png',2707540,1448,1086),
    ('casa-livia','86c4262fc764c5f5e8212754c185c615db185f3e8a4d721ffa7f3bda2481a1ea','location_canonical/location:port-vervelle:casa-livia:canonical/86c4262fc764c5f5e821.png',2857659,1448,1086)
), resolved as (
  select seed.*,location.id as location_id,'location:port-vervelle:'||seed.slug||':canonical' as source_key
  from asset_seed seed
  join public.together_worlds world on world.slug='port-vervelle'
  join public.together_locations location on location.world_id=world.id and location.slug=seed.slug
), deactivated as (
  update public.together_media_reference_assets asset
  set active=false,updated_at=now()
  from resolved
  where asset.asset_role='location_canonical'
    and asset.source_key=resolved.source_key
    and asset.sha256 is distinct from resolved.sha256
  returning asset.id
)
insert into public.together_media_reference_assets(
  asset_role,location_id,source_key,storage_bucket,storage_path,content_type,
  width,height,byte_size,sha256,revision,active,metadata
)
select
  'location_canonical',resolved.location_id,resolved.source_key,'kivelle-reference-media',
  resolved.storage_path,'image/png',resolved.width,resolved.height,resolved.byte_size,
  resolved.sha256,
  coalesce((select max(existing.revision)+1 from public.together_media_reference_assets existing where existing.asset_role='location_canonical' and existing.source_key=resolved.source_key),1),
  true,
  jsonb_build_object('syncedBy','202608210009_kivelle_port_vervelle_lodging_art','sourcePath','/apps/together/assets/locations/port-vervelle/'||resolved.slug||'.png')
from resolved
where not exists(
  select 1 from public.together_media_reference_assets existing
  where existing.asset_role='location_canonical'
    and existing.source_key=resolved.source_key
    and existing.sha256=resolved.sha256
);

with asset_seed(slug,sha256,storage_path) as (
  values
    ('belvedere-garden','2af35fd7251b985153b726628037744890971a40209fa0c4142d948760f35197','location_canonical/location:port-vervelle:belvedere-garden:canonical/2af35fd7251b985153b7.png'),
    ('capo-vervelle','0b7a53a9e794690a7b1663416e5275c71984127aaa59427b4537a4bfed2dbed0','location_canonical/location:port-vervelle:capo-vervelle:canonical/0b7a53a9e794690a7b16.png'),
    ('celeste-spa','cfbcfb835bec6ce0de410fdac423a983c5b12d777c32a17b83ef2fb04ef5e3b3','location_canonical/location:port-vervelle:celeste-spa:canonical/cfbcfb835bec6ce0de41.png'),
    ('domaine-vervelle','3134902a1b35f887cb586aa542b764068b73e7413dabe9a34902a92b548bdcb4','location_canonical/location:port-vervelle:domaine-vervelle:canonical/3134902a1b35f887cb58.png'),
    ('hotel-celeste','ccd6d4c1b9fa3ec4cd6041cd3765427ef79124c8301df3f9f94934dbee2a1eca','location_canonical/location:port-vervelle:hotel-celeste:canonical/ccd6d4c1b9fa3ec4cd60.png'),
    ('mercato-vecchio','5e4c9cdedfb87e8bd23813c5ff3101fd97b36e519c78fd4dba72cd03f41e2186','location_canonical/location:port-vervelle:mercato-vecchio:canonical/5e4c9cdedfb87e8bd238.png'),
    ('officina-moretti','7b39c05664b5e132f9054f372c5c70ae53d5182cbb75dabceb8b53187e89dfee','location_canonical/location:port-vervelle:officina-moretti:canonical/7b39c05664b5e132f905.png'),
    ('piccolo-cinema','54aeadd99356de9c3c987bb53855fd70a55ee0911aa0839b27187468cca7ebe2','location_canonical/location:port-vervelle:piccolo-cinema:canonical/54aeadd99356de9c3c98.png'),
    ('vervelle-cooperative','3a9bf2820848a22a5d54990982b3ea8726b497d622799bfd6e20237f9fc605d0','location_canonical/location:port-vervelle:vervelle-cooperative:canonical/3a9bf2820848a22a5d54.png'),
    ('vervelle-design-works','535c84a1b5b9a569c80e7ae0e2fc0d58c07643bed907b686efa48c718c51e0a2','location_canonical/location:port-vervelle:vervelle-design-works:canonical/535c84a1b5b9a569c80e.png'),
    ('vervelle-general-clinic','fceb1433c8a1cf073ad98fd056e5ed4c263180ddc68a01b47306cbac292a0564','location_canonical/location:port-vervelle:vervelle-general-clinic:canonical/fceb1433c8a1cf073ad9.png'),
    ('locanda-vela','7e5dd503ced0d8836c1bc4dbd97c1b4cfa09f7983b8ebdd863ccc185b10e064c','location_canonical/location:port-vervelle:locanda-vela:canonical/7e5dd503ced0d8836c1b.png'),
    ('palazzo-sereno','ae600fb9093425446285b29d94f7271fe53fd753640d190e94765f55b4c1b66f','location_canonical/location:port-vervelle:palazzo-sereno:canonical/ae600fb9093425446285.png'),
    ('hotel-coralline','66cbe276d0348b6fb559363a8c9b317a4a23d1f463e0e8e99a14107a2ebd3bc8','location_canonical/location:port-vervelle:hotel-coralline:canonical/66cbe276d0348b6fb559.png'),
    ('casa-livia','86c4262fc764c5f5e8212754c185c615db185f3e8a4d721ffa7f3bda2481a1ea','location_canonical/location:port-vervelle:casa-livia:canonical/86c4262fc764c5f5e821.png')
)
update public.together_media_reference_assets asset
set active=true,storage_path=seed.storage_path,updated_at=now()
from asset_seed seed
where asset.asset_role='location_canonical'
  and asset.source_key='location:port-vervelle:'||seed.slug||':canonical'
  and asset.sha256=seed.sha256;

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from public.together_locations as location
  join public.together_worlds as world on world.id=location.world_id
  where world.slug='port-vervelle'
    and location.slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste','celeste-spa')
    and(
      location.visual_asset_key is distinct from location.slug
      or location.metadata->>'photoStatus'<>'ready'
      or location.metadata->>'packagedAsset'<>'true'
    );
  if invalid_count<>0 then
    raise exception 'Port Vervelle has % lodging images without canonical packaged art',invalid_count;
  end if;

  select count(*) into invalid_count
  from public.together_media_reference_assets asset
  where asset.asset_role='location_canonical'
    and asset.active=true
    and asset.source_key in(
      'location:port-vervelle:locanda-vela:canonical',
      'location:port-vervelle:palazzo-sereno:canonical',
      'location:port-vervelle:hotel-coralline:canonical',
      'location:port-vervelle:casa-livia:canonical',
      'location:port-vervelle:hotel-celeste:canonical',
      'location:port-vervelle:celeste-spa:canonical'
    );
  if invalid_count<>6 then
    raise exception 'Port Vervelle expected 6 active lodging reference assets, found %',invalid_count;
  end if;
end $$;

commit;
