begin;
select plan(6);

select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='together_messages_daily_user_allowance_idx'),
  'Daily free-message checks have a user/day-compatible partial index'
);

select is(
  (
    select count(*)
    from public.together_character_voice_profiles profile
    where lower(coalesce(profile.characteristics->>'gender','')) in('female','woman','women','girl','she/her')
      and lower(coalesce(profile.provider_mappings->>'xai','')) in('sal','leo','rex')
  ),
  0::bigint,
  'Women never retain a masculine or neutral xAI built-in as their default voice'
);

select lives_ok(
  $$update public.together_character_voice_profiles profile
    set provider_mappings=profile.provider_mappings||jsonb_build_object('xai','sal')
    from public.together_character_templates template
    where template.id=profile.character_template_id and template.slug='queen-maerra-vaelorian'$$,
  'Future voice-profile writes pass through the normalization trigger'
);

select is(
  (
    select count(*)
    from public.together_character_voice_profiles profile
    join public.together_character_templates template on template.id=profile.character_template_id
    where template.slug='queen-maerra-vaelorian'
  ),
  1::bigint,
  'Queen Maerra has exactly one voice profile'
);

select ok(
  not exists(
    select 1
    from public.together_character_voice_profiles profile
    join public.together_character_templates template on template.id=profile.character_template_id
    where template.slug='queen-maerra-vaelorian'
      and lower(coalesce(profile.provider_mappings->>'xai','')) not in('eve','ara')
  ),
  'Queen Maerra resolves to a feminine default voice'
);

select is(
  (
    select count(*)
    from public.together_character_voice_profiles profile
    where lower(coalesce(profile.characteristics->>'gender','')) in('male','man','men','boy','he/him')
      and lower(coalesce(profile.provider_mappings->>'xai','')) in('sal','eve','ara')
  ),
  0::bigint,
  'Men never retain a feminine or neutral xAI built-in as their default voice'
);

select * from finish();
rollback;
