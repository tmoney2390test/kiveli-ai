begin;
select plan(3);

select is(
  (select count(*) from public.together_character_relationship_edges
   where history ilike '%living contact, not a rumor%'
      or history ilike '%keep overlapping nights in%neither pretends the work is the whole of them%'
      or history ilike '%trusts%more than the house%'
      or history ilike '%authored%social circle%'
      or history ilike '%actual closeness and what they share%'
      or history = 'An established personal connection; details require direct knowledge.'
      or history ilike '%faction overlap, or repeated%'),
  0::bigint,
  'Imported relationship scaffolding is absent from the live graph'
);

select ok(
  exists(
    select 1 from public.together_character_relationship_edges edge
    join public.together_character_templates source on source.id = edge.source_template_id
    join public.together_character_templates target on target.id = edge.target_template_id
    where source.slug = 'roxie-hale' and target.slug = 'lila-quinn'
      and edge.relationship_type = 'trusted contact'
      and edge.history = 'Roxie runs the Red Hour, and Lila is a featured dancer she trusts.'
  ),
  'Roxie and Lila have a durable relationship summary, not a one-off incident'
);

select ok(
  exists(select 1 from public.together_character_relationship_edges
    where metadata->>'source' = 'juniper_city_social_v3'
      and metadata->>'historyEditorialVersion' = 'human_v1'),
  'The relationship editorial pass marked the imported Juniper graph'
);

select * from finish();
rollback;
