begin;

alter table public.together_conversations
  add column if not exists user_archived_at timestamptz,
  add column if not exists restore_until timestamptz;

alter table public.together_conversations
  drop constraint if exists together_conversations_restore_window_check;
alter table public.together_conversations
  add constraint together_conversations_restore_window_check check(
    (user_archived_at is null and restore_until is null)
    or (user_archived_at is not null and restore_until>user_archived_at)
  );

create index if not exists together_conversations_user_archive_idx
on public.together_conversations(user_id,continuity_id,restore_until desc)
where user_archived_at is not null;

comment on column public.together_conversations.user_archived_at is
  'When set, the user explicitly removed this chat from normal history and may restore it during the retention window.';
comment on column public.together_conversations.restore_until is
  'Exclusive deadline for restoring a user-archived chat; Kivelle currently grants thirty days.';

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
  if auth.uid() is not null and auth.uid()<>p_user_id then
    raise exception 'not authorized';
  end if;

  select * into target
  from public.together_conversations
  where id=p_conversation_id and user_id=p_user_id
  for update;

  if target.id is null then
    raise exception 'conversation not found';
  end if;
  if target.user_archived_at is null or target.restore_until is null then
    raise exception 'CONVERSATION_NOT_USER_ARCHIVED';
  end if;
  if target.restore_until<=current_timestamp then
    raise exception 'ARCHIVE_EXPIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||target.character_instance_id::text,0));

  -- A restored transcript becomes the current chat. Preserve any newer current
  -- thread as ordinary conversation history rather than deleting either one.
  update public.together_conversations set
    archived_at=current_timestamp,
    updated_at=current_timestamp
  where user_id=p_user_id
    and character_instance_id=target.character_instance_id
    and id<>target.id
    and archived_at is null
    and kind in('direct','first_meeting');

  update public.together_conversations set
    archived_at=null,
    user_archived_at=null,
    restore_until=null,
    updated_at=current_timestamp
  where id=target.id and user_id=p_user_id
  returning * into restored;

  return restored;
end $$;

grant execute on function public.kivelle_restore_conversation(uuid,uuid) to authenticated,service_role;

commit;
