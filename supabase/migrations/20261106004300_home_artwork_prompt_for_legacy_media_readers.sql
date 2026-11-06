-- Already-deployed chat, plan, photo and video services read prompt_text as the
-- environment description. Keep that contract and give catalog shot direction
-- its own field. Existing image jobs retain their immutable original prompts.
begin;
alter table public.together_character_homes add column if not exists artwork_prompt text;
update public.together_character_homes h set artwork_prompt=h.prompt_text,
  prompt_text=h.canonical_visual_context->>'canonicalPrompt',updated_at=now()
from public.together_character_versions v, public.together_character_templates t, public.together_worlds w
where v.id=h.character_version_id and t.id=v.character_template_id and w.id=h.world_id
  and v.version=t.current_published_version and t.creator_id is null and t.published and w.published
  and h.active and h.source='authored' and h.canonical_lore ? 'homeCatalogRevision'
  and w.slug in ('calders-run','gilded-coast','juniper-city','neon-kyo','northvale','port-vervelle','vespormoor','vharadren')
  and h.artwork_prompt is null and h.canonical_visual_context->>'canonicalPrompt' <> h.prompt_text;
notify pgrst, 'reload schema';
commit;
