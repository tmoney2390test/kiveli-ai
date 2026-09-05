begin;

-- Bind the generated fictional portraits already synchronized to the private
-- character-reference bucket. No public object URL is persisted.
create temporary table vharadren_portrait_characters_v8(slug text primary key) on commit drop;

insert into vharadren_portrait_characters_v8(slug) values
  ('princess-maris-vaelorian'),
  ('celia-thatch');

create temporary table vharadren_portrait_assets_v8 on commit drop as
select
  template.slug,
  version.id as character_version_id,
  jsonb_agg(asset.storage_path order by (asset.source_key like '%:secondary-%'),asset.source_key) as reference_paths,
  min(asset.storage_path) filter(where asset.source_key='character:'||template.slug||':identity') as primary_path,
  count(*)::integer as reference_count
from vharadren_portrait_characters_v8 expected
join public.together_character_templates template on template.slug=expected.slug
join public.together_character_versions version
  on version.character_template_id=template.id
 and version.version=template.current_published_version
join public.together_media_reference_assets asset
  on asset.character_version_id=version.id
 and asset.asset_role='character_identity'
 and asset.active=true
 and(asset.source_key='character:'||template.slug||':identity' or asset.source_key like 'character:'||template.slug||':identity:secondary-%')
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
      'portraitPack','vharadren_primary_portraits_v8',
      'portraitSource','generated_canonical_asset'
    ),
    '{referenceStoragePaths}',portrait.reference_paths,true
  ),
  appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
    'photoStatus','ready',
    'portraitStatus','reference_ready',
    'referenceStoragePath',portrait.primary_path,
    'referenceCount',portrait.reference_count
  ),
  updated_at=now()
from vharadren_portrait_assets_v8 portrait
where version.id=portrait.character_version_id;

update public.together_character_templates template
set
  discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
    'portraitStatus','ready',
    'portraitSlotKey','vharadren-character-'||template.slug,
    'portraitPack','vharadren_primary_portraits_v8',
    'portraitFocalPosition','top'
  ),
  updated_at=now()
from vharadren_portrait_assets_v8 portrait
where template.slug=portrait.slug;

update public.together_character_world_presence presence
set
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
    'portraitStatus','ready',
    'portraitPack','vharadren_primary_portraits_v8',
    'portraitReferenceCount',portrait.reference_count
  ),
  updated_at=now()
from vharadren_portrait_assets_v8 portrait
where presence.character_version_id=portrait.character_version_id
  and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'residentPortraitStatus','primary_portraits_ready',
  'mappedResidentPortraitCount',52,
  'portraitSlotCount',52,
  'residentCompanionCount',52,
  'portraitPackVersion',8
),updated_at=now()
where id='10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  linked_count integer;
  primary_count integer;
  ready_count integer;
  world_primary_count integer;
begin
  select count(*),count(primary_path) into linked_count,primary_count from vharadren_portrait_assets_v8;
  select count(*) into ready_count
  from public.together_character_versions version
  join vharadren_portrait_assets_v8 portrait on portrait.character_version_id=version.id
  where version.visual_identity->>'status'='reference_ready'
    and version.visual_identity->>'referenceOrigin'='generated_fictional'
    and jsonb_array_length(coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb))=portrait.reference_count;

  select count(*) into world_primary_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  join public.together_character_world_presence presence
    on presence.character_version_id=version.id
   and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
  where version.visual_identity->>'status'='reference_ready'
    and nullif(version.appearance_config->>'referenceStoragePath','') is not null;

  if linked_count<>2 or primary_count<>2 or ready_count<>2 or world_primary_count<>52 then
    raise exception 'Vharadren portrait v8 integration failed: linked %, primaries %, ready %, world primaries %',linked_count,primary_count,ready_count,world_primary_count;
  end if;
end $$

commit;
