begin;

-- Life-event simulation keys became required after several older transactional
-- writers had already shipped. Keep the database boundary safe for those
-- writers while assigning a stable key to every shared-plan artifact.
create or replace function public.kivelle_fill_life_event_simulation_key()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if nullif(btrim(new.simulation_key),'') is not null then
    return new;
  end if;

  if new.shared_plan_id is not null then
    new.simulation_key := 'shared-plan:'||new.shared_plan_id::text||':'
      ||coalesce(nullif(btrim(new.event_type),''),'event');
  else
    new.simulation_key := 'life-event:'||new.id::text;
  end if;

  return new;
end;
$$;

drop trigger if exists together_life_events_fill_simulation_key
  on public.together_life_events;
create trigger together_life_events_fill_simulation_key
  before insert on public.together_life_events
  for each row execute function public.kivelle_fill_life_event_simulation_key();

comment on function public.kivelle_fill_life_event_simulation_key() is
  'Compatibility guard that supplies deterministic shared-plan simulation keys before the NOT NULL constraint is checked.';

revoke all on function public.kivelle_fill_life_event_simulation_key()
  from public,anon,authenticated;
grant execute on function public.kivelle_fill_life_event_simulation_key()
  to service_role;

commit;
