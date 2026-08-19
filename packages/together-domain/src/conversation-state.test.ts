import { describe, expect, it } from 'vitest';
import { formatRollingConversationState, mergeRollingConversationState, parseRollingConversationState } from './conversation-state.ts';

describe('structured rolling conversation state', () => {
  it('captures topic, intent, stance, emotion, decisions, unresolved points, and important wording', () => {
    const value = mergeRollingConversationState('', [
      { id: '1', role: 'user', content: 'Today was awful. I feel overwhelmed about the presentation.', createdAt: '2026-08-19T12:00:00Z' },
      { id: '2', role: 'assistant', content: 'I care about you, but do not quit tonight. Sleep on it first.', createdAt: '2026-08-19T12:01:00Z' },
      { id: '3', role: 'user', content: "Okay. Let's talk after my presentation, but I am not sure what time.", createdAt: '2026-08-19T12:02:00Z' },
    ], new Date('2026-08-19T12:02:00Z'));
    const state = parseRollingConversationState(value);
    expect(state.version).toBe(2);
    expect(state.currentTopic).toContain("Let's talk after my presentation");
    expect(state.userIntent).toBeTruthy();
    expect(state.companionStance).toContain('do not quit tonight');
    expect(state.emotionalArc.user).toContain('stressed');
    expect(state.decisions.join(' ')).toContain("Let's talk after my presentation");
    expect(state.unresolvedPoints.join(' ')).toContain('not sure what time');
    expect(state.importantWording.some((item) => item.speaker === 'user')).toBe(true);
    expect(formatRollingConversationState(value)).toContain('Companion stance:');
  });

  it('upgrades legacy summaries without losing their useful continuity', () => {
    const legacy = JSON.stringify({ version: 1, topics: ['work', 'presentation'], recentContext: 'The user has a presentation Friday.', emotionalContext: 'Recent emotional cues: nervous.', unresolvedConversationPoints: ['Will the presentation go well?'], sharedJokesOrReferences: ['the projector joke'], storyReferences: [] });
    const state = parseRollingConversationState(legacy);
    expect(state.currentTopic).toBe('presentation');
    expect(state.recentContext).toContain('presentation Friday');
    expect(state.unresolvedPoints).toContain('Will the presentation go well?');
  });

  it('moves to a new current topic while retaining bounded prior context', () => {
    const first = mergeRollingConversationState('', [{ role: 'user', content: 'I am nervous about my interview.' }, { role: 'assistant', content: 'You have prepared for it.' }]);
    const second = mergeRollingConversationState(first, [{ role: 'user', content: 'My sister is visiting this weekend.' }, { role: 'assistant', content: 'That sounds like a very different kind of weekend.' }]);
    const state = parseRollingConversationState(second);
    expect(state.currentTopic).toContain('My sister is visiting');
    expect(state.recentContext).toContain('interview');
    expect(state.recentContext).toContain('sister');
    expect(state.recentContext.length).toBeLessThanOrEqual(1_400);
  });
});
