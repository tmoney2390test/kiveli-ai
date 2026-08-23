begin;
select plan(5);

select ok(
  exists(select 1 from public.together_locations where slug='chloe-loft' and location_type='residence'),
  'Chloe has a canonical residence'
);

select ok(
  exists(select 1 from public.together_locations where slug='chloe-design-studio' and category='work'),
  'Chloe has a canonical design studio'
);

select is(
  (select count(*)::integer
   from public.together_character_world_presence presence
   join public.together_locations home on home.id=presence.home_location_id
   where presence.character_version_id='13000000-0000-4000-8000-000000000002'
     and presence.world_id='10000000-0000-4000-8000-000000000001'
     and home.world_id=presence.world_id
     and home.slug<>'maya-apartment'),
  1,
  'Chloe City Life presence uses a Juniper Home anchor rather than Maya apartment'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates
   where character_version_id='13000000-0000-4000-8000-000000000002'
     and activity='offline for the night'
     and location_id='11000000-0000-4000-8000-000000000002'),
  0,
  'Chloe overnight schedule no longer points at Maya apartment'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates
   where character_version_id='13000000-0000-4000-8000-000000000002'
     and activity='working through a design sprint'
     and location_id='11000000-0000-4000-8000-000000000006'),
  0,
  'Chloe work schedule no longer points at Maya photography studio'
);

select * from finish();
rollback;
