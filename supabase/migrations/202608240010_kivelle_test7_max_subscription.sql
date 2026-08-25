-- Explicit production test subscription requested for test7@test.com.
-- Preserve the account's narrow testing overrides while granting the complete
-- Kivelle Max product tier through the canonical entitlement row.
do $$
declare
  target_user_id uuid;
  max_entitlements text[] := array[
    'relationship_core',
    'chat_core',
    'memory_core',
    'juniper_world',
    'plans_dates_moments',
    'custom_companion_basic',
    'maya_relationship',
    'text_basic',
    'memory_basic',
    'city_life',
    'dinner_juniper',
    'chat_unlimited',
    'memory_deep',
    'memory_inspector',
    'memory_manual_control',
    'history_expanded',
    'all_standard_worlds',
    'proactive_messages',
    'multiple_lives',
    'multiple_custom_companions',
    'priority_media',
    'director_selective',
    'group_chat',
    'text_expanded',
    'memory_long_term',
    'moments_expanded',
    'voice_notes',
    'contextual_images',
    'multiple_relationships',
    'memory_deepest',
    'history_max',
    'director_default',
    'early_access_worlds',
    'highest_priority_media',
    'social_scenes_enhanced',
    'voice_priority',
    'premium_models',
    'group_interactions'
  ]::text[];
begin
  select id
    into target_user_id
    from auth.users
   where lower(email)=lower('test7@test.com')
   limit 1;

  if target_user_id is null then
    -- Fresh/local databases do not seed production auth users.
    raise notice 'test7@test.com does not exist; skipping Kivelle Max test subscription';
    return;
  end if;

  insert into public.together_entitlements as entitlement(
    user_id,
    tier,
    entitlement_keys,
    billing_provider,
    billing_status,
    product_key,
    expires_at,
    metadata,
    updated_at
  )
  values (
    target_user_id,
    'kivelle_max',
    max_entitlements,
    'configured',
    'active',
    'kivelle_max_test',
    null,
    jsonb_build_object(
      'billingInterval','monthly',
      'adminSubscriptionGrant',jsonb_build_object(
        'tier','kivelle_max',
        'reason','Approved Kivelle Max production testing subscription',
        'scope','test7@test.com',
        'migration','202608240010'
      )
    ),
    now()
  )
  on conflict(user_id) do update
  set
    tier='kivelle_max',
    entitlement_keys=(
      select array_agg(distinct entitlement_key order by entitlement_key)
      from unnest(
        coalesce(entitlement.entitlement_keys,'{}'::text[])||max_entitlements
      ) as entitlement_key
    ),
    billing_provider='configured',
    billing_status='active',
    product_key='kivelle_max_test',
    expires_at=null,
    metadata=coalesce(entitlement.metadata,'{}'::jsonb)
      ||jsonb_build_object(
        'billingInterval','monthly',
        'adminSubscriptionGrant',jsonb_build_object(
          'tier','kivelle_max',
          'reason','Approved Kivelle Max production testing subscription',
          'scope','test7@test.com',
          'migration','202608240010'
        )
      ),
    updated_at=now();

  if not exists (
    select 1
      from public.together_entitlements
     where user_id=target_user_id
       and tier='kivelle_max'
       and billing_status='active'
       and 'memory_inspector'=any(entitlement_keys)
       and 'group_chat'=any(entitlement_keys)
  ) then
    raise exception 'test7 Kivelle Max subscription verification failed';
  end if;

  raise notice 'test7@test.com promoted to Kivelle Max';
end
$$;
