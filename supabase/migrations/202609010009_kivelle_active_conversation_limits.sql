begin;

create or replace function public.kivelle_active_conversation_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select case
    when entitlement.expires_at is not null and entitlement.expires_at<=current_timestamp then 5
    when entitlement.tier='kivelle_max' then 50
    when entitlement.tier='kivelle_plus' then 20
    else 5
  end
  from (select 1) seed
  left join public.together_entitlements entitlement on entitlement.user_id=p_user_id
$$;

create or replace function public.kivelle_enforce_active_conversation_limit()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  active_count integer;
  active_limit integer;
begin
  if new.kind not in('direct','first_meeting','group')
    or new.archived_at is not null
    or new.user_archived_at is not null then
    return new;
  end if;

  if tg_op='UPDATE' then
    if old.kind in('direct','first_meeting','group')
      and old.archived_at is null
      and old.user_archived_at is null then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||new.user_id::text,0));
  active_limit:=public.kivelle_active_conversation_limit(new.user_id);
  select count(*)::integer into active_count
  from public.together_conversations conversation
  where conversation.user_id=new.user_id
    and conversation.id<>new.id
    and conversation.archived_at is null
    and conversation.user_archived_at is null
    and conversation.kind in('direct','first_meeting','group');

  if active_count>=active_limit then
    raise exception using
      errcode='P0001',
      message='ACTIVE_CONVERSATION_LIMIT_REACHED:'||active_limit::text;
  end if;
  return new;
end $$;

drop trigger if exists together_conversations_active_limit on public.together_conversations;
create trigger together_conversations_active_limit
before insert or update of kind,archived_at,user_archived_at,user_id
on public.together_conversations
for each row execute function public.kivelle_enforce_active_conversation_limit();

create index if not exists together_conversations_active_user_idx
on public.together_conversations(user_id)
where archived_at is null
  and user_archived_at is null
  and kind in('direct','first_meeting','group');

create or replace function public.kivelle_start_conversation(p_user_id uuid,p_character_instance_id uuid)
returns public.together_conversations
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  created public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));
  update public.together_proactive_messages set
    status=case when status='queued' then 'cancelled' else 'opened' end,
    updated_at=now()
  where user_id=p_user_id
    and character_instance_id=p_character_instance_id
    and status in('queued','sent')
    and conversation_id in(
      select id from public.together_conversations
      where user_id=p_user_id
        and character_instance_id=p_character_instance_id
        and archived_at is null
        and user_archived_at is null
        and kind in('direct','first_meeting')
    );
  update public.together_conversations set archived_at=now(),updated_at=now()
  where user_id=p_user_id
    and character_instance_id=p_character_instance_id
    and archived_at is null
    and user_archived_at is null
    and kind in('direct','first_meeting');
  insert into public.together_conversations(
    user_id,character_instance_id,kind,title,summary,summary_through,summary_message_count,last_read_at
  ) values(
    p_user_id,p_character_instance_id,'direct',to_char(current_timestamp,'FMDay FMMonth DD'),null,null,0,now()
  ) returning * into created;
  return created;
end $$;

create or replace function public.kivelle_restore_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns public.together_conversations
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  target public.together_conversations;
  restored public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));

  select * into target
  from public.together_conversations
  where id=p_conversation_id and user_id=p_user_id
  for update;

  if target.id is null then raise exception 'conversation not found'; end if;
  if target.user_archived_at is null or target.restore_until is null then raise exception 'CONVERSATION_NOT_USER_ARCHIVED'; end if;
  if target.restore_until<=current_timestamp then raise exception 'ARCHIVE_EXPIRED'; end if;

  if target.kind in('direct','first_meeting') then
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||target.character_instance_id::text,0));
    update public.together_conversations set archived_at=current_timestamp,updated_at=current_timestamp
    where user_id=p_user_id
      and character_instance_id=target.character_instance_id
      and id<>target.id
      and archived_at is null
      and user_archived_at is null
      and kind in('direct','first_meeting');
  end if;

  update public.together_conversations set
    archived_at=null,
    user_archived_at=null,
    restore_until=null,
    updated_at=current_timestamp
  where id=target.id and user_id=p_user_id
  returning * into restored;
  return restored;
end $$;

create or replace function public.kivelle_start_fresh_group_conversation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_id text
)
returns public.together_conversations
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  source public.together_conversations;
  fresh public.together_conversations;
  now_at timestamptz:=clock_timestamp();
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if p_request_id is null or char_length(btrim(p_request_id))<8 then raise exception 'invalid request id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));

  select * into fresh
  from public.together_conversations conversation
  where conversation.user_id=p_user_id
    and conversation.kind='group'
    and conversation.metadata @> jsonb_build_object(
      'groupCreateRequestId',btrim(p_request_id),
      'freshFromConversationId',p_conversation_id
    )
  order by conversation.created_at desc
  limit 1;
  if fresh.id is not null then return fresh; end if;

  select * into source
  from public.together_conversations conversation
  where conversation.id=p_conversation_id
    and conversation.user_id=p_user_id
    and conversation.kind='group'
    and conversation.archived_at is null
    and conversation.user_archived_at is null
  for update;
  if source.id is null then raise exception 'GROUP_FRESH_SOURCE_CHANGED'; end if;
  if (select count(*) from public.together_conversation_participants participant where participant.conversation_id=source.id and participant.user_id=p_user_id and participant.left_at is null)<2 then
    raise exception 'GROUP_FRESH_ROSTER_TOO_SMALL';
  end if;

  update public.together_conversations set
    archived_at=now_at,
    user_archived_at=now_at,
    restore_until=now_at+interval '30 days',
    updated_at=now_at
  where id=source.id and user_id=p_user_id;

  insert into public.together_conversations(
    user_id,continuity_id,character_instance_id,kind,group_world_id,title,metadata
  ) values(
    p_user_id,source.continuity_id,source.character_instance_id,'group',source.group_world_id,source.title,
    coalesce(source.metadata,'{}'::jsonb)||jsonb_build_object(
      'groupCreateRequestId',btrim(p_request_id),
      'freshFromConversationId',source.id
    )
  ) returning * into fresh;

  insert into public.together_conversation_participants(
    user_id,continuity_id,conversation_id,character_instance_id,role,added_by,witnessed_from_sequence,metadata
  )
  select p_user_id,source.continuity_id,fresh.id,participant.character_instance_id,
    case when row_number() over(order by participant.joined_at,participant.id)=1 then 'owner_companion' else 'member' end,
    'user',1,coalesce(participant.metadata,'{}'::jsonb)||jsonb_build_object('freshFromConversationId',source.id)
  from public.together_conversation_participants participant
  where participant.conversation_id=source.id
    and participant.user_id=p_user_id
    and participant.left_at is null
  order by participant.joined_at,participant.id;

  update public.together_shared_plans set source_conversation_id=fresh.id,updated_at=now_at
  where source_conversation_id=source.id
    and user_id=p_user_id
    and continuity_id=source.continuity_id
    and status in('proposed','scheduled','active');
  update public.together_dialogue_turns set state='cancelled',cancelled_at=now_at,updated_at=now_at
  where conversation_id=source.id and state in('planning','generating');
  return fresh;
end $$;

revoke all on function public.kivelle_active_conversation_limit(uuid) from public,anon,authenticated;
revoke all on function public.kivelle_start_fresh_group_conversation(uuid,uuid,text) from public,anon;
grant execute on function public.kivelle_active_conversation_limit(uuid) to service_role;
grant execute on function public.kivelle_start_fresh_group_conversation(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.kivelle_start_conversation(uuid,uuid) to authenticated,service_role;
grant execute on function public.kivelle_restore_conversation(uuid,uuid) to authenticated,service_role;

comment on function public.kivelle_active_conversation_limit(uuid) is 'Returns the authoritative active chat-thread limit for the user tier: Free 5, Kivelle+ 20, Max 50.';
comment on function public.kivelle_enforce_active_conversation_limit() is 'Serializes and rejects active conversation creation or restoration above the account plan limit.';
comment on function public.kivelle_start_fresh_group_conversation(uuid,uuid,text) is 'Atomically archives a group transcript and creates its idempotent replacement without consuming another active slot.';

commit;
