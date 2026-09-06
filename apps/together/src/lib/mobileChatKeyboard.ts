export const MOBILE_CHAT_COMPOSER_IDS = new Set([
  'chat-message-composer',
  'group-chat-message-composer',
]);

export function isMobileChatComposerElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const id = (element as { id?: unknown }).id;
  return typeof id === 'string' && MOBILE_CHAT_COMPOSER_IDS.has(id);
}
