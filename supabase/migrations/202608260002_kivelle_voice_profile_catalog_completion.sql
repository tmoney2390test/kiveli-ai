begin;

-- Voice identity is part of a published companion, not optional runtime
-- decoration. Older catalog packs were inserted after the original multimodal
-- backfill and could therefore fall through to the deterministic runtime
-- fallback without ever receiving a persisted profile.
create or replace function public.kivelle_upsert_character_voice_profile(
  p_character_template_id uuid
) returns void
language sql
security definer
set search_path=public,extensions
as $$
  insert into public.together_character_voice_profiles(
    character_template_id,
    voice_key,
    characteristics,
    provider_mappings,
    metadata,
    active,
    updated_at
  )
  select
    template.id,
    coalesce(nullif(template.public_handle,''),nullif(template.slug,''),template.id::text)||'-default',
    jsonb_strip_nulls(jsonb_build_object(
      'warmth',coalesce(version.personality_config->'warmth',version.personality_config->'empathetic',to_jsonb(0.6)),
      'energy',coalesce(version.personality_config->'energy',version.personality_config->'social_energy',version.personality_config->'socialEnergy',to_jsonb(0.55)),
      'pace',coalesce(version.communication_style->'pace',to_jsonb(0.5)),
      'expressiveness',coalesce(version.personality_config->'expressiveness',version.personality_config->'playful',version.personality_config->'spontaneity',to_jsonb(0.55)),
      'softness',coalesce(version.personality_config->'softness',version.personality_config->'reserved',to_jsonb(0.45)),
      'gender',coalesce(version.visual_identity->'gender',version.appearance_config->'gender')
    )),
    jsonb_build_object(
      'xai',coalesce(
        nullif(version.voice_config->'providerMappings'->>'xai',''),
        case
          when lower(coalesce(version.pronouns,'')) ~ '(^|[^a-z])(he|him|his)([^a-z]|$)'
            or lower(coalesce(version.visual_identity->>'gender',version.appearance_config->>'gender','')) in ('male','man')
            then (array['leo','rex','sal'])[1+((hashtext(coalesce(nullif(template.public_handle,''),template.slug,template.id::text)||'-default')::bigint&2147483647)%3)]
          else (array['eve','ara','sal'])[1+((hashtext(coalesce(nullif(template.public_handle,''),template.slug,template.id::text)||'-default')::bigint&2147483647)%3)]
        end
      )
    ),
    jsonb_build_object(
      'source','catalog_profile_invariant_v1',
      'derivedFromVersionId',version.id,
      'stableMapping',true
    ),
    true,
    now()
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  where template.id=p_character_template_id
    and template.can_be_selected
    and (
      (
        template.creator_id is null
        and template.published
        and template.lifecycle_status='published'
        and template.visibility in('public','unlisted')
      )
      or (
        template.creator_id is not null
        and template.lifecycle_status in('ready','published')
      )
    )
  on conflict(character_template_id) do update set
    characteristics=excluded.characteristics||coalesce(together_character_voice_profiles.characteristics,'{}'::jsonb),
    provider_mappings=excluded.provider_mappings||coalesce(together_character_voice_profiles.provider_mappings,'{}'::jsonb),
    metadata=coalesce(together_character_voice_profiles.metadata,'{}'::jsonb)||excluded.metadata,
    active=true,
    updated_at=now();
$$;

revoke all on function public.kivelle_upsert_character_voice_profile(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_upsert_character_voice_profile(uuid) to service_role;

create or replace function public.kivelle_character_voice_profile_template_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
begin
  perform public.kivelle_upsert_character_voice_profile(new.id);
  return new;
end;
$$;

create or replace function public.kivelle_character_voice_profile_version_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
begin
  perform public.kivelle_upsert_character_voice_profile(new.character_template_id);
  return new;
end;
$$;

revoke all on function public.kivelle_character_voice_profile_template_trigger() from public,anon,authenticated;
revoke all on function public.kivelle_character_voice_profile_version_trigger() from public,anon,authenticated;

drop trigger if exists together_character_templates_voice_profile on public.together_character_templates;
create trigger together_character_templates_voice_profile
after insert or update of current_published_version,published,can_be_selected,lifecycle_status,visibility
on public.together_character_templates
for each row execute function public.kivelle_character_voice_profile_template_trigger();

drop trigger if exists together_character_versions_voice_profile on public.together_character_versions;
create trigger together_character_versions_voice_profile
after insert or update of version,personality_config,communication_style,voice_config,pronouns,appearance_config,visual_identity
on public.together_character_versions
for each row execute function public.kivelle_character_voice_profile_version_trigger();

select public.kivelle_upsert_character_voice_profile(template.id)
from public.together_character_templates template
where template.can_be_selected
  and (
    (
      template.creator_id is null
      and template.published
      and template.lifecycle_status='published'
      and template.visibility in('public','unlisted')
    )
    or (
      template.creator_id is not null
      and template.lifecycle_status in('ready','published')
    )
  );

comment on function public.kivelle_upsert_character_voice_profile(uuid) is
  'Maintains one stable provider-neutral voice identity for every selectable published or ready companion while preserving authored/custom mappings.';

commit;
