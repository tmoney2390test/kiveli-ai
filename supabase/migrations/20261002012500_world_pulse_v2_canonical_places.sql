begin;
set local search_path = public, extensions;

-- Global events may use only canonical, unowned, active locations. Existing
-- foreign keys establish the world, but they also accept private user places.
create or replace function public.kivelle_world_pulse_guard_canonical_place()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.together_locations location
    where location.id = new.location_id and location.world_id = new.world_id
      and location.owner_user_id is null and location.archived_at is null
  ) then
    raise exception 'Global Pulse location must be an active canonical place'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger together_world_pulse_template_canonical_place
  before insert or update of location_id, world_id
  on public.together_world_pulse_templates
  for each row execute function public.kivelle_world_pulse_guard_canonical_place();

create trigger together_world_pulse_occurrence_canonical_place
  before insert or update of location_id, world_id
  on public.together_world_pulse_occurrences
  for each row execute function public.kivelle_world_pulse_guard_canonical_place();

create or replace function public.kivelle_world_pulse_guard_location_privacy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.owner_user_id is not null or new.archived_at is not null)
    and exists (select 1 from public.together_world_pulse_templates template
      where template.location_id = new.id and template.active) then
    raise exception 'Deactivate global Pulse templates before privatizing or archiving this place'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger together_world_pulse_location_privacy
  before update of owner_user_id, archived_at on public.together_locations
  for each row execute function public.kivelle_world_pulse_guard_location_privacy();

revoke all on function public.kivelle_world_pulse_guard_canonical_place() from public, anon, authenticated;
revoke all on function public.kivelle_world_pulse_guard_location_privacy() from public, anon, authenticated;

commit;
