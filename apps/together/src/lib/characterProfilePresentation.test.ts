import { describe, expect, it } from 'vitest';
import type { CharacterDayScheduleEntry } from './characterDaySchedule';
import { characterNameFromSlug, characterRelationshipPresentation, characterTrustPresentation, characterUpcomingCommitments, compactCharacterSchedule } from './characterProfilePresentation';
import type { DateSession, Location, SharedPlan } from '../types';

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

  it.each([
    [8, 8, 'Still new'],
    [14, 14, 'Taking root'],
    [35, 35, 'Growing trust'],
    [60, 60, 'Strong trust'],
    [80, 80, 'Deep trust'],
    [140, 100, 'Deep trust'],
    [-20, 0, 'Still new'],
  ])('presents trust %s as a bounded, readable level', (input, value, label) => {
    expect(characterTrustPresentation(input)).toMatchObject({ value, label });
  });

  it('fails closed to the lowest trust presentation for malformed data', () => {
    expect(characterTrustPresentation('not-a-score')).toMatchObject({ value: 0, label: 'Still new' });
  });

  it('shows the established starting trust while a relationship snapshot is still loading', () => {
    expect(characterTrustPresentation(undefined)).toMatchObject({
      value: 30,
      label: 'Taking root',
      detail: expect.stringContaining('It grows when you’re honest'),
    });
  });

  it('distinguishes a recent strain from a low starting baseline', () => {
    expect(characterTrustPresentation(30)).toMatchObject({
      label: 'Taking root', tone: 'steady', trendLabel: null, recentChange: null,
    });
    expect(characterTrustPresentation(30, { recentDirection: 'strained', recentTrustChange: -2 })).toMatchObject({
      label: 'Taking root', tone: 'strained', trendLabel: 'Recently strained', recentChange: -2,
    });
  });

  it('shows accountable repair without pretending the full loss disappeared', () => {
    expect(characterTrustPresentation(28, { recentDirection: 'repairing', recentTrustChange: 1 })).toMatchObject({
      tone: 'repairing', trendLabel: 'Repairing', recentChange: 1,
    });
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

  it('builds a chronological upcoming view from plans and scheduled dates', () => {
    const locations = [{ id: 'spa', name: 'Aurora Spa' }] as Location[];
    const plans = [{
      id: 'later-plan', character_instance_id: 'character', title: 'Dinner after the spa', note: 'Dress warmly.',
      location_id: 'spa', starts_at: '2026-09-06T23:00:00.000Z', ends_at: '2026-09-07T01:00:00.000Z',
      status: 'scheduled', participant_instance_ids: [], activity_key: 'dinner', source: 'date',
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    }] as SharedPlan[];
    const dates = [{
      id: 'spa-date', character_instance_id: 'character', shared_plan_id: null, status: 'upcoming', scheduled_for: '2026-09-06T20:00:00.000Z',
      current_phase: 'waiting', phase_index: 0, state: {}, completed_at: null,
      together_date_templates: { id: 'template', name: 'Massage at Aurora Spa', description: 'Unwind together.', world_id: 'world', location_id: 'spa', phases: [] },
    }] as DateSession[];

    expect(characterUpcomingCommitments({ characterInstanceId: 'character', plans, dates, locations, now: new Date('2026-09-05T00:00:00.000Z') })).toEqual([
      expect.objectContaining({ id: 'spa-date', kind: 'date', locationName: 'Aurora Spa', route: '/date/spa-date' }),
      expect.objectContaining({ id: 'later-plan', kind: 'plan', description: 'Dress warmly.', route: '/plan/later-plan' }),
    ]);
  });

  it('does not count a scheduled date twice when it belongs to an upcoming plan', () => {
    const plans = [{
      id: 'plan', character_instance_id: 'character', title: 'Aurora Spa', location_id: 'spa', starts_at: '2026-09-06T20:00:00.000Z',
      ends_at: '2026-09-06T22:00:00.000Z', status: 'scheduled', participant_instance_ids: [], activity_key: 'spa', source: 'date',
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    }] as SharedPlan[];
    const dates = [{
      id: 'date', character_instance_id: 'character', shared_plan_id: 'plan', status: 'upcoming', scheduled_for: '2026-09-06T20:00:00.000Z',
      current_phase: 'waiting', phase_index: 0, state: {}, completed_at: null,
      together_date_templates: { id: 'template', name: 'Massage', description: 'Relax.', world_id: 'world', location_id: 'spa', phases: [] },
    }] as DateSession[];

    expect(characterUpcomingCommitments({ characterInstanceId: 'character', plans, dates, locations: [], now: new Date('2026-09-05T00:00:00.000Z') })).toHaveLength(1);
  });
});
