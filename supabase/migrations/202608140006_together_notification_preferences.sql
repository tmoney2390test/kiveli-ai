-- Notification preference fields used by proactive Life delivery.
alter table public.together_notification_preferences
  add column if not exists date_reminders boolean not null default true,
  add column if not exists world_event_updates boolean not null default true;
