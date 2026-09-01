begin;

alter table public.together_user_personas
  drop constraint if exists together_user_personas_age_check;
alter table public.together_user_personas
  add constraint together_user_personas_age_check
  check(age is null or age between 18 and 120);

alter table public.together_user_personas
  drop constraint if exists together_user_personas_appearance_config_object_check;
alter table public.together_user_personas
  add constraint together_user_personas_appearance_config_object_check
  check(jsonb_typeof(appearance_config)='object');

alter table public.together_user_personas
  drop constraint if exists together_user_personas_communication_config_object_check;
alter table public.together_user_personas
  add constraint together_user_personas_communication_config_object_check
  check(jsonb_typeof(communication_config)='object');

-- A Persona represents one identity boundary and may own only one Life. This
-- also makes retried or double-tapped start requests safe at the database edge.
create unique index if not exists together_continuities_one_life_per_persona_idx
  on public.together_continuities(user_id,persona_id);

comment on index public.together_continuities_one_life_per_persona_idx is
  'Prevents duplicate Lives when Persona creation is retried concurrently.';

commit;
