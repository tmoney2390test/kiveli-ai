-- System timeline events use the same response key as assistant replies so a
-- retried dead-character turn cannot insert the same narration twice.  The
-- ownership trigger previously rejected every such insert because it only
-- allowed response keys on assistant rows.
create or replace function public.kivelle_validate_chat_message_ownership()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_conversation public.together_conversations%rowtype;
  v_instance_user_id uuid;
  v_instance_continuity_id uuid;
begin
  select * into v_conversation
  from public.together_conversations
  where id = new.conversation_id;

  if not found or v_conversation.user_id <> new.user_id then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_CONVERSATION_MISMATCH';
  end if;

  select user_id, continuity_id
  into v_instance_user_id, v_instance_continuity_id
  from public.together_character_instances
  where id = new.character_instance_id;

  if v_instance_user_id is null
     or v_instance_user_id <> new.user_id
     or v_instance_continuity_id <> v_conversation.continuity_id then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_CHARACTER_MISMATCH';
  end if;

  if new.speaker_character_instance_id is not null and not exists (
    select 1
    from public.together_character_instances instance
    where instance.id = new.speaker_character_instance_id
      and instance.user_id = new.user_id
      and instance.continuity_id = v_conversation.continuity_id
  ) then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_SPEAKER_MISMATCH';
  end if;

  if new.reply_to_message_id is not null and not exists (
    select 1
    from public.together_messages message
    where message.id = new.reply_to_message_id
      and message.user_id = new.user_id
      and message.conversation_id = new.conversation_id
  ) then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_REPLY_MISMATCH';
  end if;

  if new.response_to_message_id is not null and not exists (
    select 1
    from public.together_messages message
    where message.id = new.response_to_message_id
      and message.user_id = new.user_id
      and message.conversation_id = new.conversation_id
      and message.role = 'user'
  ) then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_RESPONSE_MISMATCH';
  end if;

  if new.dialogue_turn_id is not null and not exists (
    select 1
    from public.together_dialogue_turns turn_row
    where turn_row.id = new.dialogue_turn_id
      and turn_row.user_id = new.user_id
      and turn_row.conversation_id = new.conversation_id
  ) then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_TURN_MISMATCH';
  end if;

  if new.client_request_id is not null and new.role <> 'user' then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_REQUEST_ROLE_MISMATCH';
  end if;

  if new.response_key is not null and new.role not in ('assistant', 'system') then
    raise exception using errcode = '23514', message = 'CHAT_MESSAGE_RESPONSE_ROLE_MISMATCH';
  end if;

  return new;
end;
$function$;

comment on function public.kivelle_validate_chat_message_ownership()
is 'Validates conversation ownership and permits idempotent response keys only on assistant and system response rows.';
