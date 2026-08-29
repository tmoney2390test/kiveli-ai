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

export function shouldKeepChatPinned(
  metrics: ChatScrollMetrics,
  forcePinnedUntil: number,
  now = Date.now(),
  threshold = CHAT_BOTTOM_STICK_THRESHOLD,
): boolean {
  return forcePinnedUntil > now || isChatNearBottom(metrics, threshold);
}

export function preservedPrependOffset(input: {
  previousOffsetY: number;
  previousContentHeight: number;
  nextContentHeight: number;
}): number {
  return Math.max(
    0,
    input.previousOffsetY + input.nextContentHeight - input.previousContentHeight,
  );
}

export function shouldLoadOlderChatMessages(input: {
  bottomAligned: boolean;
  forcedBottomPin: boolean;
  programmaticScrollUntil: number;
  now?: number;
  offsetY: number;
  previousOffsetY: number;
  threshold?: number;
}): boolean {
  const now = input.now ?? Date.now(), threshold = input.threshold ?? 80;
  return input.bottomAligned && !input.forcedBottomPin &&
    now > input.programmaticScrollUntil && input.offsetY < threshold &&
    input.offsetY < input.previousOffsetY - 1;
}
