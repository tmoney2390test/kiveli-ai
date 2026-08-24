import { assert } from 'jsr:@std/assert';
import { conversationDialogueContentMode, normalizeDialogueContentMode } from './conversation-content-mode.ts';

Deno.test('conversation dialogue mode prefers a valid per-chat override', () => {
  assert(conversationDialogueContentMode(
    { age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'romance' } },
    { metadata: { chatPreferences: { contentMode: 'explicit' } } },
  ) === 'explicit');
});

Deno.test('conversation dialogue mode falls back safely', () => {
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'mature' } }, { metadata: {} }) === 'mature');
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'invalid' } }, null) === 'explicit');
  assert(conversationDialogueContentMode({ content_preferences: { contentMode: 'explicit' } }, null) === 'romance');
  assert(normalizeDialogueContentMode(undefined) === 'explicit');
  assert(normalizeDialogueContentMode('standard') === 'explicit');
});
