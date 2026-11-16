import { describe, expect, it } from 'vitest';
import type { Location } from '../types';
import { planningActivityOption, planningActivitySuggestions } from './planActivitySelection';
import { planActivityOptions } from './planActivity';
import type { PlanOption } from './plans';

const place = (extra: Partial<Location> = {}) => ({ id: 'place-1', name: 'Workshop flat', description: 'A cozy workshop and a small kitchen.', category: 'home', possible_activities: ['Make tea', 'Build a model ship'], hours: { alwaysOpen: true }, ...extra }) as Location;

describe('activities when creating a plan', () => {
  it('supports a custom activity at a home with no authored suggestions', () => {
    const home = place({ owner_user_id: 'user-1', possible_activities: [] });
    const option = planningActivityOption(home, '  Cook\n crêpes & listen to jazz!  ');
    expect(option).toMatchObject({ title: 'Cook crêpes & listen to jazz!', activityKey: 'Cook crêpes & listen to jazz!', locationId: home.id, hours: home.hours, reason: 'Your private place' });
    expect(home.possible_activities).toEqual([]);
  });

  it('supports custom activities at public venues and keeps the venue hours', () => {
    const venue = place({ category: 'cafe', name: 'Late Shift', hours: { opens: '09:00', closes: '23:00' } });
    expect(planningActivityOption(venue, 'Sketch the view')).toMatchObject({ title: 'Sketch the view at Late Shift', activityKey: 'Sketch the view', locationId: venue.id, hours: venue.hours });
  });

  it('retains an existing authored option and its duration instead of treating it as custom', () => {
    const existing = { id: 'scheduled-tea', activityKey: 'make_tea', locationId: 'place-1', durationMinutes: 60, program: { daysOfWeek: [5], startTime: '19:00' } } as PlanOption;
    expect(planningActivityOption(place(), 'Make tea', [existing])).toBe(existing);
    expect(planningActivityOption(place({ id: 'place-2' }), 'Make tea', [existing]).locationId).toBe('place-2');
  });

  it('preserves scheduled-event rules even when an event was outside the recommended list', () => {
    const venue = place({ category: 'bar', metadata: { event_programs: [{ activityKey: 'pub_quiz', title: 'Pub quiz', daysOfWeek: [4], startTime: '20:00', durationMinutes: 120 }] } });
    expect(planningActivityOption(venue, 'Pub quiz')).toMatchObject({ activityKey: 'pub_quiz', durationMinutes: 120, program: { daysOfWeek: [4], startTime: '20:00' } });
  });

  it('does not inherit event restrictions for a different custom activity', () => {
    const venue = place({ metadata: { event_programs: [{ activityKey: 'pub_quiz', title: 'Pub quiz', daysOfWeek: [4], startTime: '20:00', durationMinutes: 120 }] } });
    expect(planningActivityOption(venue, 'Play chess').program).toBeUndefined();
  });

  it('rejects blank or over-limit custom entries without truncating valid text', () => {
    expect(() => planningActivityOption(place(), '  \n ')).toThrow();
    expect(() => planningActivityOption(place(), 'a'.repeat(121))).toThrow();
    expect(planningActivityOption(place(), 'a'.repeat(120)).activityKey).toHaveLength(120);
  });

  it('offers all authored suggestions, date activities and venue programs in the popup', () => {
    const venue = place({ possible_activities: Array.from({ length: 15 }, (_, index) => `Activity ${index + 1}`), metadata: { date_types: ['Make tea'], event_programs: [{ activityKey: 'pub_quiz', title: 'Pub quiz', daysOfWeek: [4], startTime: '20:00', durationMinutes: 120 }] } });
    const suggestions = planActivityOptions(planningActivitySuggestions(venue), '');
    expect(suggestions).toHaveLength(17);
    expect(suggestions).toContain('Pub quiz');
    expect(suggestions).toContain('Activity 15');
  });
});
