begin;

-- World imports previously reused conversational spice level as an explicit
-- media capability switch. Kivelle's catalog is adult-only; actual eligibility
-- remains enforced by account/session, fictional-person, consent, reference,
-- moderation, and provider gates. Keep the legacy JSON key normalized so old
-- clients and operational tools also see the universal catalog capability.
update public.together_character_versions version
set content_boundaries = coalesce(version.content_boundaries, '{}'::jsonb)
  || jsonb_build_object('allows_explicit', true)
from public.together_character_templates template
where template.id = version.character_template_id
  and template.age >= 18;

commit;
