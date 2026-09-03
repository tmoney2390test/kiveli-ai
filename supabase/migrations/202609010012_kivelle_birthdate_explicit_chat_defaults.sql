begin;

alter table public.together_profiles
  add column if not exists date_of_birth date;

comment on column public.together_profiles.date_of_birth is
  'Private self-declared birthdate used for the replaceable 18+ eligibility layer. Never returned in client snapshots.';

-- Existing Kivelle accounts already completed the former 18+ confirmation.
-- Preserve that decision without inventing a birthdate; all new accounts use
-- the birthdate flow and store self_declared_dob_v2.
update public.together_profiles
set adult_eligible_at=coalesce(adult_eligible_at,age_verified_at),
    adult_eligibility_method=coalesce(adult_eligibility_method,'legacy_age_confirmation_v1'),
    content_preferences=jsonb_set(coalesce(content_preferences,'{}'::jsonb),'{contentMode}','"explicit"'::jsonb,true),
    updated_at=now()
where age_verified_at is not null;

-- Explicit is the default for adult website chats. Users can lower an
-- individual conversation from its chat settings; native requests are still
-- projected and routed through the safe server path.
update public.together_conversations conversation
set metadata=jsonb_set(
      coalesce(conversation.metadata,'{}'::jsonb),
      '{chatPreferences}',
      coalesce(conversation.metadata->'chatPreferences','{}'::jsonb)||'{"contentMode":"explicit"}'::jsonb,
      true
    ),
    updated_at=now()
where exists(
  select 1 from public.together_profiles profile
  where profile.user_id=conversation.user_id
    and profile.adult_eligible_at is not null
);

alter table public.together_web_adult_sessions
  alter column adult_mode_enabled set default true;

update public.together_web_adult_sessions
set adult_mode_enabled=true,
    enabled_at=coalesce(enabled_at,now()),
    updated_at=now()
where revoked_at is null and expires_at>now();

commit;
