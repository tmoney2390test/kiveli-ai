export const MOBILE_CHAT_COMPOSER_IDS = new Set([
  'chat-message-composer',
  'group-chat-message-composer',
]);

export function isMobileChatComposerElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const id = (element as { id?: unknown }).id;
  return typeof id === 'string' && MOBILE_CHAT_COMPOSER_IDS.has(id);
}

export function chatRootFrameForVisibleViewport(input: {
  rootTop: number;
  viewportTop: number;
  viewportHeight: number;
}): { translateY: number; height: number } | null {
  const { rootTop, viewportTop, viewportHeight } = input;
  if (![rootTop, viewportTop, viewportHeight].every(Number.isFinite) || viewportHeight < 120) return null;
  const translateY = Math.max(0, viewportTop - rootTop);
  const top = rootTop + translateY;
  const height = viewportTop + viewportHeight - top;
  return height >= 120 ? { translateY, height } : null;
}
