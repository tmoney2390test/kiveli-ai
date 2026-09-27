create or replace function public.kivelle_start_fresh_conversation(
  p_user_id uuid,p_character_instance_id uuid,p_expected_conversation_id uuid,
  p_request_id uuid,p_confirmation text
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  previous_chat public.together_conversations;
  new_chat public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if p_confirmation is distinct from 'start_fresh_chat' or p_request_id is null or p_expected_conversation_id is null then
    raise exception 'FRESH_CHAT_CONFIRMATION_REQUIRED';
  end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));
  select * into new_chat from public.together_conversations
  where user_id=p_user_id and metadata->>'freshChatRequestId'=p_request_id::text;
  if found then
    if new_chat.character_instance_id<>p_character_instance_id or new_chat.metadata->>'previousConversationId' is distinct from p_expected_conversation_id::text then
      raise exception 'FRESH_CHAT_REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('conversation',to_jsonb(new_chat),'replayed',true);
  end if;
  select * into previous_chat from public.together_conversations
  where user_id=p_user_id and character_instance_id=p_character_instance_id
    and archived_at is null and user_archived_at is null and kind in ('direct','first_meeting')
  order by created_at desc,id desc limit 1 for update;
  if not found or previous_chat.id<>p_expected_conversation_id then raise exception 'FRESH_CHAT_STALE'; end if;
  -- Do not move the user away while an accepted reply is being generated.
  if exists(select 1 from public.together_dialogue_turns where user_id=p_user_id
    and conversation_id=previous_chat.id and state in ('planning','generating')) then
    raise exception 'FRESH_CHAT_BUSY';
  end if;
  -- A confirmed new transcript restores this companion's ability to participate.
  -- Keep this after replay/stale/busy checks so retries cannot undo later events.
  update public.together_character_instances set life_state='alive',life_state_summary=null,
    life_state_changed_at=null,life_state_source_message_id=null,life_state_metadata='{}'::jsonb,updated_at=now()
  where id=p_character_instance_id and user_id=p_user_id;
  update public.together_proactive_messages set status=case when status='queued' then 'cancelled' else 'opened' end,updated_at=now()
  where user_id=p_user_id and character_instance_id=p_character_instance_id
    and conversation_id=previous_chat.id and status in ('queued','sent');
  update public.together_conversations set archived_at=now(),updated_at=now()
  where id=previous_chat.id and user_id=p_user_id;
  new_chat:=public.kivelle_start_conversation(p_user_id,p_character_instance_id);
  update public.together_conversations set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'freshChatRequestId',p_request_id,'previousConversationId',previous_chat.id,
    'freshChatConfirmedAt',now(),'chatPreferences',coalesce(previous_chat.metadata->'chatPreferences','{}'::jsonb)
  ) where id=new_chat.id and user_id=p_user_id returning * into new_chat;
  return jsonb_build_object('conversation',to_jsonb(new_chat),'replayed',false);
end $$;
revoke all on function public.kivelle_start_fresh_conversation(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelle_start_fresh_conversation(uuid,uuid,uuid,uuid,text) to service_role;
