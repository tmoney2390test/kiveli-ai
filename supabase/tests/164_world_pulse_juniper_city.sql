begin;
select plan(8);

select is((select count(*)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and template.active
    and coalesce(template.metadata->>'pulseTier', 'routine') = 'routine'), 200,
  'Juniper City has 200 active resident incidents');
select is((select count(distinct template.scheduling_rank)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and template.active
    and coalesce(template.metadata->>'pulseTier', 'routine') = 'routine'
    and template.scheduling_rank between 0 and 199), 200,
  'Juniper routine incidents occupy the 200 stable rotation ranks');
select is((select count(*)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and template.active
    and template.metadata->>'pulseTier' = 'major'), 15,
  'Juniper City has fifteen active citywide incidents');
select is((select count(distinct template.scheduling_rank)::integer from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and template.active
    and template.metadata->>'pulseTier' = 'major'
    and template.scheduling_rank between 200 and 214), 15,
  'Juniper major incidents occupy fifteen separate rotation ranks');
select ok((select count(*) = 15 from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and template.active
    and template.metadata->>'pulseTier' = 'major' and template.cooldown_days >= 60),
  'Every Juniper major incident requires at least sixty days of cooldown');
select ok(not exists (select 1 from public.together_world_pulse_templates template
  join public.together_worlds world on world.id = template.world_id
  where world.slug = 'juniper-city' and 'review-only' = any(template.tags)),
  'No Juniper incident retains the editorial hold tag');
select ok((select public.kivelle_world_pulse_catalog_ready(world.id)
  from public.together_worlds world where world.slug = 'juniper-city'),
  'Juniper resident catalog satisfies database readiness checks');
select ok((select count(*) = 1 from public.together_world_pulse_settings setting
  join public.together_worlds world on world.id = setting.world_id
  where world.slug = 'juniper-city'),
  'Juniper has a dedicated rollout setting');

select * from finish();
rollback;
