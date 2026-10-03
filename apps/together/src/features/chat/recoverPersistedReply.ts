import type { Message } from '../../types';
import {
  DIALOGUE_RECOVERY_DELAYS_MS,
  persistedDialogueResponseForRequest,
} from '../../lib/dialogueRecovery';
import { waitForWebPageVisible } from '../../lib/webPageLifecycle';

/** Recovery only reads the durable turn with its original request ID; it never sends a new turn. */
export async function recoverPersistedReply<Page>(options: {
  requestId: string;
  isCurrent: () => boolean;
  load: () => Promise<Page>;
  messages: (page: Page) => Message[];
  shouldContinue?: (page: Page) => boolean;
  acceptResponse?: (page: Page, response: Message) => Promise<boolean>;
  waitUntilVisible?: () => Promise<unknown>;
  wait?: (ms: number) => Promise<unknown>;
  delays?: readonly number[];
}): Promise<{ status: 'recovered' | 'unresolved' | 'cancelled'; latest: Page | null }> {
  let latest: Page | null = null;
  const cancelled = () => ({ status: 'cancelled' as const, latest: null });
  if (!options.isCurrent()) return cancelled();
  await (options.waitUntilVisible ?? waitForWebPageVisible)();
  for (const delay of options.delays ?? DIALOGUE_RECOVERY_DELAYS_MS) {
    if (!options.isCurrent()) return cancelled();
    await (options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(delay);
    if (!options.isCurrent()) return cancelled();
    try {
      const page = await options.load();
      if (!options.isCurrent()) return cancelled();
      latest = page;
      const response = persistedDialogueResponseForRequest(
        options.messages(page),
        options.requestId,
      );
      if (!response) {
        if (options.shouldContinue?.(page) === false) break;
        continue;
      }
      const accepted = !options.acceptResponse || await options.acceptResponse(page, response);
      if (!options.isCurrent()) return cancelled();
      if (accepted) return { status: 'recovered', latest };
    } catch {
      /* A waking browser radio can fail the first read; retry within the bounded window. */
    }
  }
  return options.isCurrent() ? { status: 'unresolved', latest } : cancelled();
}
