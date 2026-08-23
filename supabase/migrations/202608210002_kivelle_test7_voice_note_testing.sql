-- Explicit production test allowance for companion voice-note validation.
-- Keep the account on its existing tier and grant only the Kivelle+ voice-note
-- capability. Realtime calls remain Max-only and are intentionally not granted.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
    from auth.users
   where lower(email)=lower('test7@test.com')
   limit 1;

  if target_user_id is null then
    raise notice 'test7@test.com does not exist; skipping voice-note testing grant';
    return;
  end if;

  insert into public.together_entitlements as entitlement(user_id,tier,entitlement_keys,metadata)
  values(
    target_user_id,
    'free',
    array['voice_notes']::text[],
    jsonb_build_object(
      'entitlementOverrides',jsonb_build_object(
        'grants',jsonb_build_array('voice_notes'),
        'reason','Approved Kivelle companion voice-note testing allowance',
        'scope','test7@test.com',
        'migration','202608210002'
      )
    )
  )
  on conflict(user_id) do update
  set
    entitlement_keys=(
      select array_agg(distinct entitlement_key order by entitlement_key)
      from unnest(coalesce(entitlement.entitlement_keys,'{}'::text[])||array['voice_notes']::text[]) as entitlement_key
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
            select 'voice_notes'
          ) as grants
        ),
        'reason','Approved Kivelle companion voice-note testing allowance',
        'scope','test7@test.com',
        'migration','202608210002'
      )
    ),
    updated_at=now();
end
$$;
