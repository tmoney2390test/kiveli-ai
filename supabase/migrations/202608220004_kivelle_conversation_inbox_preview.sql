alter table public.together_conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_role text;

do $$ begin
  alter table public.together_conversations
    add constraint together_conversations_last_message_role_check
    check(last_message_role is null or last_message_role in ('user','assistant','system'));
exception when duplicate_object then null;
end $$;

with latest as (
  select distinct on (message.conversation_id)
    message.conversation_id,
    message.created_at,
    left(nullif(btrim(regexp_replace(message.content,'[[:space:]]+',' ','g')),''),500) as preview,
    message.role
  from public.together_messages message
  order by message.conversation_id,message.created_at desc,message.id desc
)
update public.together_conversations conversation
set last_message_at=latest.created_at,
    last_message_preview=latest.preview,
    last_message_role=latest.role
from latest
where conversation.id=latest.conversation_id;

create or replace function public.kivelle_update_conversation_message_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.together_conversations
  set last_message_at=case when last_message_at is null or new.created_at>=last_message_at then new.created_at else last_message_at end,
      last_message_preview=case when last_message_at is null or new.created_at>=last_message_at then left(nullif(btrim(regexp_replace(new.content,'[[:space:]]+',' ','g')),''),500) else last_message_preview end,
      last_message_role=case when last_message_at is null or new.created_at>=last_message_at then new.role else last_message_role end,
      last_assistant_message_at=case when new.role='assistant' and (last_assistant_message_at is null or new.created_at>=last_assistant_message_at) then new.created_at else last_assistant_message_at end,
      updated_at=greatest(updated_at,new.created_at)
  where id=new.conversation_id;
  return new;
end $$;

comment on column public.together_conversations.last_message_preview is 'Whitespace-normalized, bounded inbox preview maintained by the message insert trigger.';
