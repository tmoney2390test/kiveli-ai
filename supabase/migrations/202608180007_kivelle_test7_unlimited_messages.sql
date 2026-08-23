-- Explicit production test allowance requested for test7@test.com.
-- Keep the account's existing subscription tier and grant only unlimited daily chat.
do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
    from auth.users
   where lower(email)=lower('test7@test.com')
   limit 1;

  if target_user_id is null then
    -- Fresh/local databases do not seed production auth users. Keep the
    -- migration portable while applying the explicitly scoped production
    -- allowance whenever that account exists.
    raise notice 'test7@test.com does not exist; skipping unlimited chat grant';
    return;
  end if;

  insert into public.together_entitlements as entitlement(user_id,tier,entitlement_keys,metadata)
  values (
    target_user_id,
    'free',
    array['chat_unlimited']::text[],
    jsonb_build_object(
      'entitlementOverrides',jsonb_build_object(
        'grants',jsonb_build_array('chat_unlimited'),
        'reason','Approved Kivelle message testing allowance',
        'scope','test7@test.com',
        'migration','202608180007'
      )
    )
  )
  on conflict(user_id) do update
  set
    entitlement_keys=(
      select array_agg(distinct entitlement_key order by entitlement_key)
      from unnest(coalesce(entitlement.entitlement_keys,'{}'::text[])||array['chat_unlimited']::text[]) as entitlement_key
    ),
    metadata=coalesce(entitlement.metadata,'{}'::jsonb)||jsonb_build_object(
      'entitlementOverrides',
      coalesce(entitlement.metadata->'entitlementOverrides','{}'::jsonb)||jsonb_build_object(
        'grants',(
          select coalesce(jsonb_agg(grant_key order by grant_key),'[]'::jsonb)
          from (
            select distinct value as grant_key
            from jsonb_array_elements_text(coalesce(entitlement.metadata#>'{entitlementOverrides,grants}','[]'::jsonb)) as value
            union
            select 'chat_unlimited'
          ) as grants
        ),
        'reason','Approved Kivelle message testing allowance',
        'scope','test7@test.com',
        'migration','202608180007'
      )
    ),
    updated_at=now();
end
$$;
