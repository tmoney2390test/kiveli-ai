-- Scenario changes invalidate previously quoted conversation context, including
-- pause/resume operations that deliberately do not add duplicate opening messages.
create or replace function public.together_scenario_context_changed()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status='active' and not exists (
    select 1 from public.together_conversations c
    where c.id=new.conversation_id and c.user_id=new.user_id
      and c.continuity_id=new.continuity_id and c.character_instance_id=new.character_instance_id
      and c.archived_at is null and c.user_archived_at is null
      and c.kind in ('direct','first_meeting')
  ) then raise exception 'Scenario conversation unavailable' using errcode='42501'; end if;
  update public.together_conversations set updated_at=clock_timestamp()
    where id=new.conversation_id and user_id=new.user_id;
  return new;
end $$;
revoke all on function public.together_scenario_context_changed() from public,anon,authenticated;
grant execute on function public.together_scenario_context_changed() to service_role;
create trigger scenario_context_changed after insert or update of status
  on public.together_scenario_sessions for each row
  execute function public.together_scenario_context_changed();
