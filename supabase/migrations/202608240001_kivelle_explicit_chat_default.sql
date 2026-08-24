-- Explicit is the default dialogue expression ceiling for verified-adult Kivelle chats.
-- Romance preferences, consent, relationship readiness, fictional-adult validation,
-- character boundaries, and hard safety policy continue to apply independently.
alter table public.together_profiles
  alter column content_preferences set default
  '{"contentMode":"explicit","romanceEnabled":true,"matureContentEnabled":false,"explicitContentEnabled":false,"suggestiveMediaEnabled":false,"nudityMediaEnabled":false,"explicitMediaEnabled":false}'::jsonb;

update public.together_profiles
set content_preferences = jsonb_set(
  coalesce(content_preferences, '{}'::jsonb),
  '{contentMode}',
  '"explicit"'::jsonb,
  true
)
where coalesce(content_preferences->>'contentMode', 'standard') = 'standard';

update public.together_conversations
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{chatPreferences}',
  coalesce(metadata->'chatPreferences', '{}'::jsonb) || '{"contentMode":"explicit"}'::jsonb,
  true
),
updated_at = now()
where coalesce(metadata#>>'{chatPreferences,contentMode}', 'standard') = 'standard';
