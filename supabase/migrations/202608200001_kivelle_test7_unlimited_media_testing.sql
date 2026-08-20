-- Explicit production test allowance for high-volume PhotoGen validation.
-- This bypasses only the daily request throttle. Credits, content policy,
-- adult verification, character boundaries, and provider safety still apply.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
    from auth.users
   where lower(email)=lower('test7@test.com')
   limit 1;

  if target_user_id is null then
    raise exception 'test7@test.com does not exist; unlimited media testing grant was not applied';
  end if;

  insert into public.together_entitlements as entitlement(user_id,tier,entitlement_keys,metadata)
  values(
    target_user_id,
    'free',
    array['media_generation_unlimited']::text[],
    jsonb_build_object(
      'entitlementOverrides',jsonb_build_object(
        'grants',jsonb_build_array('media_generation_unlimited'),
        'reason','Approved Kivelle high-volume media testing allowance',
        'scope','test7@test.com',
        'migration','202608200001'
      )
    )
  )
  on conflict(user_id) do update
  set
    entitlement_keys=(
      select array_agg(distinct entitlement_key order by entitlement_key)
      from unnest(coalesce(entitlement.entitlement_keys,'{}'::text[])||array['media_generation_unlimited']::text[]) as entitlement_key
    ),
    metadata=coalesce(entitlement.metadata,'{}'::jsonb)||jsonb_build_object(
      'entitlementOverrides',
      coalesce(entitlement.metadata->'entitlementOverrides','{}'::jsonb)||jsonb_build_object(
        'grants',(
          select coalesce(jsonb_agg(grant_key order by grant_key),'[]'::jsonb)
          from(
            select distinct value as grant_key
            from jsonb_array_elements_text(coalesce(entitlement.metadata#>'{entitlementOverrides,grants}','[]'::jsonb)) as value
            union
            select 'media_generation_unlimited'
          ) as grants
        ),
        'reason','Approved Kivelle high-volume media testing allowance',
        'scope','test7@test.com',
        'migration','202608200001'
      )
    ),
    updated_at=now();
end
$$;
