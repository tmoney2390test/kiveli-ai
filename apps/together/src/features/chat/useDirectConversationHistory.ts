import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Message } from '../../types';
import { manageConversation } from '../../lib/api/conversations';
import { mergeOlderMessages } from '../../lib/conversation';
import { reconcileMessages } from '../../lib/messageReconciliation';
import {
  loadConversationMessagePage,
  readConversationMessagePage,
  writeConversationMessagePage,
} from '../../lib/conversationMessageWarmup';
import { coalescedRefresh } from '../../lib/coalescedRefresh';
import { createRealtimeChannel } from '../../lib/realtimeChannel';
import { createClientRequestId } from '../../lib/requestId';
import { supabase } from '../../lib/supabase';
import { subscribeToWebPageResume } from '../../lib/webPageLifecycle';
import type { ChatRequestScope } from './requestScope';
import { useScopedChatState } from './useScopedChatState';

export const CONVERSATION_PAGE_SIZE = 50;
const initialHistory = {
  messages: [] as Message[],
  loadedConversationId: null as string | null,
  verifiedHistoryId: null as string | null,
  loading: true,
  historyLoadFailed: false,
  loadingOlder: false,
  hasMore: true,
  olderPagesLoaded: false,
};

/** State is separate from subscriptions so the screen can wire scroll callbacks without owning IO. */
export function useDirectHistoryState(scope: ChatRequestScope) {
  const [state, setState] = useScopedChatState(scope, initialHistory);
  const [attempt, setAttempt] = useScopedChatState(scope, 0);
  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>((update) => {
    setState((current) => ({
      ...current,
      messages: typeof update === 'function' ? update(current.messages) : update,
    }));
  }, [setState]);
  const retry = useCallback(() => setAttempt((value) => value + 1), [setAttempt]);
  return { ...state, setState, setMessages, attempt, retry };
}

type History = ReturnType<typeof useDirectHistoryState>;

export function useDirectConversationHistory(options: {
  scope: ChatRequestScope;
  history: History;
  userId?: string;
  conversationId?: string;
  connectionPhase: string;
  pendingRequestId?: string;
  demo: boolean;
  onReset: (conversationId: string) => void;
  onRead: (conversationId: string) => Promise<unknown>;
  onError: (message: string) => void;
  onRecovered: () => void;
  onBeforePrepend: () => void;
}) {
  const { scope, userId, conversationId, connectionPhase, pendingRequestId, demo } = options;
  const { setState, setMessages, attempt } = options.history;
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const channelId = useRef(createClientRequestId());

  const read = useCallback(async (maxAgeMs: number) => {
    const loader = () =>
      manageConversation<{ messages: Message[]; hasMore: boolean }>({
        action: 'messages',
        conversationId,
        limit: CONVERSATION_PAGE_SIZE,
      });
    if (userId && conversationId) {
      return loadConversationMessagePage(userId, conversationId, loader, { maxAgeMs });
    }
    const result = await loader();
    return { ...result, messages: [...result.messages].reverse() };
  }, [conversationId, userId]);

  const refresh = useCallback(async () => {
    if (!conversationId || demo) return;
    const isCurrent = scope.capture();
    if (!isCurrent()) return;
    const result = await read(-1);
    if (!isCurrent()) return;
    setState((current) => ({
      ...current,
      messages: reconcileMessages(current.messages, result.messages),
      hasMore: current.olderPagesLoaded ? current.hasMore : result.hasMore,
      loadedConversationId: conversationId,
      verifiedHistoryId: conversationId,
      loading: false,
      historyLoadFailed: false,
    }));
    latest.current.onRecovered();
    await latest.current.onRead(conversationId).catch(() => undefined);
  }, [conversationId, demo, read, scope, setState]);

  useEffect(() => {
    if (!conversationId) {
      setState({ ...initialHistory, loading: false });
      return;
    }
    let cancelled = false;
    const isCurrent = scope.capture();
    // A retry also invalidates an older-page request from the failed view.
    scope.start('older-history', true)?.release();
    const cached = userId ? readConversationMessagePage(userId, conversationId) : null;
    latest.current.onReset(conversationId);
    setState({
      ...initialHistory,
      ...(cached
        ? {
          messages: cached.messages,
          hasMore: cached.hasMore,
          loadedConversationId: conversationId,
          loading: false,
        }
        : {}),
    });
    if (demo) {
      setState({
        ...initialHistory,
        hasMore: false,
        loadedConversationId: conversationId,
        loading: false,
      });
      return;
    }
    void read(1_500).then((page) => {
      if (cancelled || !isCurrent()) return;
      setState((current) => ({
        ...current,
        messages: reconcileMessages(current.messages, page.messages),
        hasMore: page.hasMore,
        loadedConversationId: conversationId,
        verifiedHistoryId: conversationId,
        loading: false,
      }));
      void latest.current.onRead(conversationId).catch(() => undefined);
    }).catch(() => {
      if (cancelled || !isCurrent()) return;
      if (!cached) latest.current.onError('Conversation history could not be loaded.');
      setState((current) => ({ ...current, loading: false, historyLoadFailed: !cached }));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, conversationId, demo, read, scope, setState, userId]);

  const { loadedConversationId, messages, hasMore } = options.history;
  useEffect(() => {
    if (userId && conversationId && loadedConversationId === conversationId) {
      writeConversationMessagePage(
        userId,
        conversationId,
        { messages, hasMore },
        readConversationMessagePage(userId, conversationId)?.loadedAt ?? 0,
      );
    }
  }, [conversationId, hasMore, loadedConversationId, messages, userId]);

  const lastFocus = useRef<ChatRequestScope | null>(null);
  useFocusEffect(useCallback(() => {
    if (!conversationId || demo) return;
    const updates = coalescedRefresh(refresh);
    if (lastFocus.current === scope) updates.schedule();
    lastFocus.current = scope;
    // Realtime only invalidates the API projection; never render unchecked payloads.
    const channel = createRealtimeChannel(
      supabase,
      `kivelle-messages-${conversationId}-${channelId.current}`,
    )
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'together_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, updates.schedule)
      .subscribe();
    return () => {
      updates.dispose();
      void supabase.removeChannel(channel);
    };
  }, [conversationId, demo, refresh, scope]));

  useEffect(() => {
    const updates = coalescedRefresh(refresh);
    const unsubscribe = subscribeToWebPageResume(updates.schedule);
    if (connectionPhase === 'reconnected') updates.schedule();
    return () => {
      updates.dispose();
      unsubscribe();
    };
  }, [connectionPhase, refresh]);

  const pending = useRef<{ scope: ChatRequestScope; id?: string } | null>(null);
  useEffect(() => {
    const previous = pending.current;
    pending.current = { scope, id: pendingRequestId };
    if (previous?.scope === scope && previous.id && !pendingRequestId) {
      void refresh().catch(() => undefined);
    }
  }, [pendingRequestId, refresh, scope]);

  const loadOlder = useCallback(async () => {
    const { history } = latest.current;
    const oldest = history.messages[0];
    if (!conversationId || !oldest || !history.hasMore || history.loading) return;
    const request = scope.start('older-history');
    if (!request) return;
    setState((current) => ({ ...current, loadingOlder: true }));
    try {
      const result = await manageConversation<{ messages: Message[]; hasMore: boolean }>({
        action: 'messages',
        conversationId,
        limit: CONVERSATION_PAGE_SIZE,
        ...(oldest.conversation_sequence
          ? { beforeSequence: oldest.conversation_sequence }
          : { before: oldest.created_at }),
      });
      if (!request.isCurrent()) return;
      if (result.messages.length) {
        latest.current.onBeforePrepend();
        setMessages((current) => mergeOlderMessages(result.messages, current));
      }
      setState((current) => ({ ...current, hasMore: result.hasMore, olderPagesLoaded: true }));
    } catch (caught) {
      if (request.isCurrent()) {
        latest.current.onError(
          caught instanceof Error ? caught.message : 'Earlier messages could not be loaded.',
        );
      }
    } finally {
      if (request.isCurrent()) setState((current) => ({ ...current, loadingOlder: false }));
      request.release();
    }
  }, [conversationId, scope, setMessages, setState]);
  return { loadOlder };
}
