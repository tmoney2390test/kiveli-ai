export const CHAT_BOTTOM_STICK_THRESHOLD = 240;

export type ChatScrollMetrics = {
  contentHeight: number;
  viewportHeight: number;
  offsetY: number;
};

export function chatBottomDistance(metrics: ChatScrollMetrics): number {
  return Math.max(
    0,
    metrics.contentHeight - metrics.viewportHeight - metrics.offsetY,
  );
}

export function isChatNearBottom(
  metrics: ChatScrollMetrics,
  threshold = CHAT_BOTTOM_STICK_THRESHOLD,
): boolean {
  return chatBottomDistance(metrics) <= threshold;
}
