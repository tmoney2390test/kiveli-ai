begin;

do $$
declare
  district_count integer;
  child_count integer;
  prompt_count integer;
  preview_world public.together_worlds%rowtype;
begin
  select count(*) into district_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000010'
    and parent_location_id is null
    and location_type='district';

  select count(*) into child_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000010'
    and parent_location_id is not null;

  select count(*) into prompt_count
  from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000010'
    and nullif(canonical_visual_context->>'canonicalPrompt','') is not null
    and metadata->>'photoStatus'='world_fallback';

  select * into preview_world
  from public.together_worlds
  where id='10000000-0000-4000-8000-000000000010';

  if district_count<>6 then raise exception 'Expected 6 Vespormoor districts, found %',district_count; end if;
  if child_count<>45 then raise exception 'Expected 45 Vespormoor sub-locations, found %',child_count; end if;
  if prompt_count<>51 then raise exception 'Every Vespormoor location must have prompt-ready fallback context'; end if;
  if preview_world.published is not true then raise exception 'Vespormoor preview is not published'; end if;
  if preview_world.default_arrival_location_id<>'29000000-0000-4000-8000-000000000007' then raise exception 'Vespormoor arrival must be Vesper Square'; end if;
  if preview_world.metadata->>'locationCatalogStatus'<>'ready' then raise exception 'Vespormoor location catalog is not ready'; end if;
end $$;

rollback;
