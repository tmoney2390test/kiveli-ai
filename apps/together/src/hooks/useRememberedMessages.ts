import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRememberedMessageStatus } from '../lib/api/memory';

type MessageReference = { id: string; created_at: string };
type RememberedState = { scope: string; memoryIds: Map<string, string> };

const isPersistedId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const memoryKey = (messageId: string, characterInstanceId: string) => `${messageId}:${characterInstanceId}`;

export function useRememberedMessages(input: {
  userId?: string;
  continuityId?: string;
  conversationId?: string;
  messages: MessageReference[];
  enabled: boolean;
}) {
  const scope = `${input.userId ?? ''}:${input.continuityId ?? ''}:${input.conversationId ?? ''}`;
  const [state, setState] = useState<RememberedState>({ scope: '', memoryIds: new Map() });
  const [focusVersion, setFocusVersion] = useState(0);
  const requestVersion = useRef(0);
  const localChanges = useRef<{ scope: string; memoryIds: Map<string, string | null> }>({ scope: '', memoryIds: new Map() });
  const messageIdsRef = useRef<string[]>([]);
  const persisted = input.messages.filter((message) => isPersistedId(message.id));
  messageIdsRef.current = [...new Set(persisted.map((message) => message.id))];
  const oldest = persisted.reduce<MessageReference | null>((current, message) =>
    !current || message.created_at < current.created_at ? message : current, null)?.id ?? '';

  useFocusEffect(useCallback(() => {
    setFocusVersion((version) => version + 1);
  }, []));

  useEffect(() => {
    const version = ++requestVersion.current;
    localChanges.current = { scope, memoryIds: new Map() };
    if (!input.enabled || !input.userId || !input.continuityId || !input.conversationId || !focusVersion || !oldest) return;
    const conversationId = input.conversationId;
    const timer = setTimeout(() => {
      const ids = messageIdsRef.current;
      const batches: string[][] = [];
      for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100));
      void Promise.all(batches.map((batch) => getRememberedMessageStatus(conversationId, batch)))
        .then((results) => {
          if (requestVersion.current !== version) return;
          const memoryIds = new Map(results.flatMap((result) => result.remembered.map((item) =>
            [memoryKey(item.messageId, item.characterInstanceId), item.memoryId] as const)));
          if (localChanges.current.scope === scope) {
            for (const [key, memoryId] of localChanges.current.memoryIds) {
              if (memoryId) memoryIds.set(key, memoryId);
              else memoryIds.delete(key);
            }
          }
          setState({ scope, memoryIds });
        })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [scope, input.enabled, input.userId, input.continuityId, input.conversationId, oldest, focusVersion]);

  const memoryIdFor = (messageId: string, characterInstanceId: string) =>
    state.scope === scope ? state.memoryIds.get(memoryKey(messageId, characterInstanceId)) ?? null : null;
  const markRemembered = (messageId: string, characterInstanceId: string, memoryId: string) => {
    const key = memoryKey(messageId, characterInstanceId);
    if (localChanges.current.scope !== scope) localChanges.current = { scope, memoryIds: new Map() };
    localChanges.current.memoryIds.set(key, memoryId);
    setState((current) => ({
      scope,
      memoryIds: new Map([...(current.scope === scope ? current.memoryIds : []), [key, memoryId]]),
    }));
  };
  const unmarkRemembered = (messageId: string, characterInstanceId: string) => {
    const key = memoryKey(messageId, characterInstanceId);
    if (localChanges.current.scope !== scope) localChanges.current = { scope, memoryIds: new Map() };
    localChanges.current.memoryIds.set(key, null);
    setState((current) => {
      const memoryIds = new Map(current.scope === scope ? current.memoryIds : []);
      memoryIds.delete(key);
      return { scope, memoryIds };
    });
  };
  return { isRemembered: (messageId: string, characterInstanceId: string) => Boolean(memoryIdFor(messageId, characterInstanceId)), memoryIdFor, markRemembered, unmarkRemembered };
}
