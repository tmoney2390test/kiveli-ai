begin;

-- Production contained an earlier version of the commitment columns where
-- `companion_state` could be NOT NULL without its default being retained.
-- Keep the canonical defaults at the database boundary so an older Edge
-- Function bundle can never turn a valid user confirmation into a 500.
alter table public.together_shared_plans
  alter column time_precision set default 'exact',
  alter column participation_mode set default 'live',
  alter column grace_minutes set default 30,
  alter column companion_state set default 'expected';

create or replace function public.kivelle_normalize_shared_plan_commitment_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_world_timezone text;
  resolved_user_timezone text;
begin
  new.time_precision := coalesce(nullif(new.time_precision, ''), 'exact');
  new.participation_mode := coalesce(nullif(new.participation_mode, ''), 'live');
  new.grace_minutes := coalesce(new.grace_minutes, 30);
  new.companion_state := coalesce(nullif(new.companion_state, ''), 'expected');

  if new.world_timezone is null and new.world_id is not null then
    select timezone
      into resolved_world_timezone
      from public.together_worlds
     where id = new.world_id;
    new.world_timezone := coalesce(resolved_world_timezone, 'UTC');
  end if;

  if new.user_timezone is null then
    select experience_timezone
      into resolved_user_timezone
      from public.together_profiles
     where user_id = new.user_id;
    new.user_timezone := coalesce(resolved_user_timezone, 'UTC');
  end if;

  if new.starts_at is not null and new.ends_at is not null then
    new.window_starts_at := coalesce(new.window_starts_at, new.starts_at);
    new.window_ends_at := coalesce(new.window_ends_at, new.ends_at);
    new.grace_ends_at := coalesce(
      new.grace_ends_at,
      new.starts_at + make_interval(mins => new.grace_minutes)
    );
  end if;

  return new;
end;
$$;

-- This trigger deliberately runs after the existing place/continuity triggers
-- (Postgres orders same-timing triggers alphabetically), so it can derive a
-- correct world timezone when a write relies on canonical place resolution.
drop trigger if exists z_kivelle_shared_plan_commitment_defaults on public.together_shared_plans;
create trigger z_kivelle_shared_plan_commitment_defaults
before insert or update on public.together_shared_plans
for each row execute function public.kivelle_normalize_shared_plan_commitment_defaults();

commit;

