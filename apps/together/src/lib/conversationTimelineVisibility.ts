type ConversationTimelineReadiness = {
  activeConversationId?: string | null;
  loadedConversationId?: string | null;
  hasCompleteCachedTimeline?: boolean;
};

/**
 * A lightweight conversation shell may contain events but no messages. Only
 * reveal timeline content when the message page belongs to the active chat or
 * a complete cached timeline is available for it.
 */
export function hasCoherentConversationTimeline({
  activeConversationId,
  loadedConversationId,
  hasCompleteCachedTimeline = false,
}: ConversationTimelineReadiness) {
  return Boolean(
    activeConversationId &&
      (loadedConversationId === activeConversationId || hasCompleteCachedTimeline),
  );
}
