import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { freshChatConfirmed, freshChatRequest } from './freshChat';

describe('explicit fresh chat intent', () => {
  it('does not accept empty, partial or accidental confirmation', () => {
    for (const phrase of ['', 'yes', 'NEW', 'NEW CHAT please', 'new chat']) expect(freshChatConfirmed(phrase)).toBe(false);
    expect(freshChatConfirmed(' NEW CHAT ')).toBe(true);
  });
  it('binds confirmation and retries to the exact transcript and request', () => {
    const input = { characterInstanceId: 'character', conversationId: 'current', requestId: 'stable-retry-id', typedConfirmation: 'NEW CHAT' };
    expect(freshChatRequest(input)).toEqual({ action: 'new', characterInstanceId: 'character', expectedConversationId: 'current', requestId: 'stable-retry-id', confirmation: 'start_fresh_chat' });
    expect(freshChatRequest(input)).toEqual(freshChatRequest(input));
    expect(() => freshChatRequest({ ...input, typedConfirmation: '' })).toThrow();
  });
  it('keeps fresh chat out of message actions and ordinary history navigation', () => {
    const chat = readFileSync(new URL('../../app/chat.tsx', import.meta.url), 'utf8');
    const history = readFileSync(new URL('../../app/conversation/[id].tsx', import.meta.url), 'utf8');
    expect(chat).not.toContain("key:'fresh'");
    expect(chat).toContain('onFresh={startNewConversation}');
    expect(history).not.toContain("action: 'new'");
    expect(history).toContain("action: 'ensure'");
  });
});
