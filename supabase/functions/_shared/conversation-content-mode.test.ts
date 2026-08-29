import { assert } from 'jsr:@std/assert';
import { conversationDialogueContentMode, normalizeDialogueContentMode } from './conversation-content-mode.ts';

Deno.test('conversation dialogue mode caps legacy explicit overrides at mature', () => {
  assert(conversationDialogueContentMode(
    { age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'romance' } },
    { metadata: { chatPreferences: { contentMode: 'explicit' } } },
  ) === 'mature');
});

Deno.test('conversation dialogue mode falls back safely', () => {
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'mature' } }, { metadata: {} }) === 'mature');
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'invalid' } }, null) === 'mature');
  assert(conversationDialogueContentMode({ content_preferences: { contentMode: 'explicit' } }, null) === 'romance');
  assert(normalizeDialogueContentMode(undefined) === 'mature');
  assert(normalizeDialogueContentMode('standard') === 'mature');
  assert(normalizeDialogueContentMode('explicit') === 'mature');
});
