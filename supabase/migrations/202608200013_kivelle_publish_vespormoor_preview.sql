begin;

-- Vespormoor is intentionally visible as an empty world preview. Its authored
-- residents and locations remain pending; publishing the shell lets the world
-- art, lore, and theme be reviewed in the production experience now.
update public.together_worlds
set
  published = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'releaseStatus', 'preview',
    'contentStatus', 'world_shell_preview'
  ),
  updated_at = now()
where id = '10000000-0000-4000-8000-000000000010'
  and slug = 'vespormoor';

do $$
begin
  if not exists (
    select 1
    from public.together_worlds
    where id = '10000000-0000-4000-8000-000000000010'
      and slug = 'vespormoor'
      and published is true
  ) then
    raise exception 'Vespormoor world shell was not found or could not be published';
  end if;
end $$;

commit;
