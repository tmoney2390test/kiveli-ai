begin;

alter table public.together_ai_usage_events drop constraint if exists together_ai_usage_events_provider_check;
alter table public.together_ai_usage_events add constraint together_ai_usage_events_provider_check
  check (provider in ('openai','xai','gemini','venice','wavespeed','deterministic'));

-- Reuse the existing private experiment switch without changing its state or permissions.
commit;
