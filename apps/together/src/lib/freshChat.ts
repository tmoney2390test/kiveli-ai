export const FRESH_CHAT_PHRASE = 'NEW CHAT';

export function freshChatConfirmed(value: string): boolean {
  return value.trim() === FRESH_CHAT_PHRASE;
}

export function freshChatRequest(input: { characterInstanceId: string; conversationId: string; requestId: string; typedConfirmation: string }) {
  if (!freshChatConfirmed(input.typedConfirmation)) throw new Error('Type NEW CHAT to confirm.');
  return { action: 'new' as const, characterInstanceId: input.characterInstanceId,
    expectedConversationId: input.conversationId, requestId: input.requestId,
    confirmation: 'start_fresh_chat' as const };
}
