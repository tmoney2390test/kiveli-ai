import { describe, expect, it } from 'vitest';
import { contextualSupportHref, supportRequestReferences } from './mediaSupportReference';

const id = '1e338dd0-ac96-4db7-b3a1-afd410a9ee58';

describe('contextual support links', () => {
  it('keeps trace identifiers without copying chat text, receipts, or tokens', () => {
    const href = contextualSupportHref('conversation', {
      conversationId: id,
      correlationId: 'chat-retry-123',
    }, {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'private chat content',
      accessToken: 'secret',
      receipt: 'private receipt',
    });
    const params = new URL(href, 'https://kivelli.app').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      mode: 'new',
      topic: 'conversation',
      conversationId: id,
      correlationId: 'chat-retry-123',
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('rejects malformed identifiers and requires a conversation for a stored message', () => {
    expect(
      supportRequestReferences({
        messageId: id,
        mediaId: 'javascript:alert(1)',
        correlationId: 'private text',
        errorCode: 'failed to send private message',
        purchaseReference: '<script>',
      }),
    ).toEqual({});
    expect(supportRequestReferences({ conversationId: id, messageId: id })).toEqual({
      conversationId: id,
      messageId: id,
    });
  });
  it('links billing errors to the selected product without receipt data', () => {
    const params = new URL(
      contextualSupportHref('purchase', { purchaseReference: 'kivelle_max:annual' }, {
        code: 'STORE_UNAVAILABLE',
      }),
      'https://kivelli.app',
    ).searchParams;
    expect(params.get('purchaseReference')).toBe('kivelle_max:annual');
    expect(params.get('errorCode')).toBe('STORE_UNAVAILABLE');
  });
});
