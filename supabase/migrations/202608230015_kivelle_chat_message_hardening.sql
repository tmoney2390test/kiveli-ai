begin;

-- Give every generated reply a durable causal link.  client_request_id remains
-- the idempotency key for the user's message; response_key is the equivalent
-- key for each server-authored response.  This prevents timestamp-based replay
-- from ever returning a proactive or unrelated response.
alter table public.together_messages
  add column if not exists response_to_message_id uuid references public.together_messages(id) on delete set null,
  add column if not exists response_key text;

alter table public.together_messages drop constraint if exists together_messages_response_key_length_check;
alter table public.together_messages add constraint together_messages_response_key_length_check
  check(response_key is null or char_length(response_key) between 8 and 240);

create unique index if not exists together_messages_response_key_idx
  on public.together_messages(conversation_id,response_key)
  where response_key is not null;
create index if not exists together_messages_response_to_idx
  on public.together_messages(conversation_id,response_to_message_id,created_at)
  where response_to_message_id is not null;

-- Defense in depth for every service-role writer, including proactive, call,
-- scene, and future message producers.  Foreign keys alone do not prove that
-- the conversation, character, reply, and turn all belong to the same user.
create or replace function public.kivelle_validate_chat_message_ownership() returns trigger
language plpgsql set search_path=public as $$
declare
  v_conversation public.together_conversations%rowtype;
  v_instance_user_id uuid;
  v_instance_continuity_id uuid;
begin
  select * into v_conversation from public.together_conversations where id=new.conversation_id;
  if not found or v_conversation.user_id<>new.user_id then
    raise exception using errcode='23514',message='CHAT_MESSAGE_CONVERSATION_MISMATCH';
  end if;
  select user_id,continuity_id into v_instance_user_id,v_instance_continuity_id
  from public.together_character_instances where id=new.character_instance_id;
  if v_instance_user_id is null or v_instance_user_id<>new.user_id or v_instance_continuity_id<>v_conversation.continuity_id then
    raise exception using errcode='23514',message='CHAT_MESSAGE_CHARACTER_MISMATCH';
  end if;
  if new.speaker_character_instance_id is not null and not exists(
    select 1 from public.together_character_instances i
    where i.id=new.speaker_character_instance_id and i.user_id=new.user_id and i.continuity_id=v_conversation.continuity_id
  ) then raise exception using errcode='23514',message='CHAT_MESSAGE_SPEAKER_MISMATCH'; end if;
  if new.reply_to_message_id is not null and not exists(
    select 1 from public.together_messages m
    where m.id=new.reply_to_message_id and m.user_id=new.user_id and m.conversation_id=new.conversation_id
  ) then raise exception using errcode='23514',message='CHAT_MESSAGE_REPLY_MISMATCH'; end if;
  if new.response_to_message_id is not null and not exists(
    select 1 from public.together_messages m
    where m.id=new.response_to_message_id and m.user_id=new.user_id and m.conversation_id=new.conversation_id and m.role='user'
  ) then raise exception using errcode='23514',message='CHAT_MESSAGE_RESPONSE_MISMATCH'; end if;
  if new.dialogue_turn_id is not null and not exists(
    select 1 from public.together_dialogue_turns t
    where t.id=new.dialogue_turn_id and t.user_id=new.user_id and t.conversation_id=new.conversation_id
  ) then raise exception using errcode='23514',message='CHAT_MESSAGE_TURN_MISMATCH'; end if;
  if new.client_request_id is not null and new.role<>'user' then
    raise exception using errcode='23514',message='CHAT_MESSAGE_REQUEST_ROLE_MISMATCH';
  end if;
  if new.response_key is not null and new.role<>'assistant' then
    raise exception using errcode='23514',message='CHAT_MESSAGE_RESPONSE_ROLE_MISMATCH';
  end if;
  return new;
end;
$$;
drop trigger if exists together_messages_validate_ownership on public.together_messages;
create trigger together_messages_validate_ownership
before insert or update of conversation_id,user_id,character_instance_id,speaker_character_instance_id,
  reply_to_message_id,response_to_message_id,dialogue_turn_id,client_request_id,response_key
on public.together_messages for each row execute function public.kivelle_validate_chat_message_ownership();

-- Claiming a canonical user message and its uploaded attachments is one
-- transaction.  A failed claim therefore cannot leave an attachment orphaned
-- or attached to a message the request did not create.
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

-- A direct response commits only while its turn still owns the floor.  A
-- repeated commit returns the existing canonical row rather than creating a
-- second assistant message or re-running downstream effects.
create or replace function public.kivelle_commit_direct_message(
  p_turn_id uuid,
  p_lease_token uuid,
  p_speaker_character_instance_id uuid,
  p_content text,
  p_provider_metadata jsonb,
  p_response_key text
) returns table(message_id uuid,created boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_turn public.together_dialogue_turns%rowtype;
  v_existing_id uuid;
  v_message_id uuid;
begin
  if nullif(trim(p_content),'') is null or char_length(p_content)>12000
     or nullif(trim(p_response_key),'') is null or char_length(p_response_key)>240 then
    raise exception using errcode='22023',message='INVALID_CHAT_RESPONSE';
  end if;
  select * into v_turn from public.together_dialogue_turns
  where id=p_turn_id and lease_token=p_lease_token for update;
  if not found or v_turn.turn_kind<>'direct' or v_turn.state<>'generating'
     or v_turn.lease_expires_at<=clock_timestamp() or v_turn.source_message_id is null then
    return;
  end if;
  if not exists(
    select 1 from public.together_character_instances i
    where i.id=p_speaker_character_instance_id and i.user_id=v_turn.user_id and i.continuity_id=v_turn.continuity_id
  ) then return; end if;
  select id into v_existing_id from public.together_messages
  where conversation_id=v_turn.conversation_id and response_key=p_response_key limit 1;
  if found then
    return query select v_existing_id,false;
    return;
  end if;
  insert into public.together_messages(
    conversation_id,user_id,character_instance_id,speaker_character_instance_id,
    role,content,delivery_status,provider_metadata,dialogue_turn_id,response_to_message_id,response_key
  ) values(
    v_turn.conversation_id,v_turn.user_id,p_speaker_character_instance_id,p_speaker_character_instance_id,
    'assistant',p_content,'complete',coalesce(p_provider_metadata,'{}'::jsonb),v_turn.id,v_turn.source_message_id,p_response_key
  ) returning id into v_message_id;
  update public.together_dialogue_turns set completed_action_count=completed_action_count+1,updated_at=clock_timestamp()
  where id=v_turn.id;
  return query select v_message_id,true;
end;
$$;
revoke all on function public.kivelle_commit_direct_message(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.kivelle_commit_direct_message(uuid,uuid,uuid,text,jsonb,text) to service_role;

-- Make group action commits idempotent as well.  New callers provide the
-- director's immutable action id; the content hash is a safe legacy fallback.
create or replace function public.kivelle_commit_group_message(
  p_turn_id uuid,p_version integer,p_speaker_character_instance_id uuid,p_content text,p_provider_metadata jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_turn public.together_dialogue_turns%rowtype;
  v_message_id uuid;
  v_response_key text;
  v_inserted boolean:=false;
begin
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version then return null;end if;
  if not exists(select 1 from public.together_conversations c where c.id=v_turn.conversation_id and c.user_id=v_turn.user_id and c.kind='group' and c.archived_at is null and c.user_archived_at is null) then return null;end if;
  if not exists(select 1 from public.together_conversation_participants p where p.conversation_id=v_turn.conversation_id and p.user_id=v_turn.user_id and p.character_instance_id=p_speaker_character_instance_id and p.left_at is null) then return null;end if;
  v_response_key:='group:'||p_turn_id::text||':'||coalesce(nullif(coalesce(p_provider_metadata,'{}'::jsonb)->>'groupActionId',''),'legacy:'||p_speaker_character_instance_id::text||':'||md5(p_content));
  insert into public.together_messages(
    conversation_id,user_id,character_instance_id,speaker_character_instance_id,role,content,
    delivery_status,provider_metadata,dialogue_turn_id,response_to_message_id,response_key
  ) values(
    v_turn.conversation_id,v_turn.user_id,p_speaker_character_instance_id,p_speaker_character_instance_id,'assistant',p_content,
    'complete',coalesce(p_provider_metadata,'{}'::jsonb)||jsonb_build_object('source','group_chat','groupTurnId',p_turn_id),
    p_turn_id,v_turn.source_message_id,v_response_key
  ) on conflict(conversation_id,response_key) where response_key is not null do nothing
  returning id into v_message_id;
  if v_message_id is not null then
    v_inserted:=true;
    update public.together_dialogue_turns set completed_action_count=completed_action_count+1,updated_at=clock_timestamp() where id=p_turn_id;
  else
    select id into v_message_id from public.together_messages
    where conversation_id=v_turn.conversation_id and response_key=v_response_key limit 1;
  end if;
  return v_message_id;
end;
$$;
revoke all on function public.kivelle_commit_group_message(uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_commit_group_message(uuid,integer,uuid,text,jsonb) to service_role;

create or replace function public.kivelle_commit_group_message_v2(
  p_turn_id uuid,p_version integer,p_speaker_character_instance_id uuid,p_content text,p_provider_metadata jsonb
) returns table(message_id uuid,created boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_turn public.together_dialogue_turns%rowtype;
  v_message_id uuid;
  v_response_key text;
begin
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version then return;end if;
  if not exists(select 1 from public.together_conversations c where c.id=v_turn.conversation_id and c.user_id=v_turn.user_id and c.kind='group' and c.archived_at is null and c.user_archived_at is null) then return;end if;
  if not exists(select 1 from public.together_conversation_participants p where p.conversation_id=v_turn.conversation_id and p.user_id=v_turn.user_id and p.character_instance_id=p_speaker_character_instance_id and p.left_at is null) then return;end if;
  v_response_key:='group:'||p_turn_id::text||':'||coalesce(nullif(coalesce(p_provider_metadata,'{}'::jsonb)->>'groupActionId',''),'legacy:'||p_speaker_character_instance_id::text||':'||md5(p_content));
  select id into v_message_id from public.together_messages
  where conversation_id=v_turn.conversation_id and response_key=v_response_key limit 1;
  if found then
    return query select v_message_id,false;
    return;
  end if;
  insert into public.together_messages(
    conversation_id,user_id,character_instance_id,speaker_character_instance_id,role,content,
    delivery_status,provider_metadata,dialogue_turn_id,response_to_message_id,response_key
  ) values(
    v_turn.conversation_id,v_turn.user_id,p_speaker_character_instance_id,p_speaker_character_instance_id,'assistant',p_content,
    'complete',coalesce(p_provider_metadata,'{}'::jsonb)||jsonb_build_object('source','group_chat','groupTurnId',p_turn_id),
    p_turn_id,v_turn.source_message_id,v_response_key
  ) returning id into v_message_id;
  update public.together_dialogue_turns set completed_action_count=completed_action_count+1,updated_at=clock_timestamp() where id=p_turn_id;
  return query select v_message_id,true;
end;
$$;
revoke all on function public.kivelle_commit_group_message_v2(uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_commit_group_message_v2(uuid,integer,uuid,text,jsonb) to service_role;

-- Permit an idempotent request whose earlier provider attempt failed before it
-- produced any canonical reply to reacquire its existing turn.  The same turn
-- id is retained so all response keys and audit history remain stable.
create or replace function public.kivelle_begin_dialogue_turn(
  p_user_id uuid,
  p_continuity_id uuid,
  p_conversation_id uuid,
  p_request_id text,
  p_turn_kind text,
  p_supersede_generating boolean default false,
  p_lease_seconds integer default 180
) returns table(
  turn_id uuid,
  lease_token uuid,
  acquired boolean,
  active_state text,
  active_request_id text,
  interrupted_count integer
)
language plpgsql security definer set search_path=public as $$
declare
  conversation_row public.together_conversations%rowtype;
  active_turn public.together_dialogue_turns%rowtype;
  request_turn public.together_dialogue_turns%rowtype;
  created_turn public.together_dialogue_turns%rowtype;
  interruption_count integer:=0;
  bounded_lease integer:=least(greatest(p_lease_seconds,30),600);
begin
  if p_turn_kind not in('direct','group','shared_scene') or nullif(trim(p_request_id),'') is null then
    raise exception 'invalid dialogue turn request';
  end if;
  select * into conversation_row from public.together_conversations
  where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id
    and archived_at is null and user_archived_at is null
  for update;
  if not found then raise exception 'conversation unavailable'; end if;

  update public.together_dialogue_turns set
    state='failed',version=version+1,
    metadata=metadata||'{"leaseExpired":true}'::jsonb,updated_at=clock_timestamp()
  where conversation_id=p_conversation_id and state in('planning','generating')
    and lease_expires_at<=clock_timestamp();

  select * into active_turn from public.together_dialogue_turns
  where conversation_id=p_conversation_id and state in('planning','generating')
  order by created_at desc limit 1 for update;
  if found then
    if active_turn.request_id=p_request_id then
      return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0;
      return;
    end if;
    if not p_supersede_generating or active_turn.state='planning' then
      return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0;
      return;
    end if;
    update public.together_dialogue_turns set
      state='cancelled',cancelled_at=clock_timestamp(),version=version+1,
      metadata=metadata||jsonb_build_object('supersededByRequestId',p_request_id),updated_at=clock_timestamp()
    where id=active_turn.id and state='generating';
    get diagnostics interruption_count=row_count;
  end if;

  select * into request_turn from public.together_dialogue_turns
  where conversation_id=p_conversation_id and request_id=p_request_id for update;
  if found then
    if request_turn.turn_kind<>p_turn_kind then raise exception 'dialogue turn kind mismatch'; end if;
    if request_turn.state in('failed','cancelled') or (
      request_turn.state in('completed','yielded') and request_turn.source_message_id is not null and not exists(
        select 1 from public.together_messages m
        where m.dialogue_turn_id=request_turn.id and m.role='assistant'
      )
    ) then
      update public.together_dialogue_turns set
        state='planning',version=version+1,lease_token=gen_random_uuid(),
        lease_expires_at=clock_timestamp()+make_interval(secs=>bounded_lease),
        yielded_at=null,cancelled_at=null,planned_actions='[]'::jsonb,completed_action_count=0,
        metadata=metadata||jsonb_build_object('retryCount',(case when coalesce(metadata->>'retryCount','')~'^[0-9]+$' then (metadata->>'retryCount')::integer else 0 end)+1),
        updated_at=clock_timestamp()
      where id=request_turn.id returning * into request_turn;
      return query select request_turn.id,request_turn.lease_token,true,request_turn.state,request_turn.request_id,interruption_count;
      return;
    end if;
    return query select request_turn.id,request_turn.lease_token,false,request_turn.state,request_turn.request_id,interruption_count;
    return;
  end if;

  insert into public.together_dialogue_turns(
    user_id,continuity_id,conversation_id,state,version,request_id,turn_kind,
    lease_token,lease_expires_at,planned_actions,metadata
  ) values(
    p_user_id,p_continuity_id,p_conversation_id,'planning',1,p_request_id,p_turn_kind,
    gen_random_uuid(),clock_timestamp()+make_interval(secs=>bounded_lease),'[]'::jsonb,'{}'::jsonb
  ) returning * into created_turn;
  return query select created_turn.id,created_turn.lease_token,true,created_turn.state,created_turn.request_id,interruption_count;
end;
$$;
revoke all on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;

commit;
