import { describe, it, expect, vi } from 'vitest';
import { batchReplyText, emptyReplyDrafts, reduceReplyDrafts, type ReplyDelta } from './replyStreaming';
import type { Message } from '../types';

describe('progressive reply delivery', () => {
  it('shows the first chunk immediately, batches the rest, and flushes before completion', () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn(), batch = batchReplyText(emit);
      batch.push('Hello'); batch.push(', '); batch.push('there');
      expect(emit.mock.calls).toEqual([['Hello']]);
      vi.advanceTimersByTime(35);
      expect(emit.mock.calls).toEqual([['Hello'], [', there']]);
      batch.push('!'); batch.flush(); batch.dispose(); vi.runAllTimers();
      expect(emit.mock.calls).toEqual([['Hello'], [', there'], ['!']]);
    } finally { vi.useRealTimers(); }
  });
  it('does not deliver buffered text after disposal', () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn(), batch = batchReplyText(emit);
      batch.push('First'); batch.push(' stale'); batch.dispose(); vi.runAllTimers();
      expect(emit.mock.calls).toEqual([['First']]);
    } finally { vi.useRealTimers(); }
  });
  const delta: ReplyDelta = { type:'message_delta', turnId:'one', replyKey:'group:one:action', characterInstanceId:'speaker', speakerName:'Maya', text:'Hello', sequence:1 };
  it('deduplicates deltas, ignores stale turns and reconciles canonical replacements', () => {
    let state=reduceReplyDrafts(emptyReplyDrafts(),{type:'turn_started',turnId:'one'});
    state=reduceReplyDrafts(state,delta);
    state=reduceReplyDrafts(state,delta);
    expect(state.drafts[0]?.text).toBe('Hello');
    const completed={id:'canonical',response_key:delta.replyKey,dialogue_turn_id:'one',content:'Approved final replacement'} as Message;
    state=reduceReplyDrafts(state,{type:'message_completed',message:completed});
    state=reduceReplyDrafts(state,{...delta,sequence:2,text:' stale'});
    expect(state.drafts).toEqual([]);
    state=reduceReplyDrafts(state,{type:'turn_started',turnId:'two'});
    state=reduceReplyDrafts(state,delta);
    state=reduceReplyDrafts(state,{type:'turn_cancelled',turnId:'one'});
    expect(state.turnId).toBe('two');
  });
  it('discards interrupted drafts and never presents a missing chunk as continuous text', () => {
    let state=reduceReplyDrafts(emptyReplyDrafts(),{type:'turn_started',turnId:'one'});
    state=reduceReplyDrafts(state,{...delta,sequence:2});
    expect(state.drafts).toEqual([]);
    state=reduceReplyDrafts(state,delta);
    state=reduceReplyDrafts(state,{type:'turn_cancelled',turnId:'one'});
    expect(state).toEqual(emptyReplyDrafts());
  });
});
