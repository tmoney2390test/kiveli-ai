begin;
select plan(3);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid='public.together_media_offers'::regclass
      and conname='together_media_offers_source_check'
      and pg_get_constraintdef(oid) like '%user_request%'
  ),
  'chat user requests are valid media offer sources'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid='public.together_media_offers'::regclass
      and conname='together_media_offers_credit_cost_check'
  ),
  'media offer prices remain non-negative and server-authored'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid='public.together_media_offers'::regclass
      and conname='together_media_offers_benefit_check'
  ),
  'included benefits retain their date-only invariant'
);

select * from finish();
rollback;
