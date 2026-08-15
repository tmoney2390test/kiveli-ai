begin;
insert into public.together_user_worlds(user_id,world_id,access_status,first_visited_at,last_visited_at,progression_state,metadata)
select e.user_id,w.id,'unlocked',null,null,'{}'::jsonb,jsonb_build_object('source','subscription_world_pack_1','subscriptionManaged',true)
from public.together_entitlements e
join public.together_worlds w on w.published=true
where (e.tier in('kivelle_plus','together_plus','kivelle_max','unlimited') and w.access_type='subscription')
   or (e.tier in('kivelle_max','unlimited') and w.access_type='premium' and coalesce((w.metadata->>'early_access')::boolean,false))
on conflict(user_id,world_id) do update set access_status='unlocked',metadata=public.together_user_worlds.metadata||excluded.metadata,updated_at=now();
commit;
