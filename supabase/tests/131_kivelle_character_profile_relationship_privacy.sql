begin;
select plan(4);

select ok(
  not has_table_privilege('anon','public.together_character_relationship_edges','select'),
  'Anonymous clients cannot enumerate the raw character relationship graph'
);
select ok(
  not has_table_privilege('authenticated','public.together_character_relationship_edges','select'),
  'Authenticated clients cannot enumerate raw relationship scores or metadata'
);
select ok(
  has_table_privilege('service_role','public.together_character_relationship_edges','select'),
  'The authenticated server projection can read the character relationship graph'
);
select has_index(
  'public',
  'together_character_relationship_edges',
  'together_character_relationship_edges_target_world_idx',
  'Inbound profile relationship lookups have a scoped index'
);

select * from finish();
rollback;
