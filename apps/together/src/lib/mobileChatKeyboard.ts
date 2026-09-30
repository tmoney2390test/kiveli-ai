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
}): { height: number } | null {
  const { rootTop, viewportTop, viewportHeight } = input;
  if (![rootTop, viewportTop, viewportHeight].every(Number.isFinite) || viewportHeight < 120) return null;
  // Match the app's bottom edge to the visible viewport's bottom edge.
  // Moving the root itself causes Safari to pan again toward the focused
  // textarea, producing the large empty region above chat.
  const height = viewportTop + viewportHeight - rootTop;
  return height >= 120 ? { height } : null;
}
