import { useEffect, useRef, useState } from 'react';
import { normalizeContextPreference } from '@together/domain/src/chat-context';
import { contextCostNoticeToken } from '@together/domain/src/context-cost-confirmation';
import { quoteDialogueContext } from '../lib/api';
import { confirmContextCost, contextCostConfirmed } from '../lib/contextCostConfirmation';

type Draft = Record<string, unknown>;
export type ContextCostPrompt = { kind: 'confirm' | 'photo' | 'error'; message?: string };
export type ContextCostChoice = 'proceed' | 'included' | 'retry' | 'cancel';
type Authorization = { contextQuoteId?: string; contextPreference?: 'included' };
type Pending = { controller: AbortController; resolve?: (choice: ContextCostChoice) => void };

export function useContextQuote({ userId, preference, activationId, draft, revision, paused = false, hasPendingPhoto = false }: {
  userId?: string; preference: unknown; activationId?: unknown; draft: Draft; revision: string; paused?: boolean; hasPendingPhoto?: boolean;
}) {
  const selected = normalizeContextPreference(preference);
  const token = contextCostNoticeToken(selected, activationId);
  const conversationId = String(draft.conversationId ?? '');
  const scope = JSON.stringify([userId, conversationId, token, draft, revision, paused, hasPendingPhoto]);
  const liveScope = useRef(scope); liveScope.current = scope;
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const [prompt, setPrompt] = useState<ContextCostPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const cancelPending = () => {
    const request = pending.current; pending.current = null;
    request?.controller.abort(); request?.resolve?.('cancel');
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelPending(); }; }, []);
  useEffect(() => { setPrompt(null); setBusy(false); return cancelPending; }, [scope]);

  const respond = (choice: ContextCostChoice) => {
    const request = pending.current, resolve = request?.resolve;
    if (!request || !resolve) return;
    request.resolve = undefined; setPrompt(null); resolve(choice);
  };
  async function authorize(payload: Draft): Promise<Authorization | null> {
    if (paused || pending.current || !conversationId || payload.conversationId !== conversationId) return null;
    if (selected === 'included') return { contextPreference: 'included' };
    if (!userId) return null;
    const request: Pending = { controller: new AbortController() }, startedScope = scope;
    pending.current = request; setBusy(true);
    const current = () => mounted.current && pending.current === request && liveScope.current === startedScope && !request.controller.signal.aborted;
    const ask = (value: ContextCostPrompt) => new Promise<ContextCostChoice>(resolve => {
      if (!current()) { resolve('cancel'); return; }
      request.resolve = resolve; setPrompt(value);
    });
    try {
      // The upload flow cannot quote a photo before its owned attachment exists.
      if (hasPendingPhoto) return await ask({ kind: 'photo' }) === 'included' && current() ? { contextPreference: 'included' } : null;
      if (token && !await contextCostConfirmed(userId, conversationId, token)) {
        if (!current() || await ask({ kind: 'confirm' }) !== 'proceed' || !current()) return null;
        await confirmContextCost(userId, conversationId, token);
      }
      while (current()) {
        try {
          const quote = await quoteDialogueContext(payload, request.controller.signal);
          if (!current()) return null;
          if (quote.contextPreference !== selected || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now() + 1000) throw new Error('The memory setting or price changed. Please try again.');
          return { contextQuoteId: quote.quoteId };
        } catch (error) {
          if (!current()) return null;
          const choice = await ask({ kind: 'error', message: error instanceof Error ? error.message : 'The message price is unavailable.' });
          if (!current()) return null;
          if (choice === 'included') return { contextPreference: 'included' };
          if (choice !== 'retry') return null;
        }
      }
      return null;
    } finally {
      if (pending.current === request) { pending.current = null; if (mounted.current) { setBusy(false); setPrompt(null); } }
    }
  }
  // No per-keystroke pricing: Send continues automatically after authorization.
  return { selected, prompt, respond, blocked: busy, authorize };
}
