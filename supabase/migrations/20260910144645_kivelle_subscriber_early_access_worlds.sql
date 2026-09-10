begin;

-- Early-access worlds stay visible for discovery, while actual world access is
-- limited to active Kivelle+ and Kivelle Max memberships.
update public.together_worlds
set access_type='subscription',
    entitlement_key='worlds.standard',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'early_access',true,
      'subscriber_early_access',true
    ),
    updated_at=now()
where slug in ('calders-run','vespormoor');

-- Reconcile current subscribers. The existing entitlement trigger continues
-- to grant and remove these rows for future subscription changes.
insert into public.together_user_worlds(user_id,world_id,access_status,metadata,updated_at)
select e.user_id,w.id,'unlocked',jsonb_build_object('subscriptionManaged',true,'subscriptionTier',e.tier),now()
from public.together_entitlements e
cross join public.together_worlds w
where e.tier in ('kivelle_plus','kivelle_max')
  and w.slug in ('calders-run','vespormoor')
  and w.published=true
on conflict(user_id,world_id) do update set
  access_status='unlocked',
  metadata=coalesce(together_user_worlds.metadata,'{}'::jsonb)||jsonb_build_object('subscriptionManaged',true,'subscriptionTier',excluded.metadata->>'subscriptionTier'),
  updated_at=now();

-- Remove legacy build-time unlocks from accounts without an active paid tier.
update public.together_user_worlds uw
set access_status='available',
    metadata=coalesce(uw.metadata,'{}'::jsonb)-'subscriptionManaged'-'subscriptionTier',
    updated_at=now()
from public.together_worlds w
where uw.world_id=w.id
  and w.slug in ('calders-run','vespormoor')
  and not exists (
    select 1 from public.together_entitlements e
    where e.user_id=uw.user_id and e.tier in ('kivelle_plus','kivelle_max')
  );

commit;
