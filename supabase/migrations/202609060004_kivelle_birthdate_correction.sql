begin;

alter table public.together_profiles
  add column if not exists birthdate_corrected_at timestamptz;

comment on column public.together_profiles.birthdate_corrected_at is
  'Server-owned timestamp recording the one self-service correction allowed after an initial birthdate is saved.';

commit;
