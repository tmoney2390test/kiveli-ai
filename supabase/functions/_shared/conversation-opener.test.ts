import { assertEquals, assertRejects } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureConversationOpener, firstMeetingOpening } from './conversation-opener.ts';
import { AppError } from './types.ts';

Deno.test('opening text accepts both published first-meeting formats', () => {
  assertEquals(firstMeetingOpening({ opening_line: '  Hello from Eos.  ' }), 'Hello from Eos.');
  assertEquals(firstMeetingOpening({ openingLine: '  Hello from Vharadren.  ' }), 'Hello from Vharadren.');
  assertEquals(firstMeetingOpening({ openingLine: '   ' }), null);
});

function fakeDb(existing: boolean, insertError = false) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table !== 'together_messages') throw new Error(`Unexpected query: ${table}`);
      return {
        select() { return { eq() { return this; }, limit() { return Promise.resolve({ data: existing ? [{ id: 'old' }] : [], error: null }); } }; },
        insert(row: Record<string, unknown>) { inserted.push(row); return Promise.resolve({ error: insertError ? { message: 'failed' } : null }); },
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserted };
}

Deno.test('new meetings persist the character opener once', async () => {
  const { db, inserted } = fakeDb(false);
  assertEquals(await ensureConversationOpener({ db, userId: 'user', conversation: { id: 'chat', metadata: {} }, characterInstanceId: 'character', meeting: { openingLine: 'Welcome.' } }), true);
  assertEquals(inserted[0].content, 'Welcome.');
  const existing = fakeDb(true);
  assertEquals(await ensureConversationOpener({ db: existing.db, userId: 'user', conversation: { id: 'chat', metadata: {} }, characterInstanceId: 'character', meeting: { openingLine: 'Welcome.' } }), false);
  assertEquals(existing.inserted.length, 0);
});

Deno.test('fresh chats use a reconnection opener, never a first-meeting line', async () => {
  const { db, inserted } = fakeDb(false);
  await ensureConversationOpener({ db, userId: 'user', conversation: { id: 'fresh', metadata: { freshChatRequestId: 'request' } }, characterInstanceId: 'character', meeting: { opening_line: 'We have never met.' } });
  assertEquals(inserted[0].content, "I'm here. What's on your mind?");
});

Deno.test('a failed opener insert leaves the request retryable', async () => {
  const { db } = fakeDb(false, true);
  const error = await assertRejects(() => ensureConversationOpener({ db, userId: 'user', conversation: { id: 'chat' }, characterInstanceId: 'character', meeting: { opening_line: 'Hello.' } }), AppError);
  assertEquals(error.status, 500);
});
