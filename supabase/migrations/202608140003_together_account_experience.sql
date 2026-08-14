alter table public.together_profiles
  add column if not exists about_me text not null default '' check (char_length(about_me) <= 280),
  add column if not exists avatar_path text;

alter table public.together_notification_preferences
  add column if not exists date_reminders boolean not null default true,
  add column if not exists world_event_updates boolean not null default true;
