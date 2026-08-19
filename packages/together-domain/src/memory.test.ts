import { describe, expect, it } from 'vitest';
import { buildMemoryRecallPlan, decayEmotionalResidue, evaluateBehaviorPattern, isDurableUserMemory, isRelationshipDirectedPreferenceMemory, scoreEpisodeSignificance } from './memory.ts';

const now = new Date('2026-08-16T20:00:00.000Z');

describe('Memory Engine V2', () => {
  it('keeps an irrelevant durable fact silent', () => {
    const plan = buildMemoryRecallPlan([{ id:'dog', canonical_text:"User's dog is named Max.", memory_type:'semantic', importance:.9, pinned:true, metadata:{} }], { now, query:'What are you doing tonight?', intent:'general' });
    expect(plan.explicitCallbackAllowance).toBe(0);
    expect(plan.callbackCandidates).toHaveLength(0);
    expect(plan.silentContext[0]?.id).toBe('dog');
  });

  it('uses direct recall only for a direct memory question', () => {
    const plan = buildMemoryRecallPlan([{ id:'dog', canonical_text:"User's dog is named Max.", memory_type:'semantic', importance:.86, similarity:.81, metadata:{} }], { now, query:"What was my dog's name again?", intent:'memory_overview' });
    expect(plan.directRecall.map((memory) => memory.id)).toContain('dog');
    expect(plan.explicitCallbackAllowance).toBeGreaterThan(0);
  });

  it('suppresses a recently mentioned callback', () => {
    const plan = buildMemoryRecallPlan([{ id:'karaoke', canonical_text:'User and Maya sang together at Lucky Note.', memory_type:'episodic', importance:.85, similarity:.88, location_id:'lucky', last_mentioned_at:'2026-08-16T19:45:00.000Z', metadata:{ locationId:'lucky' } }], { now, query:'Should we sing again?', intent:'general', locationId:'lucky', activityKey:'karaoke' });
    expect(plan.callbackCandidates).toHaveLength(0);
    expect(plan.silentContext.map((memory) => memory.id)).toContain('karaoke');
  });

  it('scores a meaningful shared scene above a routine click', () => {
    expect(scoreEpisodeSignificance({ durationMinutes:90, meaningfulActionCount:4, actionFamilyCount:3, relationshipSignificance:.65, firstTimeActivity:true, explicitPhoto:true, emotionalShift:.6 })).toBeGreaterThan(.7);
    expect(scoreEpisodeSignificance({ durationMinutes:5, meaningfulActionCount:0, actionFamilyCount:1, routinePenalty:.9 })).toBeLessThan(.3);
  });

  it('promotes only repeated behavior across scenes and days', () => {
    const observations = [
      { sourceId:'one', sceneId:'scene-one', occurredAt:'2026-08-10T20:00:00.000Z' },
      { sourceId:'two', sceneId:'scene-two', occurredAt:'2026-08-12T20:00:00.000Z' },
      { sourceId:'three', sceneId:'scene-three', occurredAt:'2026-08-15T20:00:00.000Z' },
    ];
    expect(evaluateBehaviorPattern(observations, now).eligible).toBe(true);
    expect(evaluateBehaviorPattern(observations.slice(0, 1), now).eligible).toBe(false);
  });

  it('decays emotional residue deterministically', () => {
    expect(decayEmotionalResidue({ intensity:1, startedAt:'2026-08-16T18:00:00.000Z', halfLifeMinutes:120, now })).toBeCloseTo(.5, 5);
  });

  it('rejects model-proposed preference memories aimed at the companion', () => {
    expect(isRelationshipDirectedPreferenceMemory('User likes you.')).toBe(true);
    expect(isRelationshipDirectedPreferenceMemory('User loves her.')).toBe(true);
    expect(isRelationshipDirectedPreferenceMemory('User likes football.')).toBe(false);
  });

  it('keeps momentary user actions in conversation context instead of durable memory', () => {
    expect(isDurableUserMemory({ memoryType:'semantic', canonicalText:'User is in bed.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'episodic', canonicalText:'User is watching television right now.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'emotional', canonicalText:'User feels tired.' })).toBe(false);
    expect(isDurableUserMemory({ memoryType:'semantic', canonicalText:'User works as an architect.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'preference', canonicalText:'User likes football.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'relationship', canonicalText:'User told Brooke they love her.' })).toBe(true);
    expect(isDurableUserMemory({ memoryType:'episodic', canonicalText:'Brooke and Tim watched the sunset at Riverwalk.' })).toBe(true);
  });
});
