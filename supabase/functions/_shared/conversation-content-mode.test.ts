import { assert } from 'jsr:@std/assert';
import { conversationDialogueContentMode, normalizeDialogueContentMode } from './conversation-content-mode.ts';

Deno.test('conversation dialogue mode prefers a valid per-chat override', () => {
  assert(conversationDialogueContentMode(
    { content_preferences: { contentMode: 'romance' } },
    { metadata: { chatPreferences: { contentMode: 'explicit' } } },
  ) === 'explicit');
});

Deno.test('conversation dialogue mode falls back safely', () => {
  assert(conversationDialogueContentMode({ content_preferences: { contentMode: 'mature' } }, { metadata: {} }) === 'mature');
  assert(conversationDialogueContentMode({ content_preferences: { contentMode: 'invalid' } }, null) === 'standard');
  assert(normalizeDialogueContentMode(undefined) === 'standard');
});
