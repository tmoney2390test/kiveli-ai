begin;
select plan(4);

select is(
  (select count(*) from public.together_character_relationship_edges
   where metadata->>'profileEditorialVersion' = 'relationship_v2'),
  45::bigint,
  'Audited relationship profile overrides cover 23 pairs'
);

select is(
  (select count(*) from public.together_character_relationship_edges
   where metadata->>'profileEditorialVersion' = 'relationship_v2'
     and metadata->>'profileSummary' is not null),
  39::bigint,
  'Public relationship summaries describe lasting ties'
);

select is(
  (select count(*) from public.together_character_relationship_edges
   where metadata->>'profileEditorialVersion' = 'relationship_v2'
     and metadata->>'profileVisible' = 'false'),
  6::bigint,
  'Three secret relationship pairs are absent from public profiles'
);

select ok(
  exists (
    select 1 from public.together_character_relationship_edges edge
    join public.together_character_templates source on source.id = edge.source_template_id
    join public.together_character_templates target on target.id = edge.target_template_id
    where source.slug = 'cassidy-reed' and target.slug = 'graham-pike'
      and edge.metadata->>'profileLabel' = 'mentor'
      and edge.metadata->>'profileSummary' = 'Graham taught Cassidy mechanical drawing and remains a trusted mentor.'
      and edge.history like '%education fund%'
  ),
  'The public card keeps Cassidy''s secret out while retaining internal canon'
);

select * from finish();
rollback;
