alter table public.together_profiles
  add column if not exists experience_timezone text not null default 'UTC';

alter table public.together_open_threads
  add column if not exists subject text,
  add column if not exists display_subject text,
  add column if not exists followup_prompt text;

update public.together_open_threads
set subject = coalesce(subject, metadata->>'subject'),
    display_subject = coalesce(display_subject, initcap(metadata->>'subject')),
    followup_prompt = coalesce(
      followup_prompt,
      case when coalesce(metadata->>'subject', '') <> ''
        then 'I should tell you how my ' || (metadata->>'subject') || ' went.'
      end
    )
where subject is null or display_subject is null or followup_prompt is null;

create table if not exists public.together_conversation_actions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  assistant_message_id uuid references public.together_messages(id) on delete set null,
  candidate_type text not null check(candidate_type in ('plan','cancel_plan','reschedule_plan','date')),
  status text not null default 'pending' check(status in ('pending','applied','dismissed','expired')),
  payload jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.75 check(confidence >= 0 and confidence <= 1),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists together_conversation_actions_user_status_idx
  on public.together_conversation_actions(user_id, status, created_at desc);
create index if not exists together_conversation_actions_conversation_idx
  on public.together_conversation_actions(conversation_id, created_at desc);
create unique index if not exists together_conversation_actions_message_type_idx
  on public.together_conversation_actions(assistant_message_id, candidate_type)
  where assistant_message_id is not null;

alter table public.together_conversation_actions enable row level security;
drop policy if exists "Users can view own conversation actions" on public.together_conversation_actions;
create policy "Users can view own conversation actions"
  on public.together_conversation_actions for select
  using (auth.uid() = user_id);

grant select on public.together_conversation_actions to authenticated;
