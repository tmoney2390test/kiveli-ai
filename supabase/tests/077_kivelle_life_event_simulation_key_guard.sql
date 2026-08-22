begin;
select plan(4);

select has_function(
  'public','kivelle_fill_life_event_simulation_key',array[]::text[],
  'Life events have a simulation-key compatibility guard'
);

select trigger_is(
  'public','together_life_events','together_life_events_fill_simulation_key',
  'public','kivelle_fill_life_event_simulation_key',
  'The simulation-key guard runs at the life-event database boundary'
);

create temporary table life_event_simulation_key_probe(
  id uuid not null default gen_random_uuid(),
  event_type text not null,
  shared_plan_id uuid,
  simulation_key text not null
);
create trigger life_event_simulation_key_probe_guard
  before insert on life_event_simulation_key_probe
  for each row execute function public.kivelle_fill_life_event_simulation_key();

insert into life_event_simulation_key_probe(event_type,shared_plan_id)
values('shared_plan_completed','11111111-1111-4111-8111-111111111111');

select is(
  (select simulation_key from life_event_simulation_key_probe where shared_plan_id is not null),
  'shared-plan:11111111-1111-4111-8111-111111111111:shared_plan_completed',
  'Shared-plan completion receives a stable deterministic key'
);

insert into life_event_simulation_key_probe(event_type,simulation_key)
values('introduction','authored:introduction:probe');

select is(
  (select simulation_key from life_event_simulation_key_probe where shared_plan_id is null),
  'authored:introduction:probe',
  'Explicit authored simulation keys are preserved'
);

select * from finish();
rollback;
