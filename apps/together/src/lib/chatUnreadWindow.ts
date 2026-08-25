export type ChatUnreadWindow = {
  lastReadAt?: string | null;
  openedAt?: string | null;
};

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The NEW divider describes messages that were waiting when the chat opened.
 * Messages delivered while the user is already looking at the conversation are
 * immediately visible and should never create a fresh unread divider.
 */
export function wasUnreadWhenChatOpened(
  messageAt: string,
  window: ChatUnreadWindow,
): boolean {
  const messageTime = timestamp(messageAt);
  const lastReadTime = timestamp(window.lastReadAt);
  const openedTime = timestamp(window.openedAt);
  if (messageTime === null || lastReadTime === null || openedTime === null) return false;
  return messageTime > lastReadTime && messageTime <= openedTime;
}
