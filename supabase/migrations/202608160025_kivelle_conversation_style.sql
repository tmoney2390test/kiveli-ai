begin;

alter table public.together_profiles
  add column if not exists conversation_preferences jsonb not null
  default '{"responseStyle":"texting"}'::jsonb;

update public.together_profiles
set conversation_preferences = '{"responseStyle":"texting"}'::jsonb
where conversation_preferences is null
   or jsonb_typeof(conversation_preferences) <> 'object'
   or conversation_preferences->>'responseStyle' not in ('texting','paragraph');

alter table public.together_profiles
  drop constraint if exists together_profiles_conversation_style_check;

alter table public.together_profiles
  add constraint together_profiles_conversation_style_check
  check (conversation_preferences->>'responseStyle' in ('texting','paragraph'));

comment on column public.together_profiles.conversation_preferences is
  'Account-level conversation expression preferences. Response style changes cadence and density only.';

commit;
