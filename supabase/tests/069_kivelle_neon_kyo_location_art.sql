begin;
select plan(4);

select is(
  (select name from public.together_worlds
   where id='10000000-0000-4000-8000-000000000009'::uuid),
  'Neon Kyo',
  'The world display name uses title case'
);

select is(
  (select metadata->>'locationPhotoStatus' from public.together_worlds
   where id='10000000-0000-4000-8000-000000000009'::uuid),
  'ready',
  'The world reports its location-photo catalog as ready'
);

select is(
  (select count(*)::integer from public.together_locations
   where world_id='10000000-0000-4000-8000-000000000009'::uuid
     and visual_asset_key=slug
     and metadata->>'photoStatus'='ready'),
  51,
  'All six districts and 45 public places map to canonical art'
);

select is(
  (select count(distinct visual_asset_key)::integer from public.together_locations
   where world_id='10000000-0000-4000-8000-000000000009'::uuid),
  51,
  'Every Neon Kyo location has its own unique visual asset key'
);

select * from finish();
rollback;
