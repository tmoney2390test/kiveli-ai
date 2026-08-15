begin;

create or replace function public.kivelle_sync_subscription_world_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.tier in ('kivelle_plus','kivelle_max') then
    insert into public.together_user_worlds(user_id,world_id,access_status,metadata,updated_at)
    select new.user_id,w.id,'unlocked',jsonb_build_object('subscriptionManaged',true,'subscriptionTier',new.tier),now()
    from public.together_worlds w
    where w.published=true and (
      w.access_type='subscription'
      or (new.tier='kivelle_max' and w.access_type='premium' and coalesce((w.metadata->>'early_access')::boolean,false)=true)
    )
    on conflict(user_id,world_id) do update set
      access_status=case
        when together_user_worlds.access_status='unlocked' and coalesce(together_user_worlds.metadata->>'subscriptionManaged','false')<>'true' then together_user_worlds.access_status
        else 'unlocked' end,
      metadata=case
        when together_user_worlds.access_status='unlocked' and coalesce(together_user_worlds.metadata->>'subscriptionManaged','false')<>'true' then together_user_worlds.metadata
        else coalesce(together_user_worlds.metadata,'{}'::jsonb)||jsonb_build_object('subscriptionManaged',true,'subscriptionTier',new.tier) end,
      updated_at=now();

    -- Max-only early-access rows must be removed from subscription management after a downgrade to Plus.
    if new.tier='kivelle_plus' then
      update public.together_user_worlds uw set access_status='available',metadata=(coalesce(uw.metadata,'{}'::jsonb)-'subscriptionManaged'-'subscriptionTier'),updated_at=now()
      from public.together_worlds w
      where uw.user_id=new.user_id and uw.world_id=w.id and coalesce(uw.metadata->>'subscriptionManaged','false')='true' and w.access_type='premium';
    end if;
  else
    update public.together_user_worlds uw set access_status='available',metadata=(coalesce(uw.metadata,'{}'::jsonb)-'subscriptionManaged'-'subscriptionTier'),updated_at=now()
    where uw.user_id=new.user_id and coalesce(uw.metadata->>'subscriptionManaged','false')='true';
  end if;
  return new;
end $$;

revoke all on function public.kivelle_sync_subscription_world_access() from public,anon,authenticated;
grant execute on function public.kivelle_sync_subscription_world_access() to service_role;

drop trigger if exists together_entitlements_sync_world_access on public.together_entitlements;
create trigger together_entitlements_sync_world_access
after insert or update of tier on public.together_entitlements
for each row execute function public.kivelle_sync_subscription_world_access();

-- Backfill existing entitlements through the same trigger path.
update public.together_entitlements set tier=tier;

commit;
