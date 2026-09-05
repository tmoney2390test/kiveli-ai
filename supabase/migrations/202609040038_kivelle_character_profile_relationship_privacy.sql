begin;

-- Character relationships are projected through an authenticated server route.
-- This prevents clients from enumerating raw graph scores or metadata directly.
drop policy if exists together_edges_read on public.together_character_relationship_edges;
revoke select on public.together_character_relationship_edges from anon, authenticated;
grant select, insert, update, delete on public.together_character_relationship_edges to service_role;

create index if not exists together_character_relationship_edges_target_world_idx
  on public.together_character_relationship_edges(target_template_id, world_id);

comment on table public.together_character_relationship_edges is
  'Server-projected public character graph. Raw scores and metadata are not client-readable.';

commit;
