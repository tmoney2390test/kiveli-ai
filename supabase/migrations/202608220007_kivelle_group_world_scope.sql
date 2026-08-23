begin;

alter table public.together_conversations
  add column if not exists group_world_id uuid references public.together_worlds(id) on delete restrict;

create index if not exists together_conversations_group_world_idx
  on public.together_conversations(user_id,continuity_id,group_world_id,last_message_at desc)
  where kind='group' and archived_at is null;

create or replace function public.kivelle_character_resident_world(p_character_instance_id uuid)
returns uuid
language sql stable security definer set search_path=public as $$
  select case when count(distinct presence.world_id)=1
    then (array_agg(distinct presence.world_id))[1]
    else null
  end
  from public.together_character_instances instance
  join public.together_character_world_presence presence
    on presence.character_version_id=instance.character_version_id
   and presence.presence_type='resident'
  where instance.id=p_character_instance_id
$$;

revoke all on function public.kivelle_character_resident_world(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_character_resident_world(uuid) to service_role;

-- Safely scope any pre-existing group whose active roster already resolves to
-- one resident world. Mixed or incomplete legacy groups are left untouched;
-- the NOT VALID constraint protects every new/updated row without destroying
-- old conversation data.
with participant_worlds as(
  select conversation.id,
    count(*) as participant_count,
    count(world.world_id) as resolved_count,
    count(distinct world.world_id) as world_count,
    (array_agg(distinct world.world_id) filter(where world.world_id is not null))[1] as world_id
  from public.together_conversations conversation
  join public.together_conversation_participants participant
    on participant.conversation_id=conversation.id and participant.left_at is null
  left join lateral(
    select public.kivelle_character_resident_world(participant.character_instance_id) as world_id
  ) world on true
  where conversation.kind='group'
  group by conversation.id
)
update public.together_conversations conversation
set group_world_id=scope.world_id,
  metadata=coalesce(conversation.metadata,'{}'::jsonb)||jsonb_build_object('groupWorldId',scope.world_id),
  updated_at=now()
from participant_worlds scope
where conversation.id=scope.id
  and scope.participant_count=scope.resolved_count
  and scope.world_count=1
  and conversation.group_world_id is null;

alter table public.together_conversations
  drop constraint if exists together_group_conversations_require_world;
alter table public.together_conversations
  add constraint together_group_conversations_require_world
  check(kind<>'group' or group_world_id is not null) not valid;

create or replace function public.kivelle_validate_group_conversation_world()
returns trigger
language plpgsql set search_path=public as $$
begin
  if new.kind='group' then
    if new.group_world_id is null then
      raise exception 'group conversation requires a canonical world';
    end if;
    if exists(
      select 1 from public.together_conversation_participants participant
      where participant.conversation_id=new.id
        and participant.left_at is null
        and public.kivelle_character_resident_world(participant.character_instance_id)
          is distinct from new.group_world_id
    ) then
      raise exception 'group world must match every active participant';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists together_conversations_validate_group_world
  on public.together_conversations;
create trigger together_conversations_validate_group_world
before insert or update of kind,group_world_id on public.together_conversations
for each row execute function public.kivelle_validate_group_conversation_world();

create or replace function public.kivelle_validate_group_participant() returns trigger
language plpgsql set search_path=public as $$
declare
  v_conversation public.together_conversations%rowtype;
  v_instance public.together_character_instances%rowtype;
  v_resident_world uuid;
begin
  select * into v_conversation from public.together_conversations where id=new.conversation_id;
  select * into v_instance from public.together_character_instances where id=new.character_instance_id;
  if v_conversation.id is null or v_conversation.kind<>'group' or v_conversation.user_id<>new.user_id or v_conversation.continuity_id<>new.continuity_id then
    raise exception 'participant must belong to a group conversation in the same Life';
  end if;
  if v_instance.id is null or v_instance.user_id<>new.user_id or v_instance.continuity_id<>new.continuity_id then
    raise exception 'participant character must belong to the same user and Life';
  end if;
  v_resident_world:=public.kivelle_character_resident_world(new.character_instance_id);
  if v_resident_world is null then
    raise exception 'participant must have exactly one canonical resident world';
  end if;
  if v_conversation.group_world_id is null or v_resident_world<>v_conversation.group_world_id then
    raise exception 'participant resident world must match the group world';
  end if;
  return new;
end;
$$;

comment on column public.together_conversations.group_world_id
  is 'Canonical resident world shared by every participant in a persistent group chat.';
comment on function public.kivelle_character_resident_world(uuid)
  is 'Resolves exactly one authored resident world for a character instance; ambiguous or missing assignments return null.';

commit;
