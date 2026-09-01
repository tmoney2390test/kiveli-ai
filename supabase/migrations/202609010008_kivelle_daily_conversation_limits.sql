begin;

-- Standard subscriptions now use finite daily conversation allowances. Keep the
-- narrow server-controlled override available for explicitly granted test or
-- support accounts, but remove the former paid-plan default from stored rows.
update public.together_entitlements
set entitlement_keys=array_remove(coalesce(entitlement_keys,'{}'::text[]),'chat_unlimited'),
    updated_at=now()
where 'chat_unlimited'=any(coalesce(entitlement_keys,'{}'::text[]))
  and not (coalesce(metadata #> '{entitlementOverrides,grants}','[]'::jsonb) @> '["chat_unlimited"]'::jsonb);

commit;
