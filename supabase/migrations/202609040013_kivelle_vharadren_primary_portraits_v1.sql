-- Link the first Vharadren portrait batch to every catalog and media surface.
-- Portrait bytes remain private in kivelle-character-reference; clients receive
-- only short-lived signed URLs through the existing catalog and media APIs.
begin;

create temporary table vharadren_portrait_characters(slug text primary key) on commit drop;
insert into vharadren_portrait_characters(slug) values
  ('dame-ysabet-rooke'),
  ('garrick-holt'),
  ('high-flame-elowen-orison'),
  ('lady-isolde-morcant'),
  ('prince-lucien-vaelorian'),
  ('princess-elara-thornwall'),
  ('queen-maerra-vaelorian'),
  ('tamsin-quill');

create temporary table vharadren_portrait_assets on commit drop as
select
  template.slug,
  version.id as character_version_id,
  jsonb_agg(asset.storage_path order by (asset.source_key like '%:secondary-%'),asset.source_key) as reference_paths,
  min(asset.storage_path) filter(where asset.source_key='character:'||template.slug||':identity') as primary_path,
  count(*)::integer as reference_count
from vharadren_portrait_characters expected
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
      'portraitPack','vharadren_primary_portraits_v1',
      'portraitSource','authored_and_generated_canonical_assets'
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
from vharadren_portrait_assets portrait
where version.id=portrait.character_version_id;

update public.together_character_templates template
set
  discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
    'portraitStatus','ready',
    'portraitSlotKey','vharadren-character-'||template.slug,
    'portraitPack','vharadren_primary_portraits_v1',
    'portraitFocalPosition','top'
  ),
  updated_at=now()
from vharadren_portrait_assets portrait
where template.slug=portrait.slug;

update public.together_character_world_presence presence
set
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
    'portraitStatus','ready',
    'portraitPack','vharadren_primary_portraits_v1',
    'portraitReferenceCount',portrait.reference_count
  ),
  updated_at=now()
from vharadren_portrait_assets portrait
where presence.character_version_id=portrait.character_version_id
  and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  linked_count integer;
  primary_count integer;
  secondary_count integer;
  ready_count integer;
begin
  select count(*),count(primary_path) into linked_count,primary_count from vharadren_portrait_assets;
  select coalesce(sum(reference_count-1),0) into secondary_count from vharadren_portrait_assets;
  select count(*) into ready_count
  from public.together_character_versions version
  join vharadren_portrait_assets portrait on portrait.character_version_id=version.id
  where version.visual_identity->>'status'='reference_ready'
    and version.visual_identity->>'referenceOrigin'='generated_fictional'
    and jsonb_array_length(coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb))=portrait.reference_count;

  if linked_count<>8 or primary_count<>8 or secondary_count<>3 or ready_count<>8 then
    raise exception 'Vharadren portrait integration failed: linked %, primaries %, secondaries %, ready %',linked_count,primary_count,secondary_count,ready_count;
  end if;
end $$;

commit;
