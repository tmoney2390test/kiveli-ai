import { describe, expect, it } from 'vitest';
import { emptyCallCaption, reduceCallCaption } from './captions';
import { parseXaiRealtimeEvent } from './events';

describe('live call captions', () => {
  it('keeps the completed line visible and starts the next reply with a fresh buffer', () => {
    let state = reduceCallCaption(emptyCallCaption, { type: 'partial', role: 'assistant', content: 'Hello' });
    state = reduceCallCaption(state, { type: 'partial', role: 'assistant', content: ' there.' });
    expect(state.caption?.content).toBe('Hello there.');
    state = reduceCallCaption(state, { type: 'final', role: 'assistant', content: 'Hello there!' });
    expect(state.caption).toEqual({ role: 'assistant', content: 'Hello there!' });
    expect(state.partial).toBeNull();
    state = reduceCallCaption(state, { type: 'partial', role: 'assistant', content: 'How are you?' });
    expect(state.caption?.content).toBe('How are you?');
  });

  it('replaces cumulative user recognition and shows final-only speech', () => {
    let state = reduceCallCaption(emptyCallCaption, { type: 'partial', role: 'user', content: 'I am' });
    state = reduceCallCaption(state, { type: 'partial', role: 'user', content: 'I am fine' });
    expect(state.caption?.content).toBe('I am fine');
    state = reduceCallCaption(state, { type: 'final', role: 'user', content: 'I am fine.' });
    expect(state.caption).toEqual({ role: 'user', content: 'I am fine.' });
    state = reduceCallCaption(state, { type: 'final', role: 'assistant', content: 'Glad to hear it.' });
    expect(state.caption?.content).toBe('Glad to hear it.');
  });

  it('does not let delayed user recognition erase a reply already streaming', () => {
    let state = reduceCallCaption(emptyCallCaption, { type: 'partial', role: 'assistant', content: 'Good' });
    state = reduceCallCaption(state, { type: 'final', role: 'user', content: 'Hello' });
    state = reduceCallCaption(state, { type: 'partial', role: 'assistant', content: ' evening.' });
    expect(state.caption).toEqual({ role: 'assistant', content: 'Good evening.' });
  });

  it('preserves spaces across provider deltas, including a standalone space', () => {
    let state = emptyCallCaption;
    for (const delta of ['Hello', ' ', 'there', ', welcome back.']) {
      const event = parseXaiRealtimeEvent({ type: 'response.output_audio_transcript.delta', delta }, false);
      expect(event.kind).toBe('transcript_partial');
      if (event.kind === 'transcript_partial') state = reduceCallCaption(state, { ...event, type: 'partial' });
    }
    expect(state.caption?.content).toBe('Hello there, welcome back.');
  });

  it('ignores empty finals and clears only when the call is explicitly reset', () => {
    const state = reduceCallCaption(emptyCallCaption, { type: 'final', role: 'assistant', content: 'See you soon.' });
    expect(reduceCallCaption(state, { type: 'final', role: 'assistant', content: ' ' })).toBe(state);
    expect(reduceCallCaption(state, { type: 'reset' })).toEqual(emptyCallCaption);
  });
});
