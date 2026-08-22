begin;
select plan(9);

select has_column('public','together_open_threads','last_followed_up_at','open threads track initiated follow-ups');
select has_column('public','together_open_threads','followup_count','open threads count initiated follow-ups');
select ok(
  exists(select 1 from pg_constraint where conname='together_character_versions_curiosity_required' and conrelid='public.together_character_versions'::regclass),
  'character versions require curiosity profiles'
);
select ok(
  exists(select 1 from pg_trigger where tgname='together_selectable_characters_require_curiosity' and tgrelid='public.together_character_templates'::regclass),
  'selectable future characters cannot bypass the curiosity contract'
);

select ok(
  not public.kivelle_valid_curiosity_profile('{}'::jsonb),
  'empty curiosity profiles are invalid'
);

select ok(
  public.kivelle_valid_curiosity_profile(public.kivelle_default_curiosity_profile('["photography"]'::jsonb,'Photographer','{"warmth":0.8}'::jsonb,'{}'::jsonb,'{}'::jsonb)),
  'default profile builder always produces a valid profile'
);

select is(
  (select count(*)::integer from public.together_character_versions where not public.kivelle_valid_curiosity_profile(character_bible#>'{voice,curiosity}')),
  0,
  'every existing character version has a valid curiosity profile'
);

select is(
  (select count(*)::integer
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id and version.version=template.current_published_version
   where template.published=true and not public.kivelle_valid_curiosity_profile(version.character_bible#>'{voice,curiosity}')),
  0,
  'every currently published character has a valid curiosity profile'
);

select is(
  (select count(distinct version.character_bible#>'{voice,curiosity}')
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id and version.version=template.current_published_version
   where template.published=true),
  (select count(*)
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id and version.version=template.current_published_version
   where template.published=true),
  'every current published companion retains a distinct curiosity profile'
);

select * from finish();
rollback;
