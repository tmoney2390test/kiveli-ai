export type ChatScrollPosition = {
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
  savedAt: number;
};

const positions = new Map<string, ChatScrollPosition>();
const POSITION_TTL_MS = 30 * 60 * 1000;

export function saveChatScrollPosition(
  conversationId: string,
  position: Omit<ChatScrollPosition, "savedAt">,
  now = Date.now(),
): void {
  positions.set(conversationId, { ...position, savedAt: now });
}

export function readChatScrollPosition(
  conversationId: string,
  now = Date.now(),
): ChatScrollPosition | null {
  const position = positions.get(conversationId);
  if (!position) return null;
  if (now - position.savedAt > POSITION_TTL_MS) {
    positions.delete(conversationId);
    return null;
  }
  return position;
}

export function shouldRestoreChatScrollPosition(
  position: ChatScrollPosition | null,
  nearBottomThreshold = 96,
): position is ChatScrollPosition {
  if (!position) return false;
  const distanceFromBottom = Math.max(
    0,
    position.contentHeight - position.viewportHeight - position.offsetY,
  );
  return distanceFromBottom > nearBottomThreshold;
}

export function restoredChatOffset(
  position: ChatScrollPosition,
  nextContentHeight: number,
  nextViewportHeight = position.viewportHeight,
): number {
  return Math.max(
    0,
    Math.min(position.offsetY, Math.max(0, nextContentHeight - nextViewportHeight)),
  );
}

export function clearChatScrollPosition(conversationId: string): void {
  positions.delete(conversationId);
}
