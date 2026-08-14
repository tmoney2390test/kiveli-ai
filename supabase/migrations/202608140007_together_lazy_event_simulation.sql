-- Track meaningful narrative catch-up independently from cheap schedule resolution.
-- Null means the next continued conversation should catch up from instance creation.
alter table public.together_character_instances
  add column if not exists last_event_simulated_at timestamptz;

comment on column public.together_character_instances.last_event_simulated_at is
  'Last time meaningful life events were materialized. Updated by conversation continuation, not routine state resolution.';
