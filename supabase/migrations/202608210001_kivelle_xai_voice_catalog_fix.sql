begin;

-- The initial xAI voice rollout was prepared against a pre-release catalog.
-- Replace only those retired seeded IDs (and any missing mapping) with the
-- current production built-ins. Arbitrary custom xAI voice IDs are preserved.
update public.together_character_voice_profiles as profile
set provider_mappings=jsonb_set(
      coalesce(profile.provider_mappings,'{}'::jsonb),
      '{xai}',
      to_jsonb(
        case
          when lower(coalesce(version.pronouns,'')) ~ '(^|[^a-z])(he|him|his)([^a-z]|$)'
            or lower(coalesce(version.visual_identity->>'gender','')) in ('male','man')
          then (array['leo','rex','sal'])[1+((hashtext(profile.voice_key)::bigint&2147483647)%3)]
          else (array['eve','ara','sal'])[1+((hashtext(profile.voice_key)::bigint&2147483647)%3)]
        end
      ),
      true
    ),
    metadata=coalesce(profile.metadata,'{}'::jsonb)||jsonb_build_object(
      'xaiMappingSource','production_catalog_2026_08',
      'xaiMappingUpdatedAt',now()
    ),
    updated_at=now()
from public.together_character_templates as template
join lateral (
  select candidate.pronouns,candidate.visual_identity
  from public.together_character_versions as candidate
  where candidate.character_template_id=template.id
  order by
    (candidate.version=template.current_published_version) desc,
    candidate.published_at desc nulls last,
    candidate.version desc
  limit 1
) as version on true
where template.id=profile.character_template_id
  and (
    not coalesce(profile.provider_mappings,'{}'::jsonb) ? 'xai'
    or lower(coalesce(profile.provider_mappings->>'xai','')) in (
      'carina','luna','iris','celeste','aurora','liora','sirius','lumen','ursa'
    )
  );

commit;
