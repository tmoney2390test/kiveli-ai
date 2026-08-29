begin;
select plan(5);

select is(
  (
    select count(*)::integer
    from public.together_character_templates template
    left join public.together_character_voice_profiles profile
      on profile.character_template_id=template.id and profile.active
    where template.creator_id is null
      and template.published
      and template.can_be_selected
      and template.lifecycle_status='published'
      and template.visibility in('public','unlisted')
      and profile.id is null
  ),
  0,
  'every published selectable companion has an active voice profile'
);

select is(
  (
    select count(*)::integer
    from public.together_character_templates template
    join public.together_character_voice_profiles profile on profile.character_template_id=template.id
    where template.creator_id is null
      and template.published
      and template.can_be_selected
      and (
        not profile.active
        or nullif(profile.voice_key,'') is null
        or nullif(profile.provider_mappings->>'xai','') is null
      )
  ),
  0,
  'published voice profiles are active and mapped to xAI'
);

select has_trigger(
  'public',
  'together_character_templates',
  'together_character_templates_voice_profile',
  'template publication maintains its voice profile'
);

select has_trigger(
  'public',
  'together_character_versions',
  'together_character_versions_voice_profile',
  'published version changes maintain voice identity'
);

select lives_ok(
  $$select public.kivelle_upsert_character_voice_profile(id) from public.together_character_templates where published and can_be_selected limit 1$$,
  'voice profile maintenance is idempotent'
);

select * from finish();
rollback;
