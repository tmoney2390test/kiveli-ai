begin;
set local search_path = public, extensions;

-- Trigger functions are invoked by their triggers; no API role needs RPC access.
revoke all on function public.kivelle_world_pulse_check_owner() from public, anon, authenticated;

-- Cover foreign keys that are not the leading columns of an existing index.
create index if not exists together_world_pulse_links_continuity_idx on public.together_world_pulse_conversation_links(continuity_id);
create index if not exists together_world_pulse_links_occurrence_idx on public.together_world_pulse_conversation_links(occurrence_id);
create index if not exists together_world_pulse_engagements_continuity_idx on public.together_world_pulse_engagements(continuity_id);
create index if not exists together_world_pulse_engagements_group_idx on public.together_world_pulse_engagements(group_conversation_id) where group_conversation_id is not null;
create index if not exists together_world_pulse_engagements_occurrence_idx on public.together_world_pulse_engagements(occurrence_id);
create index if not exists together_world_pulse_occurrence_character_idx on public.together_world_pulse_occurrence_participants(character_template_id);
create index if not exists together_world_pulse_occurrences_location_idx on public.together_world_pulse_occurrences(location_id);
create index if not exists together_world_pulse_occurrences_template_world_idx on public.together_world_pulse_occurrences(template_id, world_id);
create index if not exists together_world_pulse_template_character_idx on public.together_world_pulse_template_participants(character_template_id);
create index if not exists together_world_pulse_templates_primary_idx on public.together_world_pulse_templates(primary_character_template_id);
create index if not exists together_world_pulse_templates_location_idx on public.together_world_pulse_templates(location_id);

commit;
