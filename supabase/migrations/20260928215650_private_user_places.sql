begin;

-- User places use the existing location ID throughout plans, scenes and media.
-- Ownership remains explicit so the authored catalogue never exposes them.
alter table public.together_locations
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists custom_image_path text,
  add column if not exists archived_at timestamptz;

create index if not exists together_locations_owner_world_idx
  on public.together_locations(owner_user_id,world_id,created_at desc)
  where owner_user_id is not null;

create or replace function public.kivelle_limit_private_places()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.owner_user_id is null or new.archived_at is not null then return new; end if;
  if tg_op='UPDATE' and old.owner_user_id=new.owner_user_id and old.archived_at is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_user_id::text,0));
  if (select count(*) from public.together_locations
      where owner_user_id=new.owner_user_id and archived_at is null and id<>new.id) >= 20 then
    raise exception 'Private place limit reached' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists together_locations_private_limit on public.together_locations;
create trigger together_locations_private_limit before insert or update on public.together_locations
  for each row execute function public.kivelle_limit_private_places();

alter table public.together_locations
  add constraint together_user_place_image_path_check
  check(custom_image_path is null or (
    owner_user_id is not null and
    custom_image_path like owner_user_id::text || '/places/%'
  ));

-- Client writes go through together-place, which validates world access and
-- ownership before using the service role. Existing public locations stay read-only.
revoke insert, update, delete on public.together_locations from anon, authenticated;

drop policy if exists together_locations_read on public.together_locations;
create policy together_locations_read on public.together_locations
  for select to anon,authenticated
  using (
    exists(select 1 from public.together_worlds w where w.id=world_id and w.published)
    and (owner_user_id is null or (owner_user_id=(select auth.uid()) and archived_at is null))
  );

drop policy if exists location_saved_access on public.together_locations;
create policy location_saved_access on public.together_locations
  as restrictive for select to anon,authenticated
  using (
    owner_user_id=(select auth.uid())
    or coalesce(access_metadata->>'publicMapVisible','true')<>'false'
  );

comment on column public.together_locations.owner_user_id is
  'Null for authored world locations; non-null for a private user-created place.';

commit;
