begin;

with portrait_art(slug) as (
  values
    ('aya-mori'), ('emi-takahashi'), ('chloe-mercier'), ('rika-senzaki'), ('noa-7'),
    ('sora-hayashi'), ('yumi-kato'), ('mina-seo'), ('elena-volkov'), ('zhen-li'),
    ('reina-kuroda'), ('piper-shaw'), ('lexi-morgan'), ('vittoria-bellandi'), ('eva-aoyama'),
    ('yuna-park'), ('rin-akiyama'), ('natsumi-endo'), ('laleh-rahimi'), ('kira-3'),
    ('mia-lindstrom'), ('mika-sato'), ('ana-luiza-ribeiro'), ('mei-watanabe'), ('freya-keller'),
    ('akari-fujimoto'), ('fumi-arai'), ('isabella-reyes'), ('talia-okafor'), ('iori')
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
where template.slug = portrait_art.slug
  and template.discovery_metadata->>'residentWorldSlug' = 'neon-kyo';

with portrait_art(slug) as (
  values
    ('aya-mori'), ('emi-takahashi'), ('chloe-mercier'), ('rika-senzaki'), ('noa-7'),
    ('sora-hayashi'), ('yumi-kato'), ('mina-seo'), ('elena-volkov'), ('zhen-li'),
    ('reina-kuroda'), ('piper-shaw'), ('lexi-morgan'), ('vittoria-bellandi'), ('eva-aoyama'),
    ('yuna-park'), ('rin-akiyama'), ('natsumi-endo'), ('laleh-rahimi'), ('kira-3'),
    ('mia-lindstrom'), ('mika-sato'), ('ana-luiza-ribeiro'), ('mei-watanabe'), ('freya-keller'),
    ('akari-fujimoto'), ('fumi-arai'), ('isabella-reyes'), ('talia-okafor'), ('iori')
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
  and version.version = template.current_published_version
  and template.discovery_metadata->>'residentWorldSlug' = 'neon-kyo';

update public.together_worlds
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'residentPortraitStatus', 'ready',
      'mappedResidentPortraitCount', 30
    ),
    updated_at = now()
where slug = 'neon-kyo';

commit;
