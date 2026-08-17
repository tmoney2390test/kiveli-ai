begin;

alter table public.together_character_templates
  add column if not exists spice_level smallint not null default 2;

alter table public.together_character_templates
  drop constraint if exists together_character_templates_spice_level_check;
alter table public.together_character_templates
  add constraint together_character_templates_spice_level_check
  check (spice_level between 1 and 3);

comment on column public.together_character_templates.spice_level is
  'Character-authored romantic boldness/flirt intensity (1 mild, 2 flirty, 3 bold). It does not grant consent, change relationship state, or bypass safety policy.';

-- Give the published launch companions deliberate authored defaults. All future
-- characters still receive the neutral default until their creator chooses one.
update public.together_character_templates
set spice_level = case slug
  when 'sofia' then 1
  when 'riley' then 1
  when 'alex' then 1
  when 'maya' then 2
  when 'elena' then 2
  when 'harper' then 2
  when 'chloe' then 3
  when 'avery' then 3
  else spice_level
end,
updated_at = now()
where slug in ('maya','chloe','alex','sofia','avery','riley','elena','harper');

-- Creator Studio writes connection_config. Keep the template column and the
-- creator-facing setting synchronized at the database boundary so legacy and
-- current finalizers cannot drift.
create or replace function public.kivelle_sync_character_spice_level()
returns trigger
language plpgsql
set search_path=public
as $$
declare configured text;
begin
  configured := new.connection_config->>'spiceLevel';
  if tg_op = 'UPDATE'
    and new.spice_level is distinct from old.spice_level
    and new.connection_config is not distinct from old.connection_config then
    new.spice_level := greatest(1, least(3, coalesce(new.spice_level, 2)));
    new.connection_config := coalesce(new.connection_config, '{}'::jsonb)
      || jsonb_build_object('spiceLevel', new.spice_level);
  elsif configured ~ '^[1-3]$' then
    new.spice_level := configured::smallint;
  else
    new.spice_level := greatest(1, least(3, coalesce(new.spice_level, 2)));
    new.connection_config := coalesce(new.connection_config, '{}'::jsonb)
      || jsonb_build_object('spiceLevel', new.spice_level);
  end if;
  return new;
end;
$$;

drop trigger if exists together_character_templates_sync_spice on public.together_character_templates;
create trigger together_character_templates_sync_spice
before insert or update of spice_level, connection_config
on public.together_character_templates
for each row execute function public.kivelle_sync_character_spice_level();

-- Backfill creator configuration for consistent editing and future versioning.
update public.together_character_templates
set connection_config = coalesce(connection_config, '{}'::jsonb)
  || jsonb_build_object('spiceLevel', spice_level)
where connection_config->>'spiceLevel' is distinct from spice_level::text;

update public.together_creator_drafts
set connection_config = coalesce(connection_config, '{}'::jsonb)
  || jsonb_build_object('spiceLevel', 2),
  updated_at = now()
where connection_config->>'spiceLevel' is null;

commit;
