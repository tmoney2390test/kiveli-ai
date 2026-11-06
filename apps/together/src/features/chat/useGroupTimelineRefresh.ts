import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { loadGroupDetail, manageGroup } from '../../lib/api/groups';
import {
  applyGroupDetailDelta,
  mergeGroupDetailRefresh,
  prependGroupTimelinePage,
} from '../../lib/groupDetailReconciliation';
import type { GroupDetail, GroupDetailDelta, GroupTimelinePage } from '../../types';
import type { ChatRequestScope } from './requestScope';

/** Background catch-up and pagination share session ownership, but never block each other. */
export function useGroupTimelineRefresh(options: {
  scope: ChatRequestScope;
  conversationId?: string;
  detail: GroupDetail | null;
  setDetail: Dispatch<SetStateAction<GroupDetail | null>>;
  setOlderLoading: Dispatch<SetStateAction<boolean>>;
  onBeforePrepend: () => void;
  onPrependFailed: () => void;
  onError: (message: string) => void;
}) {
  const { scope, conversationId, setDetail, setOlderLoading } = options;
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const queue = useMemo(() => ({ queued: false, lastFullCatchUp: 0 }), [scope]);
  const refresh = useCallback(async function refreshDelta() {
    const current = latest.current.detail;
    if (!conversationId || current?.conversation.id !== conversationId || !current.syncedAt) return;
    const request = scope.start('group-delta');
    if (!request) {
      queue.queued = true;
      return;
    }
    try {
      const delta = await manageGroup<GroupDetailDelta>({
        action: 'changes',
        conversationId,
        since: current.syncedAt,
      });
      if (request.isCurrent()) {
        setDetail((value) =>
          value?.conversation.id === conversationId ? applyGroupDetailDelta(value, delta) : value
        );
      }
    } catch {
      if (request.isCurrent() && Date.now() - queue.lastFullCatchUp > 60_000) {
        queue.lastFullCatchUp = Date.now();
        try {
          const next = await loadGroupDetail(conversationId, {
            messageLimit: 30,
            timeoutMs: 20_000,
          });
          if (request.isCurrent()) {
            setDetail((value) =>
              value?.conversation.id === conversationId
                ? mergeGroupDetailRefresh(value, next)
                : value
            );
          }
        } catch { /* Focus or the next catch-up check can retry. */ }
      }
    } finally {
      const current = request.isCurrent();
      request.release();
      if (current && queue.queued) {
        queue.queued = false;
        void refreshDelta();
      }
    }
  }, [conversationId, queue, scope, setDetail]);

  const loadOlder = useCallback(async () => {
    const current = latest.current.detail, oldest = current?.messages[0];
    if (
      !conversationId || current?.conversation.id !== conversationId || !current.hasMoreMessages ||
      !oldest
    ) return;
    const request = scope.start('group-older');
    if (!request) return;
    setOlderLoading(true);
    try {
      const page = await manageGroup<GroupTimelinePage>({
        action: 'messages',
        conversationId,
        ...(oldest.conversation_sequence ? { beforeSequence: oldest.conversation_sequence } : {}),
        before: oldest.created_at,
        limit: 50,
      });
      if (!request.isCurrent()) return;
      latest.current.onBeforePrepend();
      setDetail((value) =>
        value?.conversation.id === conversationId ? prependGroupTimelinePage(value, page) : value
      );
    } catch (caught) {
      if (request.isCurrent()) {
        latest.current.onPrependFailed();
        latest.current.onError(
          caught instanceof Error ? caught.message : 'Earlier messages could not be loaded.',
        );
      }
    } finally {
      if (request.isCurrent()) setOlderLoading(false);
      request.release();
    }
  }, [conversationId, scope, setDetail, setOlderLoading]);
  return { refresh, loadOlder };
}
