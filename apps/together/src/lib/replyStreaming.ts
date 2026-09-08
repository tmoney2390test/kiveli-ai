import type { Message } from '../types';

/** Coalesce tiny provider chunks without delaying the first readable text. */
export function batchReplyText(emit: (text: string) => void, intervalMs = 35) {
  let pending = '', started = false, timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const text = pending; pending = '';
    if (text) emit(text);
  };
  return {
    push(text: string) {
      if (!text) return;
      if (!started) { started = true; emit(text); return; }
      pending += text;
      timer ??= setTimeout(flush, intervalMs);
    },
    flush,
    dispose() { if (timer) clearTimeout(timer); timer = undefined; pending = ''; },
  };
}

export type ReplyDelta = { type: 'message_delta'; turnId: string; replyKey: string; characterInstanceId: string; speakerName: string; text: string; sequence: number };
export type ReplyDraft = Omit<ReplyDelta, 'type'>;
export type ReplyDraftState = { turnId: string | null; drafts: ReplyDraft[]; completed: string[] };
export const emptyReplyDrafts = (): ReplyDraftState => ({ turnId: null, drafts: [], completed: [] });
type DraftEvent = ReplyDelta | { type: 'turn_started'; turnId: string } | { type: 'message_completed'; message: Message } | { type: 'turn_cancelled' | 'turn_yielded' | 'turn_completed'; turnId: string };

/** SSE is ordered. Ignore duplicates and stale turns; persisted messages win. */
export function reduceReplyDrafts(state: ReplyDraftState, event: DraftEvent): ReplyDraftState {
  if (event.type === 'turn_started') return state.turnId === event.turnId ? state : { ...emptyReplyDrafts(), turnId: event.turnId };
  if (event.type === 'message_completed') {
    const key = event.message.response_key;
    if (!key || event.message.dialogue_turn_id !== state.turnId) return state;
    return { ...state, drafts: state.drafts.filter(draft => draft.replyKey !== key), completed: [...new Set([...state.completed, key])] };
  }
  if (event.turnId !== state.turnId) return state;
  if (event.type !== 'message_delta') return emptyReplyDrafts();
  if (state.completed.includes(event.replyKey)) return state;
  const prior = state.drafts.find(draft => draft.replyKey === event.replyKey);
  if (event.sequence !== (prior?.sequence ?? 0) + 1) return state;
  const draft: ReplyDraft = { ...event, text: (prior?.text ?? '') + event.text };
  return { ...state, drafts: [...state.drafts.filter(item => item.replyKey !== event.replyKey), draft] };
}
