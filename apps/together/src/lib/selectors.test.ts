import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { selectCompanionLife, selectCompanionMoments, selectWorldLocations } from './selectors';

const snapshot = {
  profile: { active_companion_instance_id: 'sofia' },
  characters: [{ id: 'maya' }, { id: 'sofia' }],
  relationships: [{ character_instance_id: 'maya' }, { character_instance_id: 'sofia' }],
  memories: [{ id: 'maya-memory', character_instance_id: 'maya' }, { id: 'sofia-memory', character_instance_id: 'sofia' }],
  moments: [{ id: 'rooftop', character_instance_id: 'maya', participant_instance_ids: ['maya'] }, { id: 'architecture', character_instance_id: 'sofia', participant_instance_ids: ['sofia'] }],
  sharedPlans: [{ id: 'maya-plan', character_instance_id: 'maya' }, { id: 'sofia-plan', character_instance_id: 'sofia' }],
  dates: [], storyArcs: [], generatedMedia: [], lifeEvents: [], openThreads: [], proactiveMessages: [],
  locations: [{ id: 'juniper', world_id: 'juniper-world' }, { id: 'tokyo', world_id: 'tokyo-world' }],
} as unknown as Snapshot;

describe('scoped selectors', () => {
  it('keeps companion relationship history isolated', () => {
    const sofia = selectCompanionLife(snapshot, 'sofia');
    expect(sofia.moments.map((item) => item.id)).toEqual(['architecture']);
    expect(sofia.memories.map((item) => item.id)).toEqual(['sofia-memory']);
    expect(sofia.plans.map((item) => item.id)).toEqual(['sofia-plan']);
  });

  it('includes a shared moment only for an actual participant', () => {
    expect(selectCompanionMoments(snapshot, 'maya').map((item) => item.id)).toEqual(['rooftop']);
  });

  it('never leaks locations across browsed worlds', () => {
    expect(selectWorldLocations(snapshot, 'tokyo-world').map((item) => item.id)).toEqual(['tokyo']);
  });
});
