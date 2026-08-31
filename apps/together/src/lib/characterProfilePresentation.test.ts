import { describe, expect, it } from 'vitest';
import type { CharacterDayScheduleEntry } from './characterDaySchedule';
import { characterNameFromSlug, characterRelationshipPresentation, compactCharacterSchedule } from './characterProfilePresentation';

const schedule = (id: string, state: Partial<CharacterDayScheduleEntry> = {}): CharacterDayScheduleEntry => ({
  id,
  activity: id,
  time: '1:00 PM–2:00 PM',
  current: false,
  past: false,
  ...state,
});

describe('character profile presentation', () => {
  it('uses a just-met relationship state without empty statistics', () => {
    expect(characterRelationshipPresentation({
      name: 'Aya Mori', known: true, stage: 'stranger', daysKnown: 1, momentCount: 0, placesTogether: 0, upcomingCount: 0,
    })).toEqual({
      heading: 'You’ve just met Aya Mori',
      supportingCopy: 'Your story is just beginning. The details you share and the time you spend together will shape what comes next.',
      stats: [{ value: 'Today', label: 'Met' }],
    });
  });

  it('keeps meaningful established relationship statistics', () => {
    expect(characterRelationshipPresentation({
      name: 'Bianca', known: true, stage: 'friend', daysKnown: 8, momentCount: 3, placesTogether: 2, upcomingCount: 1,
    }).stats).toEqual([
      { value: '8', label: 'Days known' },
      { value: '3', label: 'Moments' },
      { value: '1', label: 'Upcoming' },
    ]);
  });

  it('does not invent a relationship for an undiscovered character', () => {
    expect(characterRelationshipPresentation({
      name: 'Noa', known: false, daysKnown: 0, momentCount: 0, placesTogether: 0, upcomingCount: 0,
    })).toEqual({ heading: null, supportingCopy: null, stats: [] });
  });

  it('shows now and the next schedule entry while hiding the rest', () => {
    const result = compactCharacterSchedule([
      schedule('past', { past: true }), schedule('now', { current: true }), schedule('next'), schedule('later'),
    ]);
    expect(result.entries.map((entry) => entry.id)).toEqual(['now', 'next']);
    expect(result.hiddenCount).toBe(2);
  });

  it('shows the next two entries when nothing is active', () => {
    const result = compactCharacterSchedule([
      schedule('past', { past: true }), schedule('next'), schedule('later'), schedule('last'),
    ]);
    expect(result.entries.map((entry) => entry.id)).toEqual(['next', 'later']);
    expect(result.hiddenCount).toBe(2);
  });

  it('creates a readable loading-shell name from a route slug', () => {
    expect(characterNameFromSlug('commander-rhea-navarro')).toBe('Commander Rhea Navarro');
  });
});
