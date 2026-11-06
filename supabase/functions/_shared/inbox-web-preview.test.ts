import { assertEquals } from 'jsr:@std/assert@1';
import { restrictedInboxPreview, webAdultInboxPreview } from './inbox-web-preview.ts';

const conversation = { id: 'owned-chat', last_message_at: '2026-10-09T01:19:04.284822+00:00', last_message_preview: 'An older safe reply', last_message_role: 'user' };
const privateReply = { conversation_id: conversation.id, created_at: conversation.last_message_at, content: '  I’m here.\n  The pool is closed. ', role: 'assistant', delivery_status: 'complete', content_rating: 'explicit', visibility_scope: 'web_adult' };

Deno.test('authorized web inbox shows the current private reply rather than the older safe preview', () => {
  assertEquals(webAdultInboxPreview(conversation, privateReply, true), {
    ...conversation, last_message_preview: 'I’m here. The pool is closed.', last_message_role: 'assistant',
    last_message_delivery_status: 'complete', last_message_attachment_kind: null,
  });
});

Deno.test('safe inbox preview remains unchanged without web authorization or exact ownership and time', () => {
  assertEquals(webAdultInboxPreview(conversation, privateReply, false), conversation);
  assertEquals(webAdultInboxPreview(conversation, { ...privateReply, conversation_id: 'another-chat' }, true), conversation);
  assertEquals(webAdultInboxPreview(conversation, { ...privateReply, created_at: '2026-10-09T01:18:50+00:00' }, true), conversation);
});

Deno.test('restricted latest reply has a current private placeholder on every surface', () => {
  assertEquals(restrictedInboxPreview(conversation, privateReply), {
    ...conversation, last_message_preview: 'Messages unavailable in this app', last_message_role: 'assistant',
    last_message_delivery_status: 'complete', last_message_attachment_kind: null,
  });
  assertEquals(restrictedInboxPreview(conversation, { ...privateReply, visibility_scope: 'all', content_rating: 'suggestive' }), conversation);
  assertEquals(restrictedInboxPreview(conversation, { ...privateReply, conversation_id: 'another-chat' }), conversation);
});

Deno.test('authorized web inbox uses the latest attachment kind and bounded preview', () => {
  const result = webAdultInboxPreview(conversation, { ...privateReply, content: '[Photo]', together_conversation_attachments: [{ kind: 'image' }] }, true);
  assertEquals(result.last_message_preview, '[Photo]');
  assertEquals(result.last_message_attachment_kind, 'image');
  assertEquals(String(webAdultInboxPreview(conversation, { ...privateReply, content: 'a'.repeat(700) }, true).last_message_preview).length, 500);
});
