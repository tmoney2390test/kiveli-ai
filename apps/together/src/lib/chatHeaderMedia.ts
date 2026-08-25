import type { GeneratedMedia } from '../types';

/**
 * Returns the newest image that can be rendered inside a specific chat header.
 * Conversation scoping is intentionally strict so media never crosses chats.
 */
export function latestConversationHeaderImage(
  media: GeneratedMedia[],
  conversationId: string,
): GeneratedMedia | null {
  return media
    .filter((item) =>
      item.conversation_id === conversationId &&
      item.media_type === 'image' &&
      item.status === 'ready' &&
      Boolean(item.signed_url)
    )
    .sort((left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    )[0] ?? null;
}
