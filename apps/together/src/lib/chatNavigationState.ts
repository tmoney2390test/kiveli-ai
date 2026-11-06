export type ChatScrollPosition = {
  offsetY: number;
  contentHeight: number;
  viewportHeight: number;
  savedAt: number;
  latestMessageAt?: string | null;
};

const positions = new Map<string, ChatScrollPosition>();
const POSITION_TTL_MS = 30 * 60 * 1000;

export function newestChatTimestamp(...values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((latest, value) =>
    value && Number.isFinite(Date.parse(value)) && (!latest || Date.parse(value) > Date.parse(latest))
      ? value : latest, null);
}

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
  latestMessageAt?: string | null,
): position is ChatScrollPosition {
  if (!position) return false;
  if (chatAdvancedSincePosition(position, latestMessageAt)) return false;
  const distanceFromBottom = Math.max(
    0,
    position.contentHeight - position.viewportHeight - position.offsetY,
  );
  return distanceFromBottom > nearBottomThreshold;
}

export function chatAdvancedSincePosition(
  position: ChatScrollPosition | null,
  latestMessageAt?: string | null,
): boolean {
  if (!position?.latestMessageAt || !latestMessageAt) return false;
  const previous = Date.parse(position.latestMessageAt);
  const latest = Date.parse(latestMessageAt);
  return Number.isFinite(previous) && Number.isFinite(latest) && latest > previous;
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
