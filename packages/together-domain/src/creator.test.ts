import { describe, expect, it } from 'vitest';
import { creatorReadiness, creatorSampleMessages, routineConflicts, type CreatorRoutineBlock } from './creator.ts';

const block = (overrides: Partial<CreatorRoutineBlock> = {}): CreatorRoutineBlock => ({
  id: 'one', dayOfWeek: 1, startMinute: 540, endMinute: 1020, locationId: 'place', activity: 'Working', availability: 'busy', energyDelta: -1, ...overrides,
});
describe('Creator Studio domain', () => {
  it('requires a canonical identity, appearance, routine, and meeting', () => {
    expect(creatorReadiness({ identity: {}, appearance: {}, routine: { blocks: [] }, firstMeeting: { options: [] }, hasSelectedAsset: false }).missing)
      .toEqual(['identity', 'appearance', 'routine', 'first_meeting']);
  });

  it('accepts a complete companion draft', () => {
    expect(creatorReadiness({
      identity: { name: 'Sofia', age: 29, occupation: 'Architect', biography: 'An ambitious architect with dry humor.' },
      appearance: {}, routine: { blocks: [block()] }, firstMeeting: { selectedId: 'meeting', options: [{ id: 'meeting' }] }, hasSelectedAsset: true,
    }).ready).toBe(true);
  });

  it('detects routine overlap on the same day', () => {
    expect(routineConflicts([block(), block({ id: 'two', startMinute: 900, endMinute: 1100 })])).toEqual([{ firstId: 'one', secondId: 'two' }]);
  });

  it('generates personality-sensitive message previews', () => {
    const direct = creatorSampleMessages({ name: 'Sofia', warmth: .7, humor: .8, directness: .8 });
    expect(direct.join(' ')).toContain('actually think');
    expect(direct.join(' ')).toContain('confident answer');
  });
});
