begin;

-- Chat already subscribes to these user-owned rows. Publish them so a
-- schedule regeneration or an active-scene move can update the place artwork
-- without a page refresh. RLS remains the authorization boundary.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='together_character_schedule_events'
    ) then
      alter publication supabase_realtime add table public.together_character_schedule_events;
    end if;
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='together_scene_sessions'
    ) then
      alter publication supabase_realtime add table public.together_scene_sessions;
    end if;
  end if;
end $$;

commit;
