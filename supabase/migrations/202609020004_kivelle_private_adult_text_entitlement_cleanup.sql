-- Adult eligibility is an account-safety decision, never a paid/test entitlement.
-- Remove the retired test grant without changing any user's subscription tier,
-- product benefits, conversation data, or server-side age eligibility.
update public.together_entitlements
set entitlement_keys=array_remove(coalesce(entitlement_keys,'{}'::text[]),'explicit_dialogue_unlimited'),
    metadata=jsonb_set(
      coalesce(metadata,'{}'::jsonb),
      '{entitlementOverrides,grants}',
      coalesce((
        select jsonb_agg(value order by value)
        from jsonb_array_elements_text(coalesce(metadata#>'{entitlementOverrides,grants}','[]'::jsonb)) as grant_value(value)
        where value<>'explicit_dialogue_unlimited'
      ),'[]'::jsonb),
      true
    ),
    updated_at=now()
where 'explicit_dialogue_unlimited'=any(coalesce(entitlement_keys,'{}'::text[]))
   or coalesce(metadata#>'{entitlementOverrides,grants}','[]'::jsonb) ? 'explicit_dialogue_unlimited';

comment on column public.together_entitlements.entitlement_keys is
  'General product capabilities only. Adult-content eligibility is resolved separately from together_profiles and must never be represented here.';
