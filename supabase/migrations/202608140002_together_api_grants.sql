begin;

grant usage on schema public to anon,authenticated;
grant select on table
  public.together_worlds,
  public.together_locations,
  public.together_character_templates,
  public.together_character_versions,
  public.together_character_relationship_edges,
  public.together_schedule_templates,
  public.together_event_templates,
  public.together_date_templates
to anon,authenticated;

grant select on table
  public.together_profiles,
  public.together_character_instances,
  public.together_relationship_states,
  public.together_conversations,
  public.together_messages,
  public.together_memories,
  public.together_open_threads,
  public.together_life_events,
  public.together_knowledge_transfers,
  public.together_date_sessions,
  public.together_date_choices,
  public.together_moments,
  public.together_proactive_messages,
  public.together_notification_preferences,
  public.together_push_tokens,
  public.together_entitlements,
  public.together_safety_reports
to authenticated;

grant insert,update on table public.together_profiles to authenticated;
grant update,delete on table public.together_memories to authenticated;
grant insert,update,delete on table public.together_notification_preferences to authenticated;
grant insert on table public.together_analytics_events to authenticated;
grant insert on table public.together_safety_reports to authenticated;

commit;
