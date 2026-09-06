begin;

-- Life state belongs to a user's character instance, which is already bound to
-- one continuity. It must never be stored on the shared character template.
alter table public.together_character_instances
  add column if not exists life_state text not null default 'alive',
  add column if not exists life_state_summary text,
  add column if not exists life_state_changed_at timestamptz,
  add column if not exists life_state_source_message_id uuid references public.together_messages(id) on delete set null,
  add column if not exists life_state_metadata jsonb not null default '{}'::jsonb;

alter table public.together_character_instances
  drop constraint if exists together_character_instances_life_state_check;
alter table public.together_character_instances
  add constraint together_character_instances_life_state_check
  check(life_state in ('alive','dead','undead'));

create index if not exists together_character_instances_continuity_life_state_idx
  on public.together_character_instances(user_id,continuity_id,life_state)
  where life_state<>'alive';

-- Defense in depth: even if a stale worker planned a reply before a fatal
-- state change, the database will not accept dialogue attributed to the dead
-- instance. System scene narration remains valid because it has no speaker.
create or replace function public.kivelle_prevent_dead_character_dialogue()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.role='assistant' and new.speaker_character_instance_id is not null and exists(
    select 1 from public.together_character_instances instance
    where instance.id=new.speaker_character_instance_id
      and instance.user_id=new.user_id
      and instance.life_state='dead'
  ) then
    raise exception using errcode='23514',message='DEAD_CHARACTER_CANNOT_SPEAK';
  end if;
  return new;
end;
$$;

drop trigger if exists together_messages_prevent_dead_character_dialogue on public.together_messages;
create trigger together_messages_prevent_dead_character_dialogue
before insert or update of role,speaker_character_instance_id,user_id
on public.together_messages for each row
execute function public.kivelle_prevent_dead_character_dialogue();

-- Direct chats need a non-dialogue terminal message when their sole character
-- is dead. This uses the same leased/idempotent turn contract as ordinary
-- replies but stores a system scene event with no speaking character.
create or replace function public.kivelle_commit_direct_system_message(
  p_turn_id uuid,
  p_lease_token uuid,
  p_anchor_character_instance_id uuid,
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
    select 1 from public.together_character_instances instance
    where instance.id=p_anchor_character_instance_id
      and instance.user_id=v_turn.user_id
      and instance.continuity_id=v_turn.continuity_id
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
    v_turn.conversation_id,v_turn.user_id,p_anchor_character_instance_id,null,
    'system',p_content,'complete',coalesce(p_provider_metadata,'{}'::jsonb),v_turn.id,v_turn.source_message_id,p_response_key
  ) returning id into v_message_id;
  update public.together_dialogue_turns
  set completed_action_count=completed_action_count+1,updated_at=clock_timestamp()
  where id=v_turn.id;
  return query select v_message_id,true;
end;
$$;

revoke all on function public.kivelle_commit_direct_system_message(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.kivelle_commit_direct_system_message(uuid,uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.kivelle_commit_group_system_message(
  p_turn_id uuid,
  p_version integer,
  p_anchor_character_instance_id uuid,
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
  where id=p_turn_id and version=p_version for update;
  if not found or v_turn.turn_kind<>'group' or v_turn.state<>'generating'
     or v_turn.lease_expires_at<=clock_timestamp() or v_turn.source_message_id is null then
    return;
  end if;
  if not exists(
    select 1 from public.together_character_instances instance
    where instance.id=p_anchor_character_instance_id
      and instance.user_id=v_turn.user_id
      and instance.continuity_id=v_turn.continuity_id
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
    v_turn.conversation_id,v_turn.user_id,p_anchor_character_instance_id,null,
    'system',p_content,'complete',coalesce(p_provider_metadata,'{}'::jsonb),v_turn.id,v_turn.source_message_id,p_response_key
  ) returning id into v_message_id;
  update public.together_dialogue_turns
  set completed_action_count=completed_action_count+1,updated_at=clock_timestamp()
  where id=v_turn.id and version=p_version;
  return query select v_message_id,true;
end;
$$;

revoke all on function public.kivelle_commit_group_system_message(uuid,integer,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.kivelle_commit_group_system_message(uuid,integer,uuid,text,jsonb,text) to service_role;

comment on column public.together_character_instances.life_state is
  'Per-user, per-continuity canonical life state. Never copy this value to a shared character template.';
comment on function public.kivelle_prevent_dead_character_dialogue() is
  'Rejects newly inserted dialogue attributed to a character instance that is dead in that user continuity.';

commit;
