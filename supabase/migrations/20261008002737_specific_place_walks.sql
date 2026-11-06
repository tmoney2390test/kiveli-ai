-- Complete the public place-activity pass without changing custom places.
with edits(world_slug, slug, replacement, description) as (
  values
    ('eos-meridian', 'orchard-nine', 'Follow the irrigation paths', 'Walk beneath the old fruit trees and follow the rills that keep them alive.'),
    ('eos-meridian', 'first-habitat', 'Trace the first-generation corridors', 'Follow the repaired bulkheads and old hatch numbers through the inhabited corridors.'),
    ('neon-kyo', 'red-lantern-alley', 'Follow the lanterns between counters', 'Walk the alley past the tiny bars and late-night noodle counters.'),
    ('neon-kyo', 'lantern-street', 'Browse the lantern-lit shops', 'Follow the pedestrian street past handmade lanterns and small shopfronts.')
)
update public.together_locations l
set possible_activities = array_replace(l.possible_activities, 'walking', e.replacement),
    canonical_lore = jsonb_set(
      coalesce(l.canonical_lore, '{}'::jsonb),
      '{activityDescriptions}',
      (coalesce(l.canonical_lore->'activityDescriptions', '{}'::jsonb) - 'walking') || jsonb_build_object(e.replacement, e.description),
      true
    ),
    updated_at = now()
from edits e
join public.together_worlds w on w.slug = e.world_slug
where l.world_id = w.id
  and l.slug = e.slug
  and l.owner_user_id is null
  and l.archived_at is null
  and 'walking' = any(l.possible_activities);
