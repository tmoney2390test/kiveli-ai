import { assert } from 'jsr:@std/assert';
import { conversationAdultMediaAuthorized, conversationDialogueContentMode, normalizeDialogueContentMode } from './conversation-content-mode.ts';

Deno.test('conversation dialogue mode caps legacy explicit overrides at mature', () => {
  assert(conversationDialogueContentMode(
    { age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'romance' } },
    { metadata: { chatPreferences: { contentMode: 'explicit' } } },
  ) === 'mature');
});

Deno.test('conversation dialogue mode enables explicit only for a server-authorized web adult session', () => {
  assert(conversationDialogueContentMode(
    { age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'romance' } },
    { metadata: { chatPreferences: { contentMode: 'explicit' } } },
    true,
  ) === 'explicit');
});

Deno.test('conversation dialogue mode respects a web adult choosing a non-explicit chat', () => {
  assert(conversationDialogueContentMode(
    { age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'explicit' } },
    { metadata: { chatPreferences: { contentMode: 'mature' } } },
    true,
  ) === 'mature');
});

Deno.test('conversation dialogue mode falls back safely', () => {
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'mature' } }, { metadata: {} }) === 'mature');
  assert(conversationDialogueContentMode({ age_verified_at: '2026-08-01T00:00:00Z', content_preferences: { contentMode: 'invalid' } }, null) === 'mature');
  assert(conversationDialogueContentMode({ content_preferences: { contentMode: 'explicit' } }, null) === 'romance');
  assert(normalizeDialogueContentMode(undefined) === 'mature');
  assert(normalizeDialogueContentMode('standard') === 'mature');
  assert(normalizeDialogueContentMode('explicit') === 'explicit');
});

Deno.test('adult photo authorization follows the verified explicit conversation instead of the prose route', () => {
  assert(conversationAdultMediaAuthorized('explicit', true));
  assert(!conversationAdultMediaAuthorized('explicit', false));
  assert(!conversationAdultMediaAuthorized('mature', true));
  assert(!conversationAdultMediaAuthorized('romance', true));
});

Deno.test('an explicit photo request is adult-authorized on a verified web session even if chat mode is not explicit', () => {
  assert(conversationAdultMediaAuthorized('mature', true, 'explicit'));
  assert(conversationAdultMediaAuthorized('romance', true, 'explicit'));
  assert(!conversationAdultMediaAuthorized('mature', true, 'standard'));
  assert(!conversationAdultMediaAuthorized('mature', false, 'explicit'));
});
