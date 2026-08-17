begin;

-- A fresh conversation is a new transcript, not a new relationship. Retire
-- notification records attached to an older transcript so Home cannot present
-- an already-consumed message as unread in the new chat.
update public.together_proactive_messages proactive
set status=case when proactive.status='queued' then 'cancelled' else 'opened' end,
    updated_at=now()
where proactive.status in ('queued','sent')
  and (
    proactive.conversation_id is null
    or not exists (
      select 1 from public.together_conversations conversation
      where conversation.id=proactive.conversation_id
        and conversation.archived_at is null
    )
    or (proactive.status='sent' and (
      proactive.sent_message_id is null
      or not exists(select 1 from public.together_messages message where message.id=proactive.sent_message_id)
    ))
  );

create or replace function public.kivelle_start_conversation(p_user_id uuid,p_character_instance_id uuid)
returns public.together_conversations language plpgsql security definer set search_path=public,extensions as $$
declare created public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));
  update public.together_proactive_messages set status=case when status='queued' then 'cancelled' else 'opened' end,updated_at=now()
    where user_id=p_user_id and character_instance_id=p_character_instance_id and status in ('queued','sent')
      and conversation_id in(select id from public.together_conversations where user_id=p_user_id and character_instance_id=p_character_instance_id and archived_at is null and kind in ('direct','first_meeting'));
  update public.together_conversations set archived_at=now(),updated_at=now()
    where user_id=p_user_id and character_instance_id=p_character_instance_id and archived_at is null and kind in ('direct','first_meeting');
  insert into public.together_conversations(user_id,character_instance_id,kind,title,summary,summary_through,summary_message_count,last_read_at)
    values(p_user_id,p_character_instance_id,'direct',to_char(current_timestamp,'FMDay FMMonth DD'),null,null,0,now()) returning * into created;
  return created;
end $$;

-- The full replacement reset writes resetAt into metadata. Keep the
-- relationship-day anchor explicit even if the table default changes later.
create or replace function public.kivelle_set_reset_relationship_anchor() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.metadata ? 'resetAt' then
    begin
      new.met_at := (new.metadata->>'resetAt')::timestamptz;
    exception when invalid_text_representation then
      new.met_at := coalesce(new.met_at,now());
    end;
  end if;
  return new;
end $$;
drop trigger if exists together_character_instances_reset_anchor on public.together_character_instances;
create trigger together_character_instances_reset_anchor
before insert or update of metadata on public.together_character_instances
for each row execute function public.kivelle_set_reset_relationship_anchor();

grant execute on function public.kivelle_start_conversation(uuid,uuid) to authenticated,service_role;
comment on function public.kivelle_start_conversation(uuid,uuid) is 'Starts a new transcript while preserving the relationship and retiring old transcript notifications.';
comment on function public.kivelle_set_reset_relationship_anchor() is 'Keeps full character resets anchored to their replacement creation time.';

commit;

