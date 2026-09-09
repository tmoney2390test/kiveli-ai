export const MOBILE_CHAT_COMPOSER_IDS = new Set([
  'chat-message-composer',
  'group-chat-message-composer',
]);

export function isMobileChatComposerElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const id = (element as { id?: unknown }).id;
  return typeof id === 'string' && MOBILE_CHAT_COMPOSER_IDS.has(id);
}

export type MobileChatViewport = { height: number; top: number };

/** A keyboard may shrink/pan only the visual viewport, leaving innerHeight unchanged. */
export function mobileChatViewport(input: {
  layoutHeight: number;
  visualHeight?: number;
  offsetTop?: number;
  scale?: number;
}): MobileChatViewport | null {
  // Preserve the existing layout during pinch zoom instead of shrinking it again.
  if (input.scale !== undefined && Math.abs(input.scale - 1) > 0.01) return null;
  const height = input.visualHeight ?? input.layoutHeight;
  if (!Number.isFinite(height) || height <= 0) return null;
  return { height, top: Number.isFinite(input.offsetTop) ? Math.max(0, input.offsetTop ?? 0) : 0 };
}
