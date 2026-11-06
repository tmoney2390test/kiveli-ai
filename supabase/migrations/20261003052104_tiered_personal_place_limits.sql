-- Keep active private places within the current account tier. Existing places
-- survive a downgrade, but new or restored places require an available slot.
create or replace function public.kivelle_limit_private_places()
returns trigger language plpgsql set search_path=public as $$
declare
  place_limit integer;
begin
  if new.owner_user_id is null or new.archived_at is not null then return new; end if;
  if tg_op='UPDATE' and old.owner_user_id=new.owner_user_id and old.archived_at is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_user_id::text,0));
  select case
    when e.expires_at is not null and e.expires_at<=current_timestamp then 3
    when e.tier='kivelle_max' then 50
    when e.tier='kivelle_plus' then 20
    else 3
  end into place_limit
  from public.together_entitlements e
  where e.user_id=new.owner_user_id;
  place_limit := coalesce(place_limit,3);

  if (select count(*) from public.together_locations
      where owner_user_id=new.owner_user_id and archived_at is null and id<>new.id) >= place_limit then
    raise exception 'Private place limit reached' using errcode='23514';
  end if;
  return new;
end $$;
