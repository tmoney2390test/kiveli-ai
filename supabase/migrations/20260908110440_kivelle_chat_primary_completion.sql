begin;

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
  -- Match acquisition lock order: conversation, then turn, then message/credit receipt.
  perform 1 from public.together_conversations c
  join public.together_dialogue_turns t on t.conversation_id=c.id
  where t.id=p_turn_id and t.lease_token=p_lease_token for update of c;
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

-- Only service handlers may mark a committed primary as ready for user takeover.
create or replace function public.kivelle_mark_direct_primary_complete(p_turn_id uuid,p_lease_token uuid,p_message_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.together_conversations c join public.together_dialogue_turns t on t.conversation_id=c.id
 where t.id=p_turn_id and t.lease_token=p_lease_token for update of c;
 update public.together_dialogue_turns t set metadata=t.metadata||jsonb_build_object('primaryCommitted',true,'primaryMessageId',p_message_id),updated_at=clock_timestamp()
 where t.id=p_turn_id and t.lease_token=p_lease_token and t.turn_kind='direct' and t.state='generating'
 and t.lease_expires_at>clock_timestamp() and exists(
   select 1 from public.together_messages m where m.id=p_message_id and m.dialogue_turn_id=t.id
   and m.conversation_id=t.conversation_id and m.user_id=t.user_id and m.role='assistant' and m.delivery_status='complete'
   and m.response_key='direct:'||t.request_id||':primary'
 );
 return found;
end;
$$;
revoke all on function public.kivelle_mark_direct_primary_complete(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_mark_direct_primary_complete(uuid,uuid,uuid) to service_role;

-- Same transaction and lock as normal acquisition. A pending primary cannot be interrupted.
create or replace function public.kivelle_begin_direct_dialogue_turn_v2(
 p_user_id uuid,p_continuity_id uuid,p_conversation_id uuid,p_request_id text,p_lease_seconds integer default 180
) returns table(turn_id uuid,lease_token uuid,acquired boolean,active_state text,active_request_id text,interrupted_count integer)
language plpgsql security definer set search_path=public as $$
declare prior_turn public.together_dialogue_turns%rowtype; can_supersede boolean:=false; quote_row record;
begin
 perform 1 from public.together_conversations c where c.id=p_conversation_id and c.user_id=p_user_id
 and c.continuity_id=p_continuity_id and c.archived_at is null and c.user_archived_at is null for update;
 if not found then raise exception 'conversation unavailable'; end if;
 select * into prior_turn from public.together_dialogue_turns t
 where t.conversation_id=p_conversation_id and t.state in ('planning','generating') order by t.created_at desc limit 1 for update;
 can_supersede:=found and prior_turn.turn_kind='direct' and prior_turn.state='generating'
 and prior_turn.request_id<>p_request_id and prior_turn.metadata->>'primaryCommitted'='true'
 and exists(select 1 from public.together_messages m where m.dialogue_turn_id=prior_turn.id
   and m.response_key='direct:'||prior_turn.request_id||':primary' and m.role='assistant' and m.delivery_status='complete');
 return query select * from public.kivelle_begin_dialogue_turn(p_user_id,p_continuity_id,p_conversation_id,p_request_id,'direct',coalesce(can_supersede,false),p_lease_seconds);
 if exists(select 1 from public.together_dialogue_turns t where t.id=prior_turn.id and t.state in ('cancelled','failed')) then
  -- Refund the unused part before the new turn reserves its own context quote.
  for quote_row in select q.id from public.together_context_quotes q where q.turn_id=prior_turn.id and q.status='reserved' loop
   perform public.kivelle_close_context(quote_row.id);
  end loop;
 end if;
end;
$$;
revoke all on function public.kivelle_begin_direct_dialogue_turn_v2(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.kivelle_begin_direct_dialogue_turn_v2(uuid,uuid,uuid,text,integer) to service_role;

create or replace function public.kivelle_commit_group_message(
  p_turn_id uuid,p_version integer,p_speaker_character_instance_id uuid,p_content text,p_provider_metadata jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_turn public.together_dialogue_turns%rowtype;
  v_message_id uuid;
  v_response_key text;
  v_inserted boolean:=false;
begin
  perform 1 from public.together_conversations c join public.together_dialogue_turns t on t.conversation_id=c.id where t.id=p_turn_id for update of c;
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version or v_turn.lease_expires_at<=clock_timestamp() then return null;end if;
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
  perform 1 from public.together_conversations c join public.together_dialogue_turns t on t.conversation_id=c.id where t.id=p_turn_id for update of c;
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version or v_turn.lease_expires_at<=clock_timestamp() then return;end if;
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



-- Group interruption also settles the old request before reserving the next one.
create or replace function public.kivelle_begin_group_dialogue_turn_v2(
 p_user_id uuid,p_continuity_id uuid,p_conversation_id uuid,p_request_id text,p_lease_seconds integer default 240
) returns table(turn_id uuid,lease_token uuid,acquired boolean,active_state text,active_request_id text,interrupted_count integer)
language plpgsql security definer set search_path=public as $$
declare quote_row record;
begin
 perform 1 from public.together_conversations c where c.id=p_conversation_id and c.user_id=p_user_id
 and c.continuity_id=p_continuity_id and c.kind='group' and c.archived_at is null and c.user_archived_at is null for update;
 if not found then raise exception 'conversation unavailable'; end if;
 return query select * from public.kivelle_begin_dialogue_turn(p_user_id,p_continuity_id,p_conversation_id,p_request_id,'group',true,p_lease_seconds);
 for quote_row in select q.id from public.together_context_quotes q join public.together_dialogue_turns t on t.id=q.turn_id
 where t.conversation_id=p_conversation_id and t.state in ('cancelled','failed') and q.status='reserved' loop
  perform public.kivelle_close_context(quote_row.id);
 end loop;
end;
$$;
revoke all on function public.kivelle_begin_group_dialogue_turn_v2(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.kivelle_begin_group_dialogue_turn_v2(uuid,uuid,uuid,text,integer) to service_role;

commit;
