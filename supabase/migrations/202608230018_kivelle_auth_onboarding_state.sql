begin;

-- Before explicit age confirmation became its own onboarding stage, every
-- together_profiles row represented a completed account. Preserve those users
-- so the new router never sends established accounts back through onboarding.
update public.together_profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at, now()),
    updated_at = now()
where onboarding_completed_at is null;

comment on column public.together_profiles.age_verified_at is
  'Timestamp of the user''s explicit 18+ confirmation; authentication alone never sets this.';

comment on column public.together_profiles.onboarding_completed_at is
  'Null after explicit age confirmation until companion/world onboarding is completed or skipped.';

commit;
