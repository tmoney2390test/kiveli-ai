-- An empty-room catalog photo needs "no people"; a selfie or video in the same
-- room needs a person. Share the factual interior, never the catalog shot list.
-- No paid image jobs, new revisions, visibility changes or changes to Eos.
update public.together_character_homes h
set canonical_visual_context = jsonb_set(h.canonical_visual_context,'{canonicalPrompt}',
  to_jsonb(concat_ws(' ',h.description,h.canonical_visual_context->>'interiorStyle',
    'Window: '||(h.canonical_visual_context->>'windowOutlook'),
    'Personal objects: '||(select string_agg(d->>'description',' ' order by ord)
      from jsonb_array_elements(h.personal_details) with ordinality as objects(d,ord)),
    'Use the scene’s current local time and lighting.'))),updated_at=now()
from public.together_character_versions v, public.together_character_templates t, public.together_worlds w
where v.id=h.character_version_id and t.id=v.character_template_id and w.id=h.world_id
  and v.version=t.current_published_version and t.creator_id is null and t.published and w.published
  and h.active and h.source='authored' and h.canonical_lore ? 'homeCatalogRevision'
  and w.slug in ('calders-run','gilded-coast','juniper-city','neon-kyo','northvale','port-vervelle','vespormoor','vharadren')
  and h.canonical_visual_context->>'canonicalPrompt'=h.prompt_text;
