-- Link nightlife expansion portraits and club artwork to canonical reference assets.
begin;

create temporary table nightlife_portrait_characters(slug text primary key) on commit drop;
insert into nightlife_portrait_characters(slug) values
  ('lila-quinn'),
  ('sienna-cruz'),
  ('giada-morelli'),
  ('paloma-vargas');

create temporary table nightlife_portrait_assets on commit drop as
select
  template.slug,
  version.id as character_version_id,
  jsonb_agg(asset.storage_path order by asset.source_key) as reference_paths,
  min(asset.storage_path) filter(where asset.source_key='character:'||template.slug||':identity') as primary_path,
  count(*)::integer as reference_count
from nightlife_portrait_characters expected
join public.together_character_templates template on template.slug=expected.slug
join public.together_character_versions version
  on version.character_template_id=template.id
 and version.version=template.current_published_version
join public.together_media_reference_assets asset
  on asset.character_version_id=version.id
 and asset.asset_role='character_identity'
 and asset.active=true
 and asset.source_key='character:'||template.slug||':identity'
 and asset.storage_bucket='kivelle-character-reference'
group by template.slug,version.id;

update public.together_character_versions version
set
  portrait_asset_key=portrait.slug,
  visual_identity=jsonb_set(
    coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object(
      'status','reference_ready',
      'referenceOrigin','generated_fictional',
      'adultMediaReferenceEligible',true,
      'portraitPack','nightlife_expansion_v1',
      'portraitSource','authored_packaged_asset'
    ),
    '{referenceStoragePaths}',portrait.reference_paths,true
  ),
  appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
    'photoStatus','ready',
    'portraitStatus','reference_ready',
    'asset',portrait.slug,
    'referenceStoragePath',portrait.primary_path,
    'referenceCount',portrait.reference_count
  ),
  updated_at=now()
from nightlife_portrait_assets portrait
where version.id=portrait.character_version_id;

update public.together_character_templates template
set
  discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
    'portraitStatus','ready',
    'portraitAssetKey',template.slug,
    'portraitPack','nightlife_expansion_v1',
    'portraitFocalPosition','top'
  ),
  updated_at=now()
from nightlife_portrait_assets portrait
where template.slug=portrait.slug;

update public.together_locations location
set
  metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'assetStatus','ready',
    'photoStatus','ready',
    'locationArtPack','nightlife_expansion_v1',
    'locationReferenceSourceKey','location:'||world.slug||':'||location.slug||':canonical'
  ),
  updated_at=now()
from public.together_worlds world
where world.id=location.world_id
  and (
    (world.slug='juniper-city' and location.slug='red-hour')
    or (world.slug='port-vervelle' and location.slug='circolo-nove')
  );

do $$
declare linked_count integer; primary_count integer; location_ready integer;
begin
  select count(*),count(primary_path) into linked_count,primary_count from nightlife_portrait_assets;
  select count(*) into location_ready
  from public.together_locations location
  where location.slug in('red-hour','circolo-nove')
    and location.metadata->>'photoStatus'='ready';
  if linked_count<>4 or primary_count<>4 or location_ready<>2 then
    raise exception 'Nightlife portrait integration failed: linked %, primaries %, locations %',linked_count,primary_count,location_ready;
  end if;
end $$;

commit;
