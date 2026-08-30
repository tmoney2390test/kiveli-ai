begin;

alter table public.together_conversations
  add column if not exists last_message_delivery_status text,
  add column if not exists last_message_attachment_kind text;

do $$ begin
  alter table public.together_conversations
    add constraint together_conversations_last_message_delivery_status_check
    check(last_message_delivery_status is null or last_message_delivery_status in('pending','streaming','complete','failed'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.together_conversations
    add constraint together_conversations_last_message_attachment_kind_check
    check(last_message_attachment_kind is null or last_message_attachment_kind in('image','audio','video'));
exception when duplicate_object then null;
end $$;

with latest as (
  select distinct on(message.conversation_id)
    message.conversation_id,
    message.id as message_id,
    message.delivery_status
  from public.together_messages message
  order by message.conversation_id,message.created_at desc,message.id desc
), attachment as (
  select latest.conversation_id,
    latest.delivery_status,
    (
      select item.kind
      from public.together_conversation_attachments item
      where item.message_id=latest.message_id
        and item.storage_deleted_at is null
      order by item.created_at,item.id
      limit 1
    ) as attachment_kind
  from latest
)
update public.together_conversations conversation
set last_message_delivery_status=attachment.delivery_status,
    last_message_attachment_kind=attachment.attachment_kind
from attachment
where conversation.id=attachment.conversation_id;

create or replace function public.kivelle_update_conversation_message_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.together_conversations
  set last_message_at=case when last_message_at is null or new.created_at>=last_message_at then new.created_at else last_message_at end,
      last_message_preview=case when last_message_at is null or new.created_at>=last_message_at then left(nullif(btrim(regexp_replace(new.content,'[[:space:]]+',' ','g')),''),500) else last_message_preview end,
      last_message_role=case when last_message_at is null or new.created_at>=last_message_at then new.role else last_message_role end,
      last_message_delivery_status=case when last_message_at is null or new.created_at>=last_message_at then new.delivery_status else last_message_delivery_status end,
      last_message_attachment_kind=case
        when (last_message_at is null or new.created_at>=last_message_at) and tg_op='INSERT' then null
        else last_message_attachment_kind
      end,
      last_assistant_message_at=case when new.role='assistant' and (last_assistant_message_at is null or new.created_at>=last_assistant_message_at) then new.created_at else last_assistant_message_at end,
      updated_at=greatest(updated_at,new.created_at)
  where id=new.conversation_id;
  return new;
end $$;

drop trigger if exists together_message_conversation_state on public.together_messages;
create trigger together_message_conversation_state
after insert or update of content,role,delivery_status on public.together_messages
for each row execute function public.kivelle_update_conversation_message_state();

create or replace function public.kivelle_update_conversation_attachment_state() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  target_message_id uuid:=coalesce(new.message_id,old.message_id);
  target_conversation_id uuid:=coalesce(new.conversation_id,old.conversation_id);
  target_created_at timestamptz;
  target_kind text;
begin
  if target_message_id is null then return coalesce(new,old); end if;
  select message.created_at into target_created_at
  from public.together_messages message
  where message.id=target_message_id and message.conversation_id=target_conversation_id;
  if target_created_at is null then return coalesce(new,old); end if;
  select attachment.kind into target_kind
  from public.together_conversation_attachments attachment
  where attachment.message_id=target_message_id
    and attachment.storage_deleted_at is null
  order by attachment.created_at,attachment.id
  limit 1;
  update public.together_conversations
  set last_message_attachment_kind=target_kind
  where id=target_conversation_id and last_message_at=target_created_at;
  return coalesce(new,old);
end $$;

drop trigger if exists together_attachment_conversation_state on public.together_conversation_attachments;
create trigger together_attachment_conversation_state
after insert or update of message_id,kind,storage_deleted_at or delete on public.together_conversation_attachments
for each row execute function public.kivelle_update_conversation_attachment_state();

comment on column public.together_conversations.last_message_delivery_status is
  'Delivery state of the newest message, denormalized for an informative inbox preview.';
comment on column public.together_conversations.last_message_attachment_kind is
  'Safe media category attached to the newest message; never contains a private storage path.';

commit;
