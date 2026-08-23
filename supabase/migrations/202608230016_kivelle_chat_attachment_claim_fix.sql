begin;

create or replace function public.kivelle_claim_chat_user_message(
  p_user_id uuid,
  p_continuity_id uuid,
  p_conversation_id uuid,
  p_character_instance_id uuid,
  p_content text,
  p_client_request_id text,
  p_provider_metadata jsonb default '{}'::jsonb,
  p_attachment_ids uuid[] default '{}'::uuid[],
  p_reply_to_message_id uuid default null,
  p_mentioned_character_instance_ids uuid[] default '{}'::uuid[]
) returns table(message_id uuid,created boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_conversation public.together_conversations%rowtype;
  v_existing public.together_messages%rowtype;
  v_message_id uuid;
  v_expected_attachments integer:=coalesce(cardinality(p_attachment_ids),0);
  v_matching_attachments integer:=0;
  v_claimed_attachments integer:=0;
  v_fingerprint text:=nullif(coalesce(p_provider_metadata,'{}'::jsonb)->>'requestFingerprint','');
begin
  if nullif(trim(p_client_request_id),'') is null
     or p_client_request_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='INVALID_CHAT_REQUEST_ID';
  end if;
  if nullif(trim(p_content),'') is null or char_length(p_content)>12000 then
    raise exception using errcode='22023',message='INVALID_CHAT_MESSAGE';
  end if;
  if v_expected_attachments>4 or v_expected_attachments<>(select count(distinct attachment.id) from unnest(coalesce(p_attachment_ids,'{}'::uuid[])) as attachment(id)) then
    raise exception using errcode='22023',message='INVALID_CHAT_ATTACHMENTS';
  end if;

  select * into v_conversation from public.together_conversations
  where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id
    and archived_at is null and user_archived_at is null
  for update;
  if not found then raise exception using errcode='P0002',message='CHAT_CONVERSATION_UNAVAILABLE'; end if;

  if not exists(
    select 1 from public.together_character_instances i
    where i.id=p_character_instance_id and i.user_id=p_user_id and i.continuity_id=p_continuity_id
  ) then raise exception using errcode='22023',message='CHAT_CHARACTER_UNAVAILABLE'; end if;
  if v_conversation.kind='group' then
    if not exists(
      select 1 from public.together_conversation_participants p
      where p.conversation_id=p_conversation_id and p.user_id=p_user_id
        and p.continuity_id=p_continuity_id and p.character_instance_id=p_character_instance_id and p.left_at is null
    ) then raise exception using errcode='22023',message='CHAT_CHARACTER_NOT_PARTICIPANT'; end if;
  elsif v_conversation.character_instance_id<>p_character_instance_id then
    raise exception using errcode='22023',message='CHAT_CHARACTER_MISMATCH';
  end if;

  select * into v_existing from public.together_messages
  where conversation_id=p_conversation_id and client_request_id=p_client_request_id
  limit 1;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.role<>'user' then
      raise exception using errcode='22023',message='CHAT_REQUEST_OWNERSHIP_MISMATCH';
    end if;
    if v_fingerprint is not null
       and nullif(v_existing.provider_metadata->>'requestFingerprint','') is distinct from v_fingerprint then
      raise exception using errcode='22023',message='CHAT_REQUEST_PAYLOAD_MISMATCH';
    end if;
    return query select v_existing.id,false;
    return;
  end if;

  if p_reply_to_message_id is not null and not exists(
    select 1 from public.together_messages m
    where m.id=p_reply_to_message_id and m.conversation_id=p_conversation_id and m.user_id=p_user_id
  ) then raise exception using errcode='22023',message='CHAT_REPLY_TARGET_UNAVAILABLE'; end if;

  if coalesce(cardinality(p_mentioned_character_instance_ids),0)>0 then
    if v_conversation.kind<>'group' or exists(
      select 1 from unnest(p_mentioned_character_instance_ids) mentioned(id)
      where not exists(
        select 1 from public.together_conversation_participants p
        where p.conversation_id=p_conversation_id and p.user_id=p_user_id
          and p.continuity_id=p_continuity_id and p.character_instance_id=mentioned.id and p.left_at is null
      )
    ) then raise exception using errcode='22023',message='CHAT_MENTION_UNAVAILABLE'; end if;
  end if;

  if v_expected_attachments>0 then
    select count(*)::integer into v_matching_attachments
    from public.together_conversation_attachments a
    where a.id=any(p_attachment_ids) and a.user_id=p_user_id and a.continuity_id=p_continuity_id
      and a.conversation_id=p_conversation_id and a.kind='image' and a.upload_status='uploaded' and a.message_id is null;
    if v_matching_attachments<>v_expected_attachments then
      raise exception using errcode='22023',message='CHAT_ATTACHMENT_UNAVAILABLE';
    end if;
  end if;

  insert into public.together_messages(
    conversation_id,user_id,character_instance_id,role,content,client_request_id,
    delivery_status,provider_metadata,reply_to_message_id,mentioned_character_instance_ids
  ) values(
    p_conversation_id,p_user_id,p_character_instance_id,'user',p_content,p_client_request_id,
    'complete',coalesce(p_provider_metadata,'{}'::jsonb),p_reply_to_message_id,
    coalesce(p_mentioned_character_instance_ids,'{}'::uuid[])
  ) returning id into v_message_id;

  if v_expected_attachments>0 then
    update public.together_conversation_attachments as attachment set
      message_id=v_message_id,updated_at=clock_timestamp()
    where attachment.id=any(p_attachment_ids) and attachment.user_id=p_user_id and attachment.continuity_id=p_continuity_id
      and attachment.conversation_id=p_conversation_id and attachment.kind='image' and attachment.upload_status='uploaded' and attachment.message_id is null;
    get diagnostics v_claimed_attachments=row_count;
    if v_claimed_attachments<>v_expected_attachments then
      raise exception using errcode='40001',message='CHAT_ATTACHMENT_CLAIM_RACE';
    end if;
  end if;

  return query select v_message_id,true;
end;
$$;

revoke all on function public.kivelle_claim_chat_user_message(uuid,uuid,uuid,uuid,text,text,jsonb,uuid[],uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.kivelle_claim_chat_user_message(uuid,uuid,uuid,uuid,text,text,jsonb,uuid[],uuid,uuid[]) to service_role;

commit;
