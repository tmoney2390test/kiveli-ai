import { assertEquals } from 'jsr:@std/assert';
import { canRememberMessage, canViewMemory } from './memory-center-visibility.ts';

Deno.test('safe messages remain available on every surface', () => {
  const row = { content_rating: 'safe', visibility_scope: 'all' };
  assertEquals(canRememberMessage(row, false), true);
  assertEquals(canViewMemory(row, false), true);
});

Deno.test('approved adult messages are remembered and viewed only on authorized web', () => {
  const message = { content_rating: 'explicit', visibility_scope: 'web_adult', moderation_version: 'private-adult-text-v1', moderation_status: 'approved' };
  const memory = { ...message, source_message_id: 'source-id' };
  assertEquals(canRememberMessage(message, false), false);
  assertEquals(canRememberMessage(message, true), true);
  assertEquals(canViewMemory(memory, false), false);
  assertEquals(canViewMemory(memory, true), true);
  assertEquals(canViewMemory({ ...memory, source_message_id: null }, true), false);
});

Deno.test('unclassified and unapproved adult content stays hidden', () => {
  const unapproved = { content_rating: 'explicit', visibility_scope: 'web_adult', moderation_version: 'private-adult-text-v1', moderation_status: 'pending' };
  assertEquals(canRememberMessage(unapproved, true), false);
  assertEquals(canViewMemory({ ...unapproved, source_message_id: 'source-id', moderation_version: 'unclassified' }, true), false);
});
