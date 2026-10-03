import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GroupDetail } from '../../types';
import { dialogueFailureMayHavePersisted } from '../../lib/dialogueRecovery';
import { mergeGroupDetailRefresh } from '../../lib/groupDetailReconciliation';
import { subscribeToWebPageResume } from '../../lib/webPageLifecycle';
import { loadGroupConversation } from './loadGroupConversation';
import type { ChatRequestScope } from './requestScope';

export function useGroupConversationLoad(options: {
  scope: ChatRequestScope;
  cacheScope: string;
  conversationId?: string;
  ready: boolean;
  attempt: number;
  connectionPhase: string;
  loadedConversation: MutableRefObject<string | null>;
  setDetail: Dispatch<SetStateAction<GroupDetail | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  retry: () => void;
  prepareScroll: (conversationId: string) => void;
}) {
  const { scope, cacheScope, conversationId, ready, attempt, connectionPhase } = options;
  const current = useRef(options);
  useLayoutEffect(() => {
    current.current = options;
  });
  const activeRead = useRef<AbortController | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    if (!ready || !conversationId || activeRead.current) return;
    const request = scope.start('group-load');
    if (!request) return;
    const controller = new AbortController();
    activeRead.current = controller;
    if (!fresh) {
      current.current.setLoading(true);
      current.current.setError('');
      current.current.prepareScroll(conversationId);
    }
    try {
      const detail = await loadGroupConversation({
        cacheScope,
        conversationId,
        signal: controller.signal,
        fresh,
      });
      if (!request.isCurrent() || controller.signal.aborted) return;
      current.current.loadedConversation.current = conversationId;
      current.current.setDetail((previous) => mergeGroupDetailRefresh(previous, detail));
      current.current.setError((previous) =>
        !fresh || dialogueFailureMayHavePersisted(new Error(previous)) ? '' : previous
      );
    } catch (caught) {
      if (request.isCurrent() && !controller.signal.aborted && !fresh) {
        current.current.setError(
          caught instanceof Error ? caught.message : 'This group could not be loaded.',
        );
      }
      // Resume failure keeps the visible timeline; focus/realtime can retry.
    } finally {
      if (activeRead.current === controller) activeRead.current = null;
      if (request.isCurrent() && !controller.signal.aborted) current.current.setLoading(false);
      request.release();
    }
  }, [cacheScope, conversationId, ready, scope]);

  useEffect(() => {
    void load(false);
    return () => {
      activeRead.current?.abort();
      activeRead.current = null;
      scope.start('group-load', true)?.release();
    };
  }, [attempt, load, scope]);

  const resume = useCallback(() => {
    if (!ready || !conversationId || activeRead.current) return;
    if (current.current.loadedConversation.current !== conversationId) current.current.retry();
    else void load(true);
  }, [conversationId, load, ready]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(resume, 180);
    };
    const unsubscribe = subscribeToWebPageResume(schedule);
    if (connectionPhase === 'reconnected') schedule();
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [connectionPhase, resume]);
}
