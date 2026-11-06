begin;
select plan(7);

select is((select count(*)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'eos-meridian' and template.active
    and template.metadata->>'pulseTier' = 'major'), 15,
  'Eos has fifteen active colony-wide incidents');
select is((select count(distinct template.scheduling_rank)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'eos-meridian' and template.active
    and template.metadata->>'pulseTier' = 'major' and template.scheduling_rank between 200 and 214), 15,
  'Major incidents occupy all fifteen separate rotation ranks');
select ok((select count(*) = 15 from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'eos-meridian' and template.active
    and template.metadata->>'pulseTier' = 'major' and template.cooldown_days >= 60),
  'Every major incident requires at least sixty days of cooldown');
select ok(not has_function_privilege('authenticated',
  'public.kivelle_world_pulse_reserve_major_world(uuid,date,integer)', 'EXECUTE'),
  'Clients cannot reserve colony-wide incidents');
select ok(has_function_privilege('service_role',
  'public.kivelle_world_pulse_reserve_major_world(uuid,date,integer)', 'EXECUTE'),
  'Service role can reserve colony-wide incidents');
select ok(not has_function_privilege('authenticated',
  'public.kivelle_world_pulse_major_operational_audit()', 'EXECUTE'),
  'Only operators can inspect the major schedule');
select ok(has_function_privilege('service_role',
  'public.kivelle_world_pulse_major_operational_audit()', 'EXECUTE'),
  'Service role can inspect the major schedule');

select * from finish();
rollback;
