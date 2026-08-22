begin;

do $$
declare prepared_world public.together_worlds%rowtype;
begin
  select * into prepared_world from public.together_worlds where id='10000000-0000-4000-8000-000000000010';
  if prepared_world.id is null then raise exception 'Vespormoor world shell is missing'; end if;
  if prepared_world.slug<>'vespormoor' or prepared_world.name<>'Vespormoor' then raise exception 'Vespormoor identity is not canonical'; end if;
  if coalesce((prepared_world.metadata->>'early_access')::boolean,false) is not true then raise exception 'Vespormoor must retain its early-access marker'; end if;
  if prepared_world.hero_asset_key<>'vespormoor-hero' then raise exception 'Vespormoor default artwork is not configured'; end if;
  if prepared_world.metadata->>'contentStatus'<>'world_shell_ready' then raise exception 'Vespormoor shell status is missing'; end if;
  if prepared_world.metadata->>'centralWarning'<>'Nothing beneath the water shall be awakened.' then raise exception 'Vespormoor lake warning is not canonical'; end if;
end $$;

rollback;
