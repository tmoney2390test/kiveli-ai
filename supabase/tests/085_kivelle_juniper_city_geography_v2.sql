begin;
select plan(19);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null and location_type='district'),
  6,
  'Juniper City has exactly six root districts'
);

select is(
  (select array_agg(slug order by sort_order) from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null),
  array['alder-district','northside','marquee-quarter','halcyon-green','riverside','civic-commons'],
  'Juniper root districts use the canonical order and slugs'
);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid),
  53,
  'Juniper City preserves all prior rows while adding the geography-v2 catalog'
);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and metadata->>'geographyRole'='destination'),
  34,
  'Juniper City has exactly 34 canonical destinations beneath its districts'
);

select is(
  (select count(*)::integer from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and metadata->>'geographyRole'='supporting' and metadata->>'directoryVisibility'='private'),
  13,
  'All 13 later life-engine and private-home rows remain preserved as hidden supporting locations'
);

select ok(not exists(
  select 1 from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null and location_type<>'district'
),'No normal Juniper destination is left at the world root');

select ok(not exists(
  select 1 from public.together_locations child
  join public.together_locations parent on parent.id=child.parent_location_id
  where child.world_id='10000000-0000-4000-8000-000000000001'::uuid and parent.world_id<>child.world_id
),'Every Juniper parent and child belongs to the same world');

select ok(not exists(
  with recursive hierarchy as(
    select id,parent_location_id,array[id] path,false cycle from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid
    union all
    select hierarchy.id,parent.parent_location_id,hierarchy.path||parent.id,parent.id=any(hierarchy.path)
    from hierarchy join public.together_locations parent on parent.id=hierarchy.parent_location_id where not hierarchy.cycle
  ) select 1 from hierarchy where cycle
),'Juniper hierarchy has no cycles');

select ok(not exists(
  with recursive expected as(
    select id,0::smallint expected_depth from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null
    union all
    select child.id,(expected.expected_depth+1)::smallint from expected join public.together_locations child on child.parent_location_id=expected.id
  ) select 1 from public.together_locations location left join expected on expected.id=location.id
    where location.world_id='10000000-0000-4000-8000-000000000001'::uuid and expected.expected_depth is distinct from location.depth
),'Every Juniper depth matches its hierarchy');

select ok(not exists(
  select 1 from public.together_locations location
  cross join lateral jsonb_array_elements_text(coalesce(location.canonical_lore->'nearbyLocationSlugs','[]'::jsonb)) nearby(slug)
  left join public.together_locations target on target.world_id=location.world_id and target.slug=nearby.slug
  where location.world_id='10000000-0000-4000-8000-000000000001'::uuid and target.id is null
),'Every Juniper nearby-location slug resolves inside Juniper City');

select ok(not exists(
  select 1 from(values
    ('11000000-0000-4000-8000-000000000001'::uuid,'juniper-cafe'),('11000000-0000-4000-8000-000000000002'::uuid,'maya-apartment'),
    ('11000000-0000-4000-8000-000000000003'::uuid,'skyline-rooftop'),('11000000-0000-4000-8000-000000000004'::uuid,'northside-bar'),
    ('11000000-0000-4000-8000-000000000005'::uuid,'riverwalk'),('11000000-0000-4000-8000-000000000006'::uuid,'photography-studio'),
    ('11000000-0000-4000-8000-000000000007'::uuid,'ember-and-rye'),('11000000-0000-4000-8000-000000000008'::uuid,'sora-table'),
    ('11000000-0000-4000-8000-000000000009'::uuid,'taqueria-lumen'),('11000000-0000-4000-8000-000000000010'::uuid,'velvet-hour'),
    ('11000000-0000-4000-8000-000000000011'::uuid,'lantern-dive'),('11000000-0000-4000-8000-000000000012'::uuid,'moss-and-crumb'),
    ('11000000-0000-4000-8000-000000000013'::uuid,'marquee-cinema'),('11000000-0000-4000-8000-000000000014'::uuid,'static-house'),
    ('11000000-0000-4000-8000-000000000015'::uuid,'lucky-note'),('11000000-0000-4000-8000-000000000016'::uuid,'side-street-comedy'),
    ('11000000-0000-4000-8000-000000000017'::uuid,'pixel-and-pint'),('11000000-0000-4000-8000-000000000018'::uuid,'glassline-gallery'),
    ('11000000-0000-4000-8000-000000000019'::uuid,'paper-trail'),('11000000-0000-4000-8000-000000000020'::uuid,'needles-and-notes'),
    ('11000000-0000-4000-8000-000000000021'::uuid,'meridian-fitness'),('11000000-0000-4000-8000-000000000022'::uuid,'common-market'),
    ('11000000-0000-4000-8000-000000000023'::uuid,'alder-district'),('11000000-0000-4000-8000-000000000024'::uuid,'halcyon-park'),
    ('11000000-0000-4000-8000-000000000025'::uuid,'lark-botanical-garden'),
    ('11000000-0000-4000-8000-000000000026'::uuid,'chloe-loft'),('11000000-0000-4000-8000-000000000027'::uuid,'chloe-design-studio'),
    ('11000000-0000-4000-8000-000000000028'::uuid,'juniper-civic-arena'),('11000000-0000-4000-8000-000000000029'::uuid,'juniper-general-hospital'),
    ('11000000-0000-4000-8000-000000000030'::uuid,'alder-elementary-school'),('11000000-0000-4000-8000-000000000031'::uuid,'mercer-row-law-offices'),
    ('11000000-0000-4000-8000-000000000032'::uuid,'alder-central-precinct'),('11000000-0000-4000-8000-000000000033'::uuid,'juniper-firehouse-14'),
    ('11000000-0000-4000-8000-000000000034'::uuid,'forgeworks-design-lab'),('11000000-0000-4000-8000-000000000035'::uuid,'juniper-college'),
    ('11000000-0000-4000-8000-000000000036'::uuid,'summit-climbing-hall'),('11000000-0000-4000-8000-000000000037'::uuid,'alder-lofts'),
    ('11000000-0000-4000-8000-000000000038'::uuid,'riverline-apartments'),('11000000-0000-4000-8000-000000000039'::uuid,'eastgate-flats')
  ) expected(id,slug)
  left join public.together_locations actual on actual.id=expected.id and actual.slug=expected.slug and actual.world_id='10000000-0000-4000-8000-000000000001'::uuid
  where actual.id is null
),'All 39 preexisting Juniper UUID and slug pairs are unchanged');

select is(
  (with recursive path as(
    select id,parent_location_id,name,0 level from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and slug='maya-apartment'
    union all select parent.id,parent.parent_location_id,parent.name,path.level+1 from path join public.together_locations parent on parent.id=path.parent_location_id
  ) select string_agg(name,' -> ' order by level desc) from path),
  'Riverside -> Riverhouse Apartments -> Maya''s Apartment',
  'Maya apartment resolves through Riverhouse and Riverside'
);

select is(
  (select parent.slug from public.together_locations place join public.together_locations parent on parent.id=place.parent_location_id where place.slug='juniper-civic-arena' and place.world_id='10000000-0000-4000-8000-000000000001'::uuid),
  'civic-commons',
  'Juniper Civic Arena moved to Civic Commons without a new ID'
);

select is(
  (select parent.slug from public.together_locations place join public.together_locations parent on parent.id=place.parent_location_id where place.slug='alder-house' and place.world_id='10000000-0000-4000-8000-000000000001'::uuid),
  'alder-district',
  'The Alder House belongs to Alder District'
);

select is(
  (select parent.slug from public.together_locations place join public.together_locations parent on parent.id=place.parent_location_id where place.slug='rivermark-hotel' and place.world_id='10000000-0000-4000-8000-000000000001'::uuid),
  'riverside',
  'The Rivermark belongs to Riverside'
);

select is(
  (select parent.slug from public.together_locations place join public.together_locations parent on parent.id=place.parent_location_id where place.slug='northline-motor-lodge' and place.world_id='10000000-0000-4000-8000-000000000001'::uuid),
  'northside',
  'Northline Motor Lodge belongs to Northside'
);

select ok(not exists(
  select 1 from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid
    and slug in('northside','marquee-quarter','halcyon-green','riverside','civic-commons','alder-house','northline-motor-lodge','riverhouse-apartments','riverside-landing','rivermark-hotel','juniper-central-station','juniper-medical-center','juniper-city-hall')
    and(canonical_lore->>'version'<>'2' or canonical_lore->>'authored'<>'true' or jsonb_array_length(canonical_lore->'sensoryDetails')<3 or jsonb_array_length(canonical_lore->'signatureDetails')<3 or jsonb_array_length(canonical_lore->'layout')<3)
),'Every new district and destination has authored v2 lore');

select ok(not exists(
  with recursive ancestors as(
    select id,parent_location_id,id origin_id from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and location_type<>'district'
    union all
    select parent.id,parent.parent_location_id,ancestors.origin_id from ancestors join public.together_locations parent on parent.id=ancestors.parent_location_id
  )
  select 1 from public.together_locations destination
  where destination.world_id='10000000-0000-4000-8000-000000000001'::uuid and destination.location_type<>'district'
    and not exists(select 1 from ancestors join public.together_locations district on district.id=ancestors.id where ancestors.origin_id=destination.id and district.location_type='district')
),'Every Juniper destination resolves upward to a district');

select is(
  (select default_arrival_location_id from public.together_worlds where id='10000000-0000-4000-8000-000000000001'::uuid),
  '11000000-0000-4000-8000-000000000001'::uuid,
  'Juniper Cafe remains the sensible default arrival'
);

select * from finish();
rollback;
