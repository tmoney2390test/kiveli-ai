export type ChatCategory = 'active' | 'archived' | 'branches';
export type ManagedChat = {
  id: string;
  continuity_id: string | null;
  character_instance_id: string | null;
  kind: string;
  title: string | null;
  archived_at: string | null;
  last_message_at: string | null;
  created_at: string;
  life_title: string;
  is_branch: boolean;
  companion_name: string;
};
export type ChatManagementPage = {
  activeCount: number;
  archivedCount: number;
  branchCount: number;
  limit: number;
  planName: string;
  items: ManagedChat[];
};
export type ArchiveChatsResult = { archivedIds: string[]; busyIds: string[]; activeCount: number };

export function chatCategoryCount(data: ChatManagementPage, category: ChatCategory) {
  return category === 'active'
    ? data.activeCount
    : category === 'archived'
    ? data.archivedCount
    : data.branchCount;
}
export function managedChatName(chat: ManagedChat) {
  return chat.kind === 'group' ? chat.title?.trim() || 'Group chat' : chat.companion_name;
}
export function managedChatHref(chat: ManagedChat, resume = false) {
  if (chat.archived_at && !resume) return `/conversation/${encodeURIComponent(chat.id)}`;
  if (chat.kind === 'group') return `/group-chat?id=${encodeURIComponent(chat.id)}`;
  return `/chat?character=${encodeURIComponent(chat.character_instance_id ?? '')}&conversationId=${
    encodeURIComponent(chat.id)
  }`;
}
export function mergeManagedChats(current: ManagedChat[], incoming: ManagedChat[]) {
  return [...new Map([...current, ...incoming].map((chat) => [chat.id, chat])).values()];
}
export function selectableChatIds(items: ManagedChat[]) {
  return items.filter((chat) => !chat.archived_at && !chat.is_branch).map((chat) => chat.id);
}
