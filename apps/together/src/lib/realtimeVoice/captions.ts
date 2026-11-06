export type CallCaption = { role: 'user' | 'assistant'; content: string };
export type CallCaptionState = { caption: CallCaption | null; partial: CallCaption | null };
export type CallCaptionEvent =
  | ({ type: 'partial' | 'final' } & CallCaption)
  | { type: 'reset' };

export const emptyCallCaption: CallCaptionState = { caption: null, partial: null };

// The visible line outlives the provider's streaming buffer. Metering and
// transcript uploads must not clear it when an utterance finishes.
export function reduceCallCaption(state: CallCaptionState, event: CallCaptionEvent): CallCaptionState {
  if (event.type === 'reset') return emptyCallCaption;
  if (!event.content) return state;
  if (event.type === 'partial') {
    const content = event.role === 'assistant' && state.partial?.role === 'assistant'
      ? state.partial.content + event.content
      : event.content;
    if (!content.trim()) return state;
    const partial = { role: event.role, content: content.slice(-4_000) };
    return { caption: partial, partial };
  }
  if (!event.content.trim()) return state;
  // A delayed final from the other speaker must not erase a line already
  // streaming (for example, when speech recognition finishes after a reply starts).
  if (state.partial && state.partial.role !== event.role) return state;
  return { caption: { role: event.role, content: event.content.trim().slice(0, 4_000) }, partial: null };
}
