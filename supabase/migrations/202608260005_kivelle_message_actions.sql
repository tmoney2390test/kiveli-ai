alter table public.together_messages
  add column if not exists user_metadata jsonb not null default '{}'::jsonb;

alter table public.together_messages
  drop constraint if exists together_messages_user_metadata_object;

alter table public.together_messages
  add constraint together_messages_user_metadata_object
  check (jsonb_typeof(user_metadata) = 'object');

create index if not exists together_messages_user_favorites_idx
  on public.together_messages (user_id, conversation_id, created_at desc)
  where user_metadata @> '{"favorite": true}'::jsonb;
