begin;

select plan(2);

select ok(
  not exists(
    select 1 from public.together_entitlements
    where 'explicit_dialogue_unlimited'=any(coalesce(entitlement_keys,'{}'::text[]))
       or coalesce(metadata#>'{entitlementOverrides,grants}','[]'::jsonb) ? 'explicit_dialogue_unlimited'
  ),
  'retired adult-dialogue grants are absent from entitlement rows'
);

select ok(
  exists(
    select 1 from pg_catalog.pg_description description
    join pg_catalog.pg_class relation on relation.oid=description.objoid
    join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid and attribute.attnum=description.objsubid
    where relation.relname='together_entitlements'
      and attribute.attname='entitlement_keys'
      and description.description like '%Adult-content eligibility is resolved separately%'
  ),
  'entitlement column documents adult-eligibility separation'
);

select * from finish();
rollback;
