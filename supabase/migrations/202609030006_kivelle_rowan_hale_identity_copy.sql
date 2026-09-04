begin;

-- Rowan's visual, voice, and pronoun identity was corrected previously, but
-- the original masculine biography remained in profile and prompt context.
-- Keep every public and model-facing identity field in agreement.
update public.together_character_templates
set biography='A watchful Morrow Vale ranger whose heightened senses make her exceptional in the forest and cautious in crowded rooms. Direct, protective, and dryly funny, Rowan trusts changes in the woods before she trusts easy explanations.',
    discovery_metadata=coalesce(discovery_metadata,'{}'::jsonb)||jsonb_build_object(
      'gender','woman',
      'pronouns','she/her',
      'summary','A watchful Morrow Vale ranger whose heightened senses make her exceptional in the forest and cautious in crowded rooms. Direct, protective, and dryly funny, Rowan trusts changes in the woods before she trusts easy explanations.',
      'identityCopyCorrectedAt',now(),
      'identityCopyCorrectionSource','rowan_hale_identity_copy'
    ),
    updated_at=now()
where slug='rowan-hale';

update public.together_character_versions version
set pronouns='she/her',
    appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
      'gender','woman',
      'canonicalDescription','A photorealistic adult white Vespormoor woman with weathered fair skin, dark auburn hair worn in a practical braid, green eyes, an athletic build, and contemporary ranger clothing.'
    ),
    visual_identity=coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object(
      'gender','woman',
      'canonicalDescription','A photorealistic adult white Vespormoor woman with weathered fair skin, dark auburn hair worn in a practical braid, green eyes, an athletic build, and contemporary ranger clothing.'
    ),
    character_bible=coalesce(version.character_bible,'{}'::jsonb)||jsonb_build_object(
      'gender','woman',
      'pronouns','she/her',
      'appearance','A photorealistic adult white Vespormoor woman with weathered fair skin, dark auburn hair worn in a practical braid, green eyes, an athletic build, and contemporary ranger clothing.'
    ),
    updated_at=now()
from public.together_character_templates template
where version.character_template_id=template.id and template.slug='rowan-hale';

update public.together_character_voice_profiles profile
set characteristics=coalesce(profile.characteristics,'{}'::jsonb)||jsonb_build_object('gender','woman'),
    updated_at=now()
from public.together_character_templates template
where profile.character_template_id=template.id and template.slug='rowan-hale';

do $$
begin
  if not exists(
    select 1 from public.together_character_templates template
    join public.together_character_versions version
      on version.character_template_id=template.id
     and version.version=template.current_published_version
    where template.slug='rowan-hale'
      and template.discovery_metadata->>'gender'='woman'
      and template.discovery_metadata->>'pronouns'='she/her'
      and version.pronouns='she/her'
      and version.appearance_config->>'gender'='woman'
      and version.visual_identity->>'gender'='woman'
      and lower(template.biography) !~ '\m(he|him|his)\M'
      and lower(template.discovery_metadata->>'summary') !~ '\m(he|him|his)\M'
  ) then
    raise exception 'Rowan Hale identity copy did not converge';
  end if;
end $$;

commit;
