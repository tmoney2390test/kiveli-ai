begin;

-- Keep the detailed canon in history for character context. Public profile cards
-- receive a short description of the ongoing tie instead of a scene recap.
with summaries(world_slug, character_a, character_b, profile_label, profile_summary, profile_visible) as (
  values
    ('eos-meridian', 'cassian-vale', 'iris-vale', null, 'Cassian and Iris are half siblings. He is protective, and she wants him to trust her judgment.', true),
    ('eos-meridian', 'dax-holloway', 'mateo-singh', null, 'Dax and Mateo are longtime friends who trust each other, even when they clash over safety and politics.', true),
    ('eos-meridian', 'dr-lena-okafor', 'commander-rhea-navarro', null, 'Lena and Rhea are former partners who still respect each other at work, though things remain tense between them.', true),
    ('eos-meridian', 'dr-selene-ward', 'theo-vance', null, 'Selene mentors Theo, but they disagree over access and credit for his research.', true),
    ('gilded-coast', 'dorian-pike', 'maia-bel', null, 'Maia and Dorian work together on stage rigging. She pushes for spectacle; he insists on safety.', true),
    ('gilded-coast', 'elara-voss', 'mara-blackfin', null, 'Elara and Mara are former shipmates whose alliance broke after a fatal boarding.', true),
    ('gilded-coast', 'elias-reed', 'nadia-storm', null, 'Elias taught Nadia to read charts. Now they compare notes as fellow navigators.', true),
    ('gilded-coast', 'idris-vale', 'seraphine-vale', null, 'Idris and Seraphine are cousins whose business trust is strained by a dispute over his boat.', true),
    ('gilded-coast', 'inez-sol', 'lucien-damar', null, 'Inez and Lucien are artistic allies who work together on dance and music.', true),
    ('gilded-coast', 'inez-sol', 'sabine-quill', null, 'Sabine and Inez are former colleagues; Inez still values Sabine''s contract advice.', true),
    ('gilded-coast', 'iria-montrose', 'julian-mercer', null, 'Julian and Iria are old neighbors with a prickly history around money, help, and pride.', true),
    ('gilded-coast', 'mateo-salt', 'yara-nouri', null, 'Mateo and Yara are craftspeople in a dispute over credit for a sail design.', true),
    ('juniper-city', 'caleb-bennett', 'zoe-bennett', null, 'Caleb is Zoe''s uncle. He supports her dance work, but they clash over his polished public image.', true),
    ('northvale', 'cassidy-reed', 'graham-pike', 'mentor', 'Graham taught Cassidy mechanical drawing and remains a trusted mentor.', true),
    ('vharadren', 'bastian-crow', 'idris-salt', null, null, false),
    ('vharadren', 'brother-aldren', 'high-flame-elowen-orison', null, 'Elowen and Aldren are former Inquisition colleagues now at odds over the harm their doctrine caused.', true),
    ('vharadren', 'freya-hart', 'lord-rowan-edevane', null, 'Freya served under Rowan as a ranger, but false orders damaged her trust in him.', true)
)
update public.together_character_relationship_edges edge
set metadata = coalesce(edge.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'profileSummary', summaries.profile_summary,
    'profileLabel', summaries.profile_label,
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
