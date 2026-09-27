-- The public discovery summary can retain the raw seed introduction even when
-- biography was editorially revised. Replace only summaries that still end in
-- the authored plot hook; preserve independently edited summaries.
begin;

update public.together_character_templates as template
set discovery_metadata=jsonb_set(
      template.discovery_metadata,
      '{summary}',
      to_jsonb(template.biography),
      true
    ),
    updated_at=now()
where template.creator_id is null
  and template.discovery_metadata->>'residentWorldSlug'='eos-meridian'
  and nullif(trim(template.discovery_metadata->>'storyHook'),'') is not null
  and nullif(trim(template.discovery_metadata->>'summary'),'') is not null
  and right(
    trim(template.discovery_metadata->>'summary'),
    length(trim(template.discovery_metadata->>'storyHook'))
  )=trim(template.discovery_metadata->>'storyHook')
  and template.discovery_metadata->>'summary' is distinct from template.biography;

commit;
