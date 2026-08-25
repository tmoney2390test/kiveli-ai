begin;

-- Mirelle and Vivienne remain publicly described through Vespormoor's subtle
-- long-lived Veiled vocabulary. Privately, however, neither is uncertain about
-- her own nature: both consciously know that she is a vampire.
with vampire_identity(slug,awareness) as(values
  ('mirelle-voss','Mirelle knows without doubt that she is a vampire. Her long life and nocturnal rhythm are parts of her own lived identity, not rumors she has heard about herself.'),
  ('vivienne-blackwood','Vivienne knows without doubt that she is a vampire. Her long life and nocturnal rhythm are parts of her own lived identity, not old-family speculation.')
)
update public.together_character_versions version
set character_bible=jsonb_set(
      coalesce(version.character_bible,'{}'::jsonb),
      '{selfKnowledge}',
      jsonb_build_object(
        'nature','vampire',
        'certainty','absolute',
        'awareness',identity.awareness,
        'disclosure','This is private self-knowledge. Secrecy may govern what she reveals, but she must never internally deny, forget, or treat her vampire nature as uncertain.'
      ),
      true
    ),
    updated_at=now()
from public.together_character_templates template
join vampire_identity identity on identity.slug=template.slug
where version.character_template_id=template.id
  and version.version=template.current_published_version;

do $$
declare
  aware_count integer;
  altered_public_count integer;
begin
  select count(*) into aware_count
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('mirelle-voss','vivienne-blackwood')
    and version.version=template.current_published_version
    and version.character_bible->'selfKnowledge'->>'nature'='vampire'
    and version.character_bible->'selfKnowledge'->>'certainty'='absolute';

  select count(*) into altered_public_count
  from public.together_character_templates template
  where template.slug in('mirelle-voss','vivienne-blackwood')
    and template.discovery_metadata->>'classification'<>'long_lived_veiled';

  if aware_count<>2 or altered_public_count<>0 then
    raise exception 'Vampire self-knowledge validation failed: aware %, public classifications altered %',
      aware_count,altered_public_count;
  end if;
end $$;

commit;
