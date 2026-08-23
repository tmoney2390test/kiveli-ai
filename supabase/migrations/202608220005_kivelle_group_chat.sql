begin;

alter table public.together_conversations drop constraint if exists together_conversations_kind_check;
alter table public.together_conversations add constraint together_conversations_kind_check
  check(kind in('first_meeting','direct','date','introduction','shared_scene','group'));
alter table public.together_conversations add column if not exists message_sequence bigint not null default 0;

create table if not exists public.together_conversation_participants(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  role text not null default 'member' check(role in('member','owner_companion')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  added_by text not null default 'user' check(added_by in('user','shared_scene','system')),
  witnessed_from_sequence bigint not null default 1 check(witnessed_from_sequence>=1),
  witnessed_to_sequence bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(left_at is null or left_at>=joined_at),
  check(witnessed_to_sequence is null or witnessed_to_sequence>=witnessed_from_sequence)
);
create unique index if not exists together_conversation_participant_active_idx
  on public.together_conversation_participants(conversation_id,character_instance_id) where left_at is null;
create index if not exists together_conversation_participants_roster_idx
  on public.together_conversation_participants(conversation_id,joined_at) where left_at is null;
create index if not exists together_conversation_participants_character_idx
  on public.together_conversation_participants(character_instance_id,joined_at desc);

create table if not exists public.together_dialogue_turns(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  source_message_id uuid references public.together_messages(id) on delete set null,
  state text not null default 'planning' check(state in('planning','generating','yielded','completed','cancelled','failed')),
  version integer not null default 1 check(version>=1),
  planned_actions jsonb not null default '[]'::jsonb check(jsonb_typeof(planned_actions)='array'),
  completed_action_count integer not null default 0 check(completed_action_count>=0),
  yielded_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists together_dialogue_turns_active_idx
  on public.together_dialogue_turns(conversation_id,created_at desc) where state in('planning','generating');

alter table public.together_messages
  add column if not exists conversation_sequence bigint,
  add column if not exists reply_to_message_id uuid references public.together_messages(id) on delete set null,
  add column if not exists mentioned_character_instance_ids uuid[] not null default '{}'::uuid[],
  add column if not exists dialogue_turn_id uuid references public.together_dialogue_turns(id) on delete set null;
create unique index if not exists together_messages_conversation_sequence_idx
  on public.together_messages(conversation_id,conversation_sequence) where conversation_sequence is not null;
create index if not exists together_messages_group_turn_idx
  on public.together_messages(dialogue_turn_id,created_at) where dialogue_turn_id is not null;

create table if not exists public.together_message_reactions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  message_id uuid not null references public.together_messages(id) on delete cascade,
  reactor_character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  reaction text not null check(reaction in('❤️','😂','😮','😏','👍','👀')),
  dialogue_turn_id uuid references public.together_dialogue_turns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(message_id,reactor_character_instance_id,reaction)
);
create index if not exists together_message_reactions_conversation_idx
  on public.together_message_reactions(conversation_id,created_at);

alter table public.together_memories
  add column if not exists visibility text not null default 'private_to_character'
    check(visibility in('private_to_character','group_visible','scene_witnessed','public_canonical')),
  add column if not exists group_conversation_id uuid references public.together_conversations(id) on delete set null,
  add column if not exists learned_conversation_sequence bigint;
create index if not exists together_memories_group_visibility_idx
  on public.together_memories(group_conversation_id,character_instance_id,learned_conversation_sequence)
  where visibility='group_visible' and status='active';

-- Keep the existing single-subject media pipeline intact while making group
-- subjects explicit for future multi-character composition. The canonical
-- character_instance_id remains the initiating/speaking companion in v1.
alter table public.together_generated_media
  add column if not exists subject_character_instance_ids uuid[] not null default '{}'::uuid[];
alter table public.together_media_offers
  add column if not exists subject_character_instance_ids uuid[] not null default '{}'::uuid[];
update public.together_generated_media set subject_character_instance_ids=array[character_instance_id]
where cardinality(subject_character_instance_ids)=0 and character_instance_id is not null;
update public.together_media_offers set subject_character_instance_ids=array[character_instance_id]
where cardinality(subject_character_instance_ids)=0 and character_instance_id is not null;
create index if not exists together_generated_media_subjects_idx
  on public.together_generated_media using gin(subject_character_instance_ids);
create index if not exists together_media_offers_subjects_idx
  on public.together_media_offers using gin(subject_character_instance_ids);

create or replace function public.kivelle_assign_group_message_sequence() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_kind text;v_sequence bigint;
begin
  select kind into v_kind from public.together_conversations where id=new.conversation_id and user_id=new.user_id;
  if v_kind<>'group' or new.conversation_sequence is not null then return new; end if;
  update public.together_conversations set message_sequence=message_sequence+1
  where id=new.conversation_id and user_id=new.user_id returning message_sequence into v_sequence;
  if v_sequence is null then raise exception 'GROUP_CONVERSATION_UNAVAILABLE'; end if;
  new.conversation_sequence:=v_sequence;
  return new;
end;
$$;
drop trigger if exists together_messages_group_sequence on public.together_messages;
create trigger together_messages_group_sequence before insert on public.together_messages
for each row execute function public.kivelle_assign_group_message_sequence();

create or replace function public.kivelle_validate_group_participant() returns trigger
language plpgsql set search_path=public as $$
declare v_conversation public.together_conversations%rowtype;v_instance public.together_character_instances%rowtype;
begin
  select * into v_conversation from public.together_conversations where id=new.conversation_id;
  select * into v_instance from public.together_character_instances where id=new.character_instance_id;
  if v_conversation.id is null or v_conversation.kind<>'group' or v_conversation.user_id<>new.user_id or v_conversation.continuity_id<>new.continuity_id then
    raise exception 'participant must belong to a group conversation in the same Life';
  end if;
  if v_instance.id is null or v_instance.user_id<>new.user_id or v_instance.continuity_id<>new.continuity_id then
    raise exception 'participant character must belong to the same user and Life';
  end if;
  return new;
end;
$$;
drop trigger if exists together_conversation_participants_validate on public.together_conversation_participants;
create trigger together_conversation_participants_validate before insert or update of user_id,continuity_id,conversation_id,character_instance_id
on public.together_conversation_participants for each row execute function public.kivelle_validate_group_participant();

create or replace function public.kivelle_validate_group_reaction() returns trigger
language plpgsql set search_path=public as $$
declare v_message_user uuid;v_message_conversation uuid;v_message_scene uuid;
begin
  select user_id,conversation_id,scene_session_id into v_message_user,v_message_conversation,v_message_scene from public.together_messages where id=new.message_id;
  if v_message_user is null or v_message_user<>new.user_id or v_message_conversation<>new.conversation_id then raise exception 'reaction must match its message'; end if;
  if not exists(select 1 from public.together_conversation_participants p where p.conversation_id=new.conversation_id and p.character_instance_id=new.reactor_character_instance_id and p.left_at is null)
     and not(v_message_scene is not null and exists(select 1 from public.together_scene_participants p where p.scene_session_id=v_message_scene and p.character_instance_id=new.reactor_character_instance_id and p.left_at is null)) then
    raise exception 'reactor must be an active group or Shared Scene participant';
  end if;
  return new;
end;
$$;
drop trigger if exists together_message_reactions_validate on public.together_message_reactions;
create trigger together_message_reactions_validate before insert or update on public.together_message_reactions
for each row execute function public.kivelle_validate_group_reaction();

create or replace function public.kivelle_commit_group_message(
  p_turn_id uuid,p_version integer,p_speaker_character_instance_id uuid,p_content text,p_provider_metadata jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_turn public.together_dialogue_turns%rowtype;v_message_id uuid;
begin
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version then return null;end if;
  if not exists(select 1 from public.together_conversations c where c.id=v_turn.conversation_id and c.kind='group' and c.archived_at is null) then return null;end if;
  if not exists(select 1 from public.together_conversation_participants p where p.conversation_id=v_turn.conversation_id and p.character_instance_id=p_speaker_character_instance_id and p.left_at is null) then return null;end if;
  insert into public.together_messages(conversation_id,user_id,character_instance_id,speaker_character_instance_id,role,content,delivery_status,provider_metadata,dialogue_turn_id)
  values(v_turn.conversation_id,v_turn.user_id,p_speaker_character_instance_id,p_speaker_character_instance_id,'assistant',p_content,'complete',coalesce(p_provider_metadata,'{}'::jsonb)||jsonb_build_object('source','group_chat','groupTurnId',p_turn_id),p_turn_id)
  returning id into v_message_id;
  update public.together_dialogue_turns set completed_action_count=completed_action_count+1,updated_at=now() where id=p_turn_id;
  return v_message_id;
end;
$$;

create or replace function public.kivelle_commit_group_reaction(
  p_turn_id uuid,p_version integer,p_speaker_character_instance_id uuid,p_message_id uuid,p_reaction text,p_metadata jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_turn public.together_dialogue_turns%rowtype;v_reaction_id uuid;
begin
  select * into v_turn from public.together_dialogue_turns where id=p_turn_id for update;
  if v_turn.id is null or v_turn.state<>'generating' or v_turn.version<>p_version then return null;end if;
  if p_reaction not in('❤️','😂','😮','😏','👍','👀') then return null;end if;
  if not exists(select 1 from public.together_conversations c where c.id=v_turn.conversation_id and c.kind='group' and c.archived_at is null) then return null;end if;
  if not exists(select 1 from public.together_conversation_participants p where p.conversation_id=v_turn.conversation_id and p.character_instance_id=p_speaker_character_instance_id and p.left_at is null) then return null;end if;
  insert into public.together_message_reactions(user_id,continuity_id,conversation_id,message_id,reactor_character_instance_id,reaction,dialogue_turn_id,metadata)
  values(v_turn.user_id,v_turn.continuity_id,v_turn.conversation_id,p_message_id,p_speaker_character_instance_id,p_reaction,p_turn_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('source','group_director'))
  on conflict(message_id,reactor_character_instance_id,reaction) do update set metadata=together_message_reactions.metadata||excluded.metadata
  returning id into v_reaction_id;
  update public.together_dialogue_turns set completed_action_count=completed_action_count+1,updated_at=now() where id=p_turn_id;
  return v_reaction_id;
end;
$$;
revoke all on function public.kivelle_commit_group_message(uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.kivelle_commit_group_reaction(uuid,integer,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_commit_group_message(uuid,integer,uuid,text,jsonb) to service_role;
grant execute on function public.kivelle_commit_group_reaction(uuid,integer,uuid,uuid,text,jsonb) to service_role;

-- Group user messages retain a non-null compatibility anchor, but must not
-- accidentally progress only that anchor character through legacy triggers.
drop trigger if exists together_message_relationship_evidence_v2 on public.together_messages;
create trigger together_message_relationship_evidence_v2 after insert on public.together_messages
for each row when(coalesce(new.provider_metadata->>'source','')<>'group_chat') execute function public.kivelle_message_relationship_evidence_v2();
drop trigger if exists together_messages_record_relationship_day on public.together_messages;
create trigger together_messages_record_relationship_day after insert on public.together_messages
for each row when(coalesce(new.provider_metadata->>'source','')<>'group_chat') execute function public.kivelle_record_relationship_active_day();
drop trigger if exists together_message_missed_commitment_repair on public.together_messages;
create trigger together_message_missed_commitment_repair after insert on public.together_messages
for each row when(coalesce(new.provider_metadata->>'source','')<>'group_chat') execute function public.kivelle_capture_missed_commitment_explanation();

alter table public.together_conversation_participants enable row level security;
alter table public.together_dialogue_turns enable row level security;
alter table public.together_message_reactions enable row level security;
drop policy if exists together_conversation_participants_own_read on public.together_conversation_participants;
create policy together_conversation_participants_own_read on public.together_conversation_participants for select to authenticated using(user_id=auth.uid());
drop policy if exists together_dialogue_turns_own_read on public.together_dialogue_turns;
create policy together_dialogue_turns_own_read on public.together_dialogue_turns for select to authenticated using(user_id=auth.uid());
drop policy if exists together_message_reactions_own_read on public.together_message_reactions;
create policy together_message_reactions_own_read on public.together_message_reactions for select to authenticated using(user_id=auth.uid());
grant select on public.together_conversation_participants,public.together_dialogue_turns,public.together_message_reactions to authenticated;

do $$
declare target_user_id uuid;
begin
  select id into target_user_id from auth.users where lower(email)=lower('test7@test.com') limit 1;
  if target_user_id is null then raise exception 'test7@test.com does not exist; group-chat testing grant was not applied';end if;
  insert into public.together_entitlements as entitlement(user_id,tier,entitlement_keys,metadata)
  values(target_user_id,'free',array['group_chat']::text[],jsonb_build_object('entitlementOverrides',jsonb_build_object(
    'grants',jsonb_build_array('group_chat'),'reason','Approved Kivelle group-chat testing allowance','scope','test7@test.com','migration','202608220005')))
  on conflict(user_id) do update set
    entitlement_keys=(select array_agg(distinct key order by key) from unnest(coalesce(entitlement.entitlement_keys,'{}'::text[])||array['group_chat']::text[]) key),
    metadata=coalesce(entitlement.metadata,'{}'::jsonb)||jsonb_build_object('entitlementOverrides',coalesce(entitlement.metadata->'entitlementOverrides','{}'::jsonb)||jsonb_build_object(
      'grants',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from(select distinct value key from jsonb_array_elements_text(coalesce(entitlement.metadata#>'{entitlementOverrides,grants}','[]'::jsonb)) union select 'group_chat') grants),
      'reason','Approved Kivelle group-chat testing allowance','scope','test7@test.com','migration','202608220005')),
    updated_at=now();
end $$;

comment on table public.together_conversation_participants is 'Witness-bounded authoritative roster for persistent multi-character group conversations.';
comment on table public.together_dialogue_turns is 'Versioned, interruptible group conversational floor state.';
comment on table public.together_message_reactions is 'Attributed character reactions in a canonical conversation.';
comment on column public.together_memories.visibility is 'Audience boundary; private is the default and group facts are materialized only for legitimate witnesses.';

commit;
