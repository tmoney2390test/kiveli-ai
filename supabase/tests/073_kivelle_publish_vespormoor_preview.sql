begin;

do $$
declare published_world public.together_worlds%rowtype;
begin
  select * into published_world
  from public.together_worlds
  where id = '10000000-0000-4000-8000-000000000010';

  if published_world.id is null then raise exception 'Vespormoor world shell is missing'; end if;
  if published_world.slug <> 'vespormoor' or published_world.name <> 'Vespormoor' then raise exception 'Vespormoor identity is not canonical'; end if;
  if published_world.published is not true then raise exception 'Vespormoor preview is not published'; end if;
  if published_world.hero_asset_key <> 'vespormoor-hero' then raise exception 'Vespormoor preview artwork is not configured'; end if;
  if published_world.metadata->>'releaseStatus' <> 'preview' then raise exception 'Vespormoor release status is not preview'; end if;
end $$;

rollback;
