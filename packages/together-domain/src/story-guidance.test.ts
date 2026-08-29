import { describe, expect, it } from 'vitest';
import { LAST_NIGHT_IN_VESPORMOOR } from '../../../supabase/functions/_shared/kivelle-stories-content.ts';
import { initialStoryCampaign } from './stories.ts';
import { resolveStoryCaseGuidance, resolveStoryNarrativePhase, storyInvestigationTracks } from './story-guidance.ts';

describe('Story Case Director', () => {
  it('starts with one clear objective and a bounded set of actionable paths', () => {
    const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    const guidance = resolveStoryCaseGuidance({ definition: LAST_NIGHT_IN_VESPORMOOR, state, guidanceLevel: 'balanced' });
    expect(guidance.phase).toBe('discovery');
    expect(guidance.objective).toMatch(/wrong|repeat/i);
    expect(guidance.leads.length).toBeGreaterThan(0);
    expect(guidance.leads.length).toBeLessThanOrEqual(2);
    expect(guidance.leads.every((lead) => Boolean(lead.actionLabel && lead.sourceId))).toBe(true);
  });

  it('turns deductions into evolving, non-spoiler investigation tracks', () => {
    const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    state.evidenceIds = ['bell-thirteen', 'midnight-reset'];
    const tracks = storyInvestigationTracks(LAST_NIGHT_IN_VESPORMOOR, state);
    expect(tracks.find((track) => track.id === 'incident')).toMatchObject({ status: 'active', discoveredCount: 2, completed: false });
    expect(tracks.find((track) => track.id === 'incident')?.description).not.toContain('engineered reset');
    expect(tracks.find((track) => track.id === 'machine')).toMatchObject({ status: 'unopened', discoveredCount: 0 });
  });

  it('advances the phase from discovered canon rather than an AI judgment', () => {
    const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    state.evidenceIds = ['bell-thirteen', 'midnight-reset', 'schedules-repeat', 'token-memory'];
    state.deductionIds = ['incident'];
    expect(resolveStoryNarrativePhase(LAST_NIGHT_IN_VESPORMOOR, state)).toBe('investigation');
    state.deductionIds.push('machine', 'anchor');
    expect(resolveStoryNarrativePhase(LAST_NIGHT_IN_VESPORMOOR, state)).toBe('confrontation');
  });

  it('escalates help after repeated non-progress actions without expanding beyond three paths', () => {
    const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    const guidance = resolveStoryCaseGuidance({ definition: LAST_NIGHT_IN_VESPORMOOR, state, guidanceLevel: 'subtle', stalledActions: 5 });
    expect(guidance.hintLevel).toBe(2);
    expect(guidance.objectiveReason).toContain('Best next step:');
    expect(guidance.leads.length).toBeLessThanOrEqual(3);
  });

  it('never marks a remote lead as immediately actionable', () => {
    const state = initialStoryCampaign(LAST_NIGHT_IN_VESPORMOOR);
    const guidance = resolveStoryCaseGuidance({ definition: LAST_NIGHT_IN_VESPORMOOR, state, guidanceLevel: 'direct', stalledActions: 5 });
    for (const lead of guidance.leads.filter((item) => item.locationId && item.locationId !== state.currentLocationId)) {
      expect(lead.availableNow).toBe(false);
      expect(lead.actionLabel).toBe('View map');
    }
  });
});
