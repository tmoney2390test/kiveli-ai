-- Server-owned preference foundation. The client cannot escalate provider capability.
alter table public.together_profiles
  add column if not exists content_preferences jsonb not null default '{"contentMode":"standard","romanceEnabled":true,"matureContentEnabled":false,"explicitContentEnabled":false,"suggestiveMediaEnabled":false,"nudityMediaEnabled":false,"explicitMediaEnabled":false}'::jsonb;

alter table public.together_character_versions
  add column if not exists content_boundaries jsonb not null default '{"adult_only":true,"allows_romance":true,"allows_mature":false,"allows_explicit":false}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'together_character_templates_adult_age'
      and conrelid = 'public.together_character_templates'::regclass
  ) then
    alter table public.together_character_templates
      add constraint together_character_templates_adult_age check(age >= 18) not valid;
  end if;
end $$;
alter table public.together_character_templates validate constraint together_character_templates_adult_age;

comment on column public.together_profiles.content_preferences is 'Account-level content preferences. Server capability routing and age eligibility always take precedence.';
