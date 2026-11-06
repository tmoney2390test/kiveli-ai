begin;

-- Describe the enduring connection rather than a single exchange with a guest.
update public.together_character_relationship_edges edge
set history = 'Roxie runs the Red Hour, and Lila is a featured dancer she trusts.',
    metadata = edge.metadata || jsonb_build_object('historyEditorialVersion', 'human_v2'),
    updated_at = clock_timestamp()
from public.together_character_templates source,
     public.together_character_templates target
where edge.source_template_id = source.id and edge.target_template_id = target.id
  and source.slug = 'roxie-hale' and target.slug = 'lila-quinn'
  and edge.metadata->>'source' = 'adult_cast_expansion_v1'
  and edge.history in (
    'Roxie and Lila work at the Red Hour. Roxie asks Lila what happened on the floor before she takes a guest''s word for it.',
    'Roxie runs the Red Hour, where Lila is a featured dancer. Roxie respects Lila''s judgment about the club and its guests.'
  );

commit;
