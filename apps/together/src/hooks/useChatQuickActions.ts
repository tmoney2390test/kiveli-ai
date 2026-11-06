import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatQuickAction, loadChatQuickActionState, markChatQuickActionsSynced, migrateLegacyChatQuickActions, migrateV2ChatQuickActions, normalizeChatQuickActions, saveChatQuickActions } from '../lib/chatQuickActions';
import { manageConversation } from '../lib/api/conversations';
import { manageGroup } from '../lib/api/groups';

export function useChatQuickActions(userId: string | undefined, conversationId: string | undefined, kind: 'direct' | 'group', serverSelected?: unknown, serverVersion?: unknown) {
  const scope = `${userId ?? ''}:${kind}:${conversationId ?? ''}`;
  const [state, setState] = useState<{ scope: string; selected: ChatQuickAction[]; ready: boolean }>({ scope, selected: [], ready: false });
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const ready = state.scope === scope && state.ready;
  const selected = state.scope === scope ? state.selected : [];
  const enqueueSync = useCallback((actions: ChatQuickAction[]) => {
    if (!userId || !conversationId) return;
    syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
      if (kind === 'group') await manageGroup({ action: 'quick_actions', conversationId, quickActions: actions });
      else await manageConversation({ action: 'quick_actions', conversationId, quickActions: actions });
      await markChatQuickActionsSynced(userId, conversationId, kind, actions);
    });
  }, [userId, conversationId, kind]);
  useEffect(() => {
    let active = true;
    setState({ scope, selected: [], ready: false });
    if (!userId || !conversationId) return () => { active = false; };
    void loadChatQuickActionState(userId, conversationId, kind).then((local) => {
      if (!active) return;
      const server = Array.isArray(serverSelected)
        ? serverVersion === 3 ? normalizeChatQuickActions(serverSelected)
          : serverVersion === 2 ? migrateV2ChatQuickActions(serverSelected, kind)
            : migrateV2ChatQuickActions(migrateLegacyChatQuickActions(serverSelected), kind)
        : null;
      const choice = local.pendingSync || !server ? local.selected : server;
      setState({ scope, selected: choice, ready: true });
      if (local.pendingSync || serverVersion !== 3 || !server) enqueueSync(choice);
      else if (server) void saveChatQuickActions(userId, conversationId, kind, server).catch(() => undefined);
    });
    return () => { active = false; };
  }, [userId, conversationId, kind, scope, enqueueSync]);
  const change = useCallback((next: ChatQuickAction[]) => {
    if (!ready || !userId || !conversationId) return;
    const normalized = normalizeChatQuickActions(next);
    setState({ scope, selected: normalized, ready: true });
    void saveChatQuickActions(userId, conversationId, kind, normalized, true).then(() => enqueueSync(normalized)).catch(() => undefined);
  }, [ready, userId, conversationId, kind, scope, enqueueSync]);
  return { selected, ready, change };
}
