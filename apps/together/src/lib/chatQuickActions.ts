import AsyncStorage from '@react-native-async-storage/async-storage';

export const MAX_CHAT_QUICK_ACTIONS = 6;
export type ChatQuickAction = 'voice' | 'location' | 'branch' | 'continue' | 'memory' | 'favorite' | 'photo' | 'activity' | 'plan' | 'reply' | 'copy' | 'spice';

const VALID_ACTIONS: ChatQuickAction[] = ['voice', 'location', 'branch', 'continue', 'memory', 'favorite', 'photo', 'activity', 'plan', 'reply', 'copy', 'spice'];
export const DEFAULT_CHAT_QUICK_ACTIONS: ChatQuickAction[] = ['voice'];
export const defaultChatQuickActions = (kind: 'direct' | 'group'): ChatQuickAction[] =>
  kind === 'direct' ? ['voice', 'location'] : [...DEFAULT_CHAT_QUICK_ACTIONS];
export const migrateV2ChatQuickActions = (value: unknown, kind: 'direct' | 'group'): ChatQuickAction[] => {
  const selected = normalizeChatQuickActions(value);
  return kind === 'direct' && selected.length > 0 && selected.length < MAX_CHAT_QUICK_ACTIONS && !selected.includes('location')
    ? [...selected, 'location'] : selected;
};
export const migrateLegacyChatQuickActions = (value: unknown): ChatQuickAction[] =>
  normalizeChatQuickActions(['voice', ...(Array.isArray(value) ? value : [])]);

export function normalizeChatQuickActions(value: unknown): ChatQuickAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item, index): item is ChatQuickAction =>
    typeof item === 'string' && VALID_ACTIONS.includes(item as ChatQuickAction) && value.indexOf(item) === index,
  ).slice(0, MAX_CHAT_QUICK_ACTIONS);
}

export function toggleChatQuickAction(current: ChatQuickAction[], action: ChatQuickAction): ChatQuickAction[] {
  if (current.includes(action)) return current.filter((item) => item !== action);
  return current.length < MAX_CHAT_QUICK_ACTIONS ? [...current, action] : current;
}

function storageKey(userId: string, conversationId: string, kind: 'direct' | 'group', version: 1 | 2 | 3) {
  return `kivelle:chat-quick-actions:v${version}:${userId}:${kind}:${conversationId}`;
}

export type StoredChatQuickActions = { selected: ChatQuickAction[]; pendingSync: boolean };

export async function loadChatQuickActionState(userId: string, conversationId: string, kind: 'direct' | 'group'): Promise<StoredChatQuickActions> {
  if (!userId || !conversationId) return { selected: [], pendingSync: false };
  try {
    const current = await AsyncStorage.getItem(storageKey(userId, conversationId, kind, 3));
    const previous = current === null ? await AsyncStorage.getItem(storageKey(userId, conversationId, kind, 2)) : null;
    const raw = current ?? previous ?? await AsyncStorage.getItem(storageKey(userId, conversationId, kind, 1));
    const migrate = (selected: unknown) => current !== null ? normalizeChatQuickActions(selected)
      : previous !== null ? migrateV2ChatQuickActions(selected, kind)
      : migrateV2ChatQuickActions(migrateLegacyChatQuickActions(selected), kind);
    const value = raw ? JSON.parse(raw) as unknown : null;
    if (Array.isArray(value)) return { selected: migrate(value), pendingSync: false };
    if (value && typeof value === 'object') {
      const stored = value as { selected?: unknown; pendingSync?: unknown };
      return { selected: migrate(stored.selected), pendingSync: stored.pendingSync === true };
    }
  } catch { /* Keep an empty selection if local storage is unavailable. */ }
  return { selected: defaultChatQuickActions(kind), pendingSync: false };
}

export async function loadChatQuickActions(userId: string, conversationId: string, kind: 'direct' | 'group'): Promise<ChatQuickAction[]> {
  return (await loadChatQuickActionState(userId, conversationId, kind)).selected;
}

export async function saveChatQuickActions(userId: string, conversationId: string, kind: 'direct' | 'group', selected: ChatQuickAction[], pendingSync = false) {
  if (!userId || !conversationId) return;
  await AsyncStorage.setItem(storageKey(userId, conversationId, kind, 3), JSON.stringify({ selected: normalizeChatQuickActions(selected), pendingSync }));
}

export async function markChatQuickActionsSynced(userId: string, conversationId: string, kind: 'direct' | 'group', selected: ChatQuickAction[]) {
  const stored = await loadChatQuickActionState(userId, conversationId, kind);
  if (JSON.stringify(stored.selected) === JSON.stringify(selected)) await saveChatQuickActions(userId, conversationId, kind, selected);
}
