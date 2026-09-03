import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { conversationActionRateLimit, simulationRequestRateLimit } from './together-request-limits.ts';

Deno.test('conversation navigation is not constrained by the old blanket 20 request limit', () => {
  for (const action of ['messages', 'read', 'inbox', 'inbox_v2', 'history', 'archived', 'search', 'ensure', 'open']) {
    assertNotEquals(conversationActionRateLimit(action).limit, 20);
  }
  assertEquals(conversationActionRateLimit('messages'), { limit: 1200, windowSeconds: 3600 });
  assertEquals(conversationActionRateLimit('read'), { limit: 1200, windowSeconds: 3600 });
  assertEquals(conversationActionRateLimit('open'), { limit: 240, windowSeconds: 3600 });
});

Deno.test('conversation mutations retain a separate reasonable abuse limit', () => {
  assertEquals(conversationActionRateLimit('delete'), { limit: 60, windowSeconds: 3600 });
  assertEquals(conversationActionRateLimit('settings'), { limit: 240, windowSeconds: 3600 });
});

Deno.test('background life refresh allows normal multi-device navigation bursts', () => {
  assertEquals(simulationRequestRateLimit(), { limit: 240, windowSeconds: 3600 });
});
