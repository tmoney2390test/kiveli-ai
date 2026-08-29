import type { Message } from '../types';

export function isVisibleChatMessage(message: Message): boolean {
  return message.provider_metadata?.uiHidden !== true;
}

export function isMessageFavorite(message: Message): boolean {
  return message.user_metadata?.favorite === true;
}

export function canContinueMessage(message: Message, messages: Message[]): boolean {
  if (message.role !== 'assistant' || message.delivery_status !== 'complete' || message.id.startsWith('local-')) return false;
  const latest = [...messages].reverse().find((candidate) => isVisibleChatMessage(candidate) && !candidate.id.startsWith('local-'));
  return latest?.id === message.id;
}
