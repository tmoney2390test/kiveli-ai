begin;
select plan(4);

select is(
  (select access_type from public.together_worlds where slug='calders-run'),
  'subscription',
  'Calder''s Run is a subscription world'
);
select is(
  (select access_type from public.together_worlds where slug='vespormoor'),
  'subscription',
  'Vespormoor is a subscription world'
);
select ok(
  (select coalesce((metadata->>'subscriber_early_access')::boolean,false) from public.together_worlds where slug='calders-run'),
  'Calder''s Run is marked as subscriber early access'
);
select ok(
  (select coalesce((metadata->>'subscriber_early_access')::boolean,false) from public.together_worlds where slug='vespormoor'),
  'Vespormoor is marked as subscriber early access'
);

select * from finish();
rollback;
