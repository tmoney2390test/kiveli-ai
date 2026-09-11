begin;

-- A normal open (including older deployed callers) must never retire a transcript.
create or replace function public.kivelle_start_conversation(p_user_id uuid,p_character_instance_id uuid)
returns public.together_conversations language plpgsql security definer set search_path=public,extensions as $$
declare current_chat public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));
  select * into current_chat from public.together_conversations
  where user_id=p_user_id and character_instance_id=p_character_instance_id
    and archived_at is null and user_archived_at is null and kind in ('direct','first_meeting')
  order by created_at desc,id desc limit 1;
  if found then return current_chat; end if;
  insert into public.together_conversations(user_id,character_instance_id,kind,title,last_read_at)
  values(p_user_id,p_character_instance_id,'direct','Chat',now()) returning * into current_chat;
  return current_chat;
end $$;
revoke all on function public.kivelle_start_conversation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_start_conversation(uuid,uuid) to service_role;

-- Only explicitly confirmed requests can replace an active transcript. Store the
-- request identity with the result so a lost response/retry cannot replace it again.
create unique index if not exists together_conversations_fresh_request_idx
on public.together_conversations(user_id,(metadata->>'freshChatRequestId'))
where metadata->>'freshChatRequestId' is not null;

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
comment on function public.kivelle_start_conversation(uuid,uuid) is 'Idempotently opens the current transcript. Never archives or replaces it.';
comment on function public.kivelle_start_fresh_conversation(uuid,uuid,uuid,uuid,text) is 'Explicit fresh-chat confirmation with expected-transcript guard and idempotent replay. Preserves messages, memories, media and relationship state.';
commit;
