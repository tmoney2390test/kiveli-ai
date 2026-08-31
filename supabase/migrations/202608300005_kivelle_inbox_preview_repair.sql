begin;

-- Reinstall the full inbox-state trigger and repair conversations created before
-- preview hydration was attached to message writes. The prior inbox polish
-- migration backfilled delivery and attachment state only, leaving historical
-- rows with last_message_at set and last_message_preview null.
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

with latest as (
  select distinct on(message.conversation_id)
    message.conversation_id,
    message.id as message_id,
    message.created_at,
    left(nullif(btrim(regexp_replace(message.content,'[[:space:]]+',' ','g')),''),500) as preview,
    message.role,
    message.delivery_status
  from public.together_messages message
  order by message.conversation_id,message.created_at desc,message.id desc
), hydrated as (
  select
    latest.*,
    (
      select attachment.kind
      from public.together_conversation_attachments attachment
      where attachment.message_id=latest.message_id
        and attachment.storage_deleted_at is null
      order by attachment.created_at,attachment.id
      limit 1
    ) as attachment_kind
  from latest
)
update public.together_conversations conversation
set last_message_at=hydrated.created_at,
    last_message_preview=hydrated.preview,
    last_message_role=hydrated.role,
    last_message_delivery_status=hydrated.delivery_status,
    last_message_attachment_kind=hydrated.attachment_kind
from hydrated
where conversation.id=hydrated.conversation_id;

commit;
