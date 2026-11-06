begin;

-- Chat creation must use the same provider-backed access as the application.
-- A renewed billing period can be newer than the cached entitlement row.
create or replace function public.kivelle_active_conversation_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  with current_billing as (
    select subscription.plan_key
    from public.together_billing_subscriptions subscription
    where subscription.user_id=p_user_id
      and subscription.plan_key in ('kivelle_plus','kivelle_max')
      and (
        (subscription.status in ('active','trialing')
          and (coalesce(subscription.access_ends_at,subscription.current_period_end) is null
            or coalesce(subscription.access_ends_at,subscription.current_period_end)>current_timestamp))
        or (subscription.status='past_due'
          and coalesce(subscription.access_ends_at,subscription.current_period_end)>current_timestamp)
      )
    order by case subscription.plan_key when 'kivelle_max' then 2 else 1 end desc,
      coalesce(subscription.access_ends_at,subscription.current_period_end) desc nulls first,
      subscription.updated_at desc
    limit 1
  ),
  entitlement as (
    select tier,expires_at from public.together_entitlements where user_id=p_user_id
  )
  select case
    when (select plan_key from current_billing)='kivelle_max' then 50
    when (select plan_key from current_billing)='kivelle_plus' then 20
    -- A provider record supersedes legacy cached access, including when the
    -- provider says that access has ended.
    when exists(select 1 from public.together_billing_subscriptions where user_id=p_user_id) then 5
    when (select expires_at from entitlement)<=current_timestamp then 5
    when (select tier from entitlement)='kivelle_max' then 50
    when (select tier from entitlement)='kivelle_plus' then 20
    else 5
  end
$$;

revoke all on function public.kivelle_active_conversation_limit(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_active_conversation_limit(uuid) to service_role;

comment on function public.kivelle_active_conversation_limit(uuid) is
  'Returns the active chat limit from current provider billing access, falling back to legacy entitlements only when no provider record exists.';

commit;
