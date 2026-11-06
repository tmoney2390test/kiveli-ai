begin;

-- This imported club connection was written in the same "house" shorthand as
-- the generated batch, but has a specific floor relationship worth preserving.
update public.together_character_relationship_edges edge
set history = 'Sienna trusts Lila''s read of the floor more than the Red Hour''s official line.',
    metadata = edge.metadata || jsonb_build_object('historyEditorialVersion', 'human_v1'),
    updated_at = clock_timestamp()
from public.together_character_templates source,
     public.together_character_templates target
where edge.source_template_id = source.id and edge.target_template_id = target.id
  and source.slug = 'sienna-cruz' and target.slug = 'lila-quinn'
  and edge.metadata->>'source' = 'juniper_nightlife_expansion_v1'
  and edge.history = 'Sienna trusts Lila on the floor more than the house.';

-- The Vharadren content pack copied public history into metadata. Keep the
-- speaker context and profile text in agreement after the first editorial pass.
update public.together_character_relationship_edges
set metadata = jsonb_set(metadata, '{publicDynamic}', to_jsonb(history), true),
    updated_at = clock_timestamp()
where metadata->>'historyEditorialVersion' = 'human_v1'
  and metadata->>'publicDynamic' ilike '%faction overlap, or repeated%';

-- The relationship label carries more information than the old placeholder.
-- Preserve it in the prose for the few Calder ties where a broad category
-- would otherwise mistake neighbors for friends or erase friendship tension.
update public.together_character_relationship_edges edge
set history = case
      when edge.relationship_type ilike '%friendship%tension%'
        then source.name || ' and ' || target.name || ' are friends, though they do not always see eye to eye.'
      when edge.relationship_type ilike '%neighbor%'
        then source.name || ' and ' || target.name || ' are neighbors who know when to lend a hand.'
      else source.name || ' trusts ' || target.name || ' to show up when the town needs help.'
    end,
    updated_at = clock_timestamp()
from public.together_character_templates source,
     public.together_character_templates target
where edge.source_template_id = source.id and edge.target_template_id = target.id
  and edge.metadata->>'source' = 'calders_run_authoring_v1'
  and edge.metadata->>'historyEditorialVersion' = 'human_v1'
  and (edge.relationship_type ilike '%friendship%tension%'
    or edge.relationship_type ilike '%neighbor%'
    or edge.relationship_type = 'community trust');

commit;
