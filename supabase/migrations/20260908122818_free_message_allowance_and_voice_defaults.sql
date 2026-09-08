begin;

-- The daily allowance is counted across every conversation. This partial
-- index keeps both enforcement and the bootstrap warning independent of a
-- user's lifetime message volume.
create index if not exists together_messages_daily_user_allowance_idx
  on public.together_messages(user_id,created_at desc)
  where role='user';

-- Catalog imports historically allowed the neutral Sal voice to be assigned
-- to women, which made some defaults (including Queen Maerra) sound male.
-- Normalize only xAI built-ins; an authored custom provider voice remains
-- authoritative. The trigger also protects future official and custom casts.
create or replace function public.kivelle_normalize_companion_voice_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  gender_signal text;
  xai_voice text;
  normalized_voice text;
begin
  gender_signal=lower(coalesce(new.characteristics->>'gender',new.characteristics->>'pronouns',''));
  if gender_signal='' then
    select lower(coalesce(version.visual_identity->>'gender',version.appearance_config->>'gender',version.pronouns,''))
      into gender_signal
    from public.together_character_templates template
    join lateral(
      select candidate.*
      from public.together_character_versions candidate
      where candidate.character_template_id=template.id
      order by (candidate.version=template.current_published_version) desc,candidate.published_at desc nulls last,candidate.version desc
      limit 1
    ) version on true
    where template.id=new.character_template_id;
    if coalesce(gender_signal,'')<>'' then
      new.characteristics=coalesce(new.characteristics,'{}'::jsonb)||jsonb_build_object('gender',gender_signal);
    end if;
  end if;

  xai_voice=nullif(new.provider_mappings->>'xai','');
  if gender_signal ~ '(^|[^a-z])(female|woman|women|girl|she|her)([^a-z]|$)'
     and (xai_voice is null or lower(xai_voice) in('sal','leo','rex')) then
    normalized_voice=(array['eve','ara'])[1+mod(abs(hashtext(new.voice_key)::bigint),2)];
  elsif gender_signal ~ '(^|[^a-z])(male|man|men|boy|he|him|his)([^a-z]|$)'
     and (xai_voice is null or lower(xai_voice) in('sal','eve','ara')) then
    normalized_voice=(array['leo','rex'])[1+mod(abs(hashtext(new.voice_key)::bigint),2)];
  elsif gender_signal ~ '(^|[^a-z])(neutral|nonbinary|non-binary|they|them)([^a-z]|$)'
     and (xai_voice is null or lower(xai_voice) in('eve','ara','leo','rex')) then
    normalized_voice='sal';
  end if;

  if normalized_voice is not null then
    new.provider_mappings=coalesce(new.provider_mappings,'{}'::jsonb)||jsonb_build_object('xai',normalized_voice);
    new.metadata=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('voiceDefaultNormalized','gender_v1');
  end if;
  return new;
end;
$$;

revoke all on function public.kivelle_normalize_companion_voice_profile() from public,anon,authenticated;

drop trigger if exists together_character_voice_profiles_normalize_default on public.together_character_voice_profiles;
create trigger together_character_voice_profiles_normalize_default
before insert or update of voice_key,characteristics,provider_mappings
on public.together_character_voice_profiles
for each row execute function public.kivelle_normalize_companion_voice_profile();

-- Fire the new invariant for the current catalog without touching authored
-- custom voice IDs or any user conversation setting.
update public.together_character_voice_profiles
set provider_mappings=provider_mappings
where active;

commit;
