begin;

-- Character boundaries describe authored capability, not a user's consent or
-- immediate eligibility. Runtime media policy still requires a verified-adult
-- account, an original fictional adult, enabled media preferences, romance,
-- relationship readiness, and a safe consensual request.
alter table public.together_character_versions
  alter column content_boundaries set default
  '{"adult_only":true,"allows_romance":true,"allows_suggestive":true,"allows_mature":true,"allows_explicit":true}'::jsonb;

update public.together_character_versions version
set content_boundaries=coalesce(version.content_boundaries,'{}'::jsonb)
  || jsonb_build_object(
    'adult_only',true,
    'allows_romance',true,
    'allows_suggestive',true,
    'allows_mature',true,
    'allows_explicit',true
  ),
  updated_at=now()
from public.together_character_templates template
where template.id=version.character_template_id
  and template.age>=18
  and coalesce(template.discovery_metadata->>'fictional','true')<>'false'
  and coalesce(version.character_bible->>'fictional','true')<>'false'
  and coalesce(version.visual_identity->>'fictional','true')<>'false';

comment on column public.together_character_versions.content_boundaries is
  'Authored media capability for an original fictional adult. User consent preferences, relationship readiness, automatic-generation restrictions, and safety policy remain runtime gates.';

commit;
