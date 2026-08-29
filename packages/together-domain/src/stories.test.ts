import { describe, expect, it } from 'vitest';
import {
  STORY_LOOP_END_MINUTE,
  STORY_LOOP_START_MINUTE,
  StoryRuleError,
  applyStoryAction,
  availableStoryEndings,
  formatStoryTime,
  initialStoryCampaign,
  resolveStoryCharacterLocation,
  resolveStoryDepartureForecast,
  resolveStoryFollowPlan,
  storyConversationEffect,
  type StoryDefinition,
} from './stories.ts';

const definition: StoryDefinition = {
  slug: 'test-loop',
  title: 'Test Loop',
  subtitle: 'A deterministic test story',
  durationLabel: '5 minutes',
  loopStartMinute: STORY_LOOP_START_MINUTE,
  loopEndMinute: STORY_LOOP_END_MINUTE,
  startLocationId: 'square',
  locations: [
    { id: 'square', name: 'Square', subtitle: 'The beginning', description: '', travelMinutes: { archive: 10 } },
    { id: 'archive', name: 'Archive', subtitle: 'Old records', description: '', travelMinutes: { square: 10 } },
  ],
  characters: [{
    id: 'archivist', name: 'The Archivist', role: 'Witness', portraitSlug: 'archivist', biography: '', baselineTrust: 20, baselineSuspicion: 10,
    schedules: [
      { locationId: 'archive', startsAt: STORY_LOOP_START_MINUTE, endsAt: STORY_LOOP_START_MINUTE + 11, activity: 'Working' },
      { locationId: 'square', startsAt: STORY_LOOP_START_MINUTE + 11, endsAt: STORY_LOOP_END_MINUTE, activity: 'Following the bell' },
      { locationId: 'square', startsAt: STORY_LOOP_START_MINUTE, endsAt: STORY_LOOP_END_MINUTE, activity: 'Following the recovered page', priority: 10, requirements: { flags: ['interaction:read-page:completed'] } },
    ],
  }],
  evidence: [
    { id: 'page', title: 'Missing page', description: '', source: '', relatedCharacterIds: ['archivist'], relatedLocationIds: ['archive'], trackId: 'incident', kind: 'critical' },
    { id: 'bell', title: 'Thirteenth bell', description: '', source: '', relatedCharacterIds: [], relatedLocationIds: ['square'], trackId: 'incident', kind: 'critical' },
  ],
  deductions: [{ id: 'incident', title: 'The incident', description: '', requiredEvidenceIds: ['page', 'bell'], unlocks: ['ending'] }],
  timedEvents: [{ id: 'bell-rings', title: 'The bell rings', minute: STORY_LOOP_START_MINUTE + 5, locationId: 'square', description: '', discoverEvidenceId: 'bell' }],
  interactions: [{ id: 'read-page', title: 'Read the page', description: '', locationId: 'archive', timeCost: 5, discoverEvidenceIds: ['page'] }],
  dialogueApproaches: [{ id: 'ask-page', characterId: 'archivist', label: 'Ask', promptIntent: 'Ask about missing page', timeCost: 5, discoverEvidenceIds: ['page'] }],
  endings: [{ id: 'ending', title: 'Dawn', description: '', epilogue: '', requirements: { minLoop: 1, deductionIds: ['incident'] } }],
};

describe('Kivelli Stories deterministic engine', () => {
  it('resolves schedules and advances travel without asking an AI', () => {
    const initial = initialStoryCampaign(definition);
    expect(resolveStoryCharacterLocation(definition, initial, 'archivist')?.locationId).toBe('archive');
    const result = applyStoryAction(definition, initial, { type: 'travel', locationId: 'archive' });
    expect(result.state.currentLocationId).toBe('archive');
    expect(result.state.currentMinute).toBe(STORY_LOOP_START_MINUTE + 10);
  });

  it('discovers authored evidence and completes deductions only from validated facts', () => {
    let state = initialStoryCampaign(definition);
    state = applyStoryAction(definition, state, { type: 'wait', minutes: 5 }).state;
    expect(state.evidenceIds).toContain('bell');
    state = applyStoryAction(definition, state, { type: 'travel', locationId: 'archive' }).state;
    const investigated = applyStoryAction(definition, state, { type: 'investigate', interactionId: 'read-page' });
    expect(investigated.evidenceDiscovered).toEqual(['page']);
    expect(investigated.deductionsCompleted).toEqual(['incident']);
  });

  it('clears temporary loop state but preserves knowledge at midnight', () => {
    const state = initialStoryCampaign(definition);
    state.evidenceIds = ['page'];
    state.deductionIds = [];
    state.loopFlags = ['door-open'];
    state.inventoryIds.push('temporary-key');
    state.currentMinute = STORY_LOOP_END_MINUTE;
    state.status = 'midnight';
    const reset = applyStoryAction(definition, state, { type: 'reset' });
    expect(reset.state.currentLoop).toBe(1);
    expect(reset.state.currentMinute).toBe(STORY_LOOP_START_MINUTE);
    expect(reset.state.evidenceIds).toEqual(['page']);
    expect(reset.state.loopFlags).toEqual([]);
    expect(reset.state.inventoryIds).toEqual(['brass-memory-token']);
  });

  it('keeps endings locked until deterministic requirements are true', () => {
    const initial = initialStoryCampaign(definition);
    expect(availableStoryEndings(definition, initial)).toEqual([]);
    expect(() => applyStoryAction(definition, initial, { type: 'finale', endingId: 'ending' })).toThrow(StoryRuleError);
    const eligible = { ...initial, currentLoop: 1, deductionIds: ['incident'] };
    expect(applyStoryAction(definition, eligible, { type: 'finale', endingId: 'ending' }).state.completedEndingId).toBe('ending');
  });

  it('formats the authored night clock correctly', () => {
    expect(formatStoryTime(STORY_LOOP_START_MINUTE)).toBe('8:40 PM');
    expect(formatStoryTime(STORY_LOOP_END_MINUTE)).toBe('12:00 AM');
  });

  it('does not award trust merely for sending freeform dialogue', () => {
    let state = initialStoryCampaign(definition);
    state = applyStoryAction(definition, state, { type: 'travel', locationId: 'archive' }).state;
    const before = state.characterStates['archivist']!.trust;
    const result = applyStoryAction(definition, state, { type: 'conversation', characterId: 'archivist', freeformText: 'What did you see?' });
    expect(result.state.characterStates['archivist']!.trust).toBe(before);
    expect(result.timeAdvanced).toBe(2);
    expect(result.state.currentMinute).toBe(STORY_LOOP_START_MINUTE + 12);
    expect(result.presenceTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'departed', characterId: 'archivist', originLocationId: 'archive', destinationLocationId: 'square', storyMinute: STORY_LOOP_START_MINUTE + 11, activity: 'Following the bell', witnessed: true, reason: 'schedule' }),
      expect.objectContaining({ type: 'arrived', characterId: 'archivist', originLocationId: 'archive', destinationLocationId: 'square', storyMinute: STORY_LOOP_START_MINUTE + 11, activity: 'Following the bell', witnessed: false, reason: 'schedule' }),
    ]));
  });

  it('makes authored and freeform dialogue equally cost two story minutes', () => {
    let state = initialStoryCampaign(definition);
    state = applyStoryAction(definition, state, { type: 'travel', locationId: 'archive' }).state;
    const authored = applyStoryAction(definition, state, { type: 'conversation', characterId: 'archivist', approachId: 'ask-page' });
    expect(authored.timeAdvanced).toBe(2);
  });

  it('captures conditional reroutes caused by an investigation before time advances', () => {
    let state = initialStoryCampaign(definition);
    state = applyStoryAction(definition, state, { type: 'travel', locationId: 'archive' }).state;
    const investigated = applyStoryAction(definition, state, { type: 'investigate', interactionId: 'read-page' });
    expect(investigated.presenceTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'departed', characterId: 'archivist', originLocationId: 'archive', destinationLocationId: 'square', storyMinute: STORY_LOOP_START_MINUTE + 10, activity: 'Following the recovered page', witnessed: true, reason: 'story_branch' }),
    ]));
  });

  it('captures arrivals during waiting without implying the character was always present', () => {
    const result = applyStoryAction(definition, initialStoryCampaign(definition), { type: 'wait', minutes: 15 });
    expect(result.presenceTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'departed', characterId: 'archivist', originLocationId: 'archive', destinationLocationId: 'square', witnessed: false }),
      expect.objectContaining({ type: 'arrived', characterId: 'archivist', originLocationId: 'archive', destinationLocationId: 'square', witnessed: true }),
    ]));
  });

  it('forecasts only the next validated departure and estimates whether Follow can catch it', () => {
    const state = initialStoryCampaign(definition);
    expect(resolveStoryDepartureForecast(definition, state, 'archivist', 10)).toBeNull();
    expect(resolveStoryDepartureForecast(definition, state, 'archivist', 11)).toMatchObject({
      originLocationId: 'archive', destinationLocationId: 'square', minutesUntil: 11,
    });
    expect(resolveStoryFollowPlan(definition, state, 'archivist')).toMatchObject({
      targetLocationId: 'archive', travelMinutes: 10, catchable: true, mayMoveBeforeArrival: false,
    });
  });

  it('follows a known character, catches up, and carries an unresolved thread into the reunion', () => {
    const state = initialStoryCampaign(definition);
    state.characterStates['archivist']!.continuity = { recentExchangeSummaries: [], openThreads: ['Who removed the page?'] };
    const result = applyStoryAction(definition, state, { type: 'follow', characterId: 'archivist' });
    expect(result.followOutcome).toMatchObject({ caught: true, attemptedLocationId: 'archive', travelMinutes: 10, resumedThread: 'Who removed the page?' });
    expect(result.state.currentLocationId).toBe('archive');
    expect(result.state.characterStates['archivist']?.continuity?.pendingResumeCue).toContain('Resume this unresolved thread');
  });

  it('reroutes Follow once when the character moves before arrival', () => {
    const state = initialStoryCampaign(definition);
    state.currentMinute += 2;
    const result = applyStoryAction(definition, state, { type: 'follow', characterId: 'archivist' });
    expect(result.followOutcome).toMatchObject({ caught: true, rerouted: true, actualLocationId: 'square', travelMinutes: 20 });
    expect(result.state.currentLocationId).toBe('square');
  });

  it('supports bounded absence actions without manufacturing a conversation', () => {
    const state = initialStoryCampaign(definition);
    const note = applyStoryAction(definition, state, { type: 'absence', characterId: 'archivist', choice: 'leave_note' });
    expect(note.timeAdvanced).toBe(2);
    expect(note.absenceOutcome).toMatchObject({ choice: 'leave_note', characterId: 'archivist' });
    expect(note.state.characterStates['archivist']?.continuity?.pendingResumeCue).toContain('left you a note');
    const asked = applyStoryAction(definition, state, { type: 'absence', characterId: 'archivist', choice: 'ask_nearby' });
    expect(asked.timeAdvanced).toBe(2);
    expect(asked.absenceOutcome?.content).toContain('No one nearby');
  });

  it('maps conversational intent to bounded relationship consequences', () => {
    expect(storyConversationEffect('reassure')).toMatchObject({ trustDelta: 2, suspicionDelta: -1, signal: 'reassured' });
    expect(storyConversationEffect('accuse')).toMatchObject({ trustDelta: -2, suspicionDelta: 3, signal: 'accused' });
    expect(storyConversationEffect('present_evidence', { firstEvidencePresentation: true })).toMatchObject({ trustDelta: 4, suspicionDelta: -2, signal: 'shared_evidence' });
  });
});
