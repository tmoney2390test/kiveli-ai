begin;
select plan(8);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000008'::uuid),
  48,
  'Port Vervelle has four new properties and its existing Hôtel Celeste'
);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000008'::uuid and slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste') and category='hotel' and location_type='residence' and metadata->>'lodging'='true'),
  5,
  'The five-property accommodation ladder is classified as lodging'
);

select ok(not exists(
  select 1 from(values
    ('locanda-vela','porto-vecchio'),
    ('palazzo-sereno','piazza-aurelia'),
    ('hotel-coralline','marina-solana'),
    ('casa-livia','bellavista'),
    ('hotel-celeste','capo-vervelle')
  ) expected(place_slug,district_slug)
  left join public.together_locations place on place.world_id='10000000-0000-4000-8000-000000000008'::uuid and place.slug=expected.place_slug
  left join public.together_locations district on district.id=place.parent_location_id
  where district.slug is distinct from expected.district_slug
),'Every lodging property belongs to its authored district');

select ok(not exists(
  select 1 from(values
    ('locanda-vela',16),('palazzo-sereno',24),('hotel-coralline',52),('casa-livia',9)
  ) expected(slug,rooms)
  left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000008'::uuid and location.slug=expected.slug
  where (location.metadata->>'roomCount')::integer is distinct from expected.rooms
),'The four authored room counts are retained');

select ok(not exists(
  select 1 from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000008'::uuid
    and slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste')
    and(canonical_lore->>'version'<>'2' or canonical_lore->>'authored'<>'true' or jsonb_array_length(canonical_lore->'signatureDetails')<3 or jsonb_array_length(canonical_lore->'storySeeds')<3)
),'Every lodging property has authored v2 location lore');

select ok(not exists(
  select 1
  from public.together_locations location
  cross join lateral jsonb_array_elements_text(location.canonical_lore->'nearbyLocationSlugs') nearby(slug)
  left join public.together_locations target on target.world_id=location.world_id and target.slug=nearby.slug
  where location.world_id='10000000-0000-4000-8000-000000000008'::uuid
    and location.slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste')
    and target.id is null
),'Every lodging nearby-location reference resolves');

select is(
  (select metadata->>'lodgingCount' from public.together_worlds where id='10000000-0000-4000-8000-000000000008'::uuid),
  '5',
  'Port Vervelle advertises five lodging properties'
);

select is(
  (select parent.slug from public.together_locations spa join public.together_locations parent on parent.id=spa.parent_location_id where spa.world_id='10000000-0000-4000-8000-000000000008'::uuid and spa.slug='celeste-spa'),
  'hotel-celeste',
  'Celeste Spa remains nested beneath Hôtel Celeste'
);

select * from finish();
rollback;
