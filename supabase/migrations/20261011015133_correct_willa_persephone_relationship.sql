-- Willa waits tables at the Afterdark Diner; Persephone serves at the drowned
-- chapel. A generic imported "work ally" edge implied they shared a workplace
-- and led dialogue to invent an employer relationship.
update public.together_character_relationship_edges as edge
set relationship_type = 'friendly acquaintance',
    history = 'Willa waits tables at the Afterdark Diner; Persephone serves at the drowned chapel. They know each other around Vespormoor, but neither works for the other.',
    metadata = edge.metadata || jsonb_build_object('historyEditorialVersion', 'specific_v1'),
    updated_at = now()
from public.together_character_templates as source,
     public.together_character_templates as target
where edge.source_template_id = source.id
  and edge.target_template_id = target.id
  and ((source.slug = 'willa-night' and target.slug = 'persephone-bell')
    or (source.slug = 'persephone-bell' and target.slug = 'willa-night'))
  and edge.metadata->>'source' = 'adult_cast_expansion_v1'
  and edge.relationship_type = 'work ally';
