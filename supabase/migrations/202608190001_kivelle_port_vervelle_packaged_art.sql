begin;

with location_art(slug) as (
  values
    ('belvedere-garden'),
    ('capo-vervelle'),
    ('celeste-spa'),
    ('domaine-vervelle'),
    ('hotel-celeste'),
    ('mercato-vecchio'),
    ('officina-moretti'),
    ('piccolo-cinema'),
    ('vervelle-cooperative'),
    ('vervelle-design-works'),
    ('vervelle-general-clinic')
)
update public.together_locations as location
set visual_asset_key = location.slug,
    metadata = jsonb_set(
      jsonb_set(coalesce(location.metadata, '{}'::jsonb), '{photoStatus}', '"ready"'::jsonb, true),
      '{packagedAsset}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
from location_art
where location.world_id = '10000000-0000-4000-8000-000000000008'
  and location.slug = location_art.slug;

with portrait_art(slug) as (
  values
    ('alessia-romano'), ('amelie-rousseau'), ('ana-ribeiro'),
    ('bianca-de-luca'), ('camille-laurent'), ('chiara-vitale'),
    ('clara-mendes'), ('elena-moretti'), ('eva-moreau'),
    ('giulia-marchetti'), ('isabella-conti'), ('lea-benali'),
    ('lucia-ferraro'), ('margot-lefevre'), ('marta-solari'),
    ('mia-han-andersson'), ('nina-kovac'), ('sofia-bellini'),
    ('tessa-patel-morgan'), ('valentina-costa')
)
update public.together_character_templates as template
set discovery_metadata = jsonb_set(
      jsonb_set(coalesce(template.discovery_metadata, '{}'::jsonb), '{portraitStatus}', '"ready"'::jsonb, true),
      '{portraitAssetKey}',
      to_jsonb(template.slug),
      true
    ),
    updated_at = now()
from portrait_art
where template.slug = portrait_art.slug;

with portrait_art(slug) as (
  values
    ('alessia-romano'), ('amelie-rousseau'), ('ana-ribeiro'),
    ('bianca-de-luca'), ('camille-laurent'), ('chiara-vitale'),
    ('clara-mendes'), ('elena-moretti'), ('eva-moreau'),
    ('giulia-marchetti'), ('isabella-conti'), ('lea-benali'),
    ('lucia-ferraro'), ('margot-lefevre'), ('marta-solari'),
    ('mia-han-andersson'), ('nina-kovac'), ('sofia-bellini'),
    ('tessa-patel-morgan'), ('valentina-costa')
)
update public.together_character_versions as version
set portrait_asset_key = template.slug,
    appearance_config = jsonb_set(
      jsonb_set(coalesce(version.appearance_config, '{}'::jsonb), '{photoStatus}', '"ready"'::jsonb, true),
      '{portraitStatus}',
      '"ready"'::jsonb,
      true
    ),
    updated_at = now()
from public.together_character_templates as template
join portrait_art on portrait_art.slug = template.slug
where version.character_template_id = template.id
  and version.version = template.current_published_version;

update public.together_worlds
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'photoStatus', 'partial',
      'mappedLocationPhotoCount', 39,
      'residentPortraitStatus', 'partial',
      'mappedResidentPortraitCount', 20
    ),
    updated_at = now()
where slug = 'port-vervelle';

commit;
