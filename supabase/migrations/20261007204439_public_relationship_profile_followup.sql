begin;

-- Follow-up audit: replace remaining scene-like profile summaries and keep
-- explicitly secret ties out of the public graph altogether.
with summaries(world_slug, character_a, character_b, profile_summary, profile_visible) as (
  values
    ('gilded-coast', 'amara-kade', 'bastien-crow', 'Amara and Bastien work together on rescues: he brings in the injured, and she treats them.', true),
    ('gilded-coast', 'elara-voss', 'tomas-renn', 'Elara and Tomas have a cautious business relationship. He expects honest crew records before giving her a berth.', true),
    ('port-vervelle', 'mia-han-andersson', 'theo-mancini', 'Mia and Theo are beach friends and occasional workout partners. She has a soft spot for his older dog.', true),
    ('vharadren', 'celia-thatch', 'garrick-holt', 'Garrick looks out for Celia on her early delivery runs, though she never asked him to.', true),
    ('vharadren', 'brina-forgehand', 'sera-blackvein', null, false),
    ('vharadren', 'lord-halric-thornwall', 'queen-selene-ravaryn', null, false)
)
update public.together_character_relationship_edges edge
set metadata = coalesce(edge.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'profileSummary', summaries.profile_summary,
    'profileVisible', summaries.profile_visible,
    'profileEditorialVersion', 'relationship_v2'
  ),
  updated_at = clock_timestamp()
from public.together_character_templates source,
     public.together_character_templates target,
     public.together_worlds world,
     summaries
where edge.source_template_id = source.id
  and edge.target_template_id = target.id
  and edge.world_id = world.id
  and world.slug = summaries.world_slug
  and least(source.slug, target.slug) = least(summaries.character_a, summaries.character_b)
  and greatest(source.slug, target.slug) = greatest(summaries.character_a, summaries.character_b);

commit;
