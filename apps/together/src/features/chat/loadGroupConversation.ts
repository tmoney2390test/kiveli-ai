import { loadGroupDetail } from '../../lib/api/groups';
import { ApiError } from '../../lib/api/transport';
import { prefetchCompleteGroupDetail } from '../../lib/groupDetailCache';
import { throwIfRequestAborted } from '../../lib/requestAbort';
import { withIdempotentRetry } from '../../lib/requestRetry';
import { waitForWebPageVisible } from '../../lib/webPageLifecycle';

/** One read path for initial loads and resume; it never sends or replays a message. */
export function loadGroupConversation(options: {
  cacheScope: string;
  conversationId: string;
  signal: AbortSignal;
  fresh?: boolean;
}) {
  const { cacheScope, conversationId, signal } = options;
  return withIdempotentRetry(async () => {
    await waitForWebPageVisible(signal);
    throwIfRequestAborted(signal);
    try {
      return await prefetchCompleteGroupDetail(cacheScope, conversationId, async () => {
        const next = await loadGroupDetail(conversationId, {
          messageLimit: 30,
          signal,
          timeoutMs: options.fresh ? 20_000 : 12_000,
        });
        throwIfRequestAborted(signal);
        if (next.conversation.id !== conversationId) {
          throw new Error('This group could not be loaded. Please try again.');
        }
        return next;
      }, { maxAgeMs: options.fresh ? -1 : 15_000 });
    } catch (caught) {
      // A previous mount may have owned an aborted, coalesced warmup. Retry the
      // read for this still-active screen instead of showing "group not found".
      if (!signal.aborted && caught instanceof Error && caught.name === 'AbortError') {
        throw new ApiError('Group request was interrupted.', 'REQUEST_INTERRUPTED', true);
      }
      throw caught;
    }
  }, { attempts: 3, delayMs: 350, signal });
}
