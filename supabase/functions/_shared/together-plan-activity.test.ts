import { resolvePlanOption } from './together-plans.ts';
import { AppError } from './types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const place = (overrides: Record<string, unknown> = {}) => ({
  id: 'home', name: 'Workshop flat', category: 'home', world_id: 'eos',
  owner_user_id: 'user', archived_at: null, possible_activities: ['Make tea'],
  hours: { alwaysOpen: true }, metadata: {}, ...overrides,
});

function database(location: ReturnType<typeof place> | null) {
  return { from(table: string) {
    assert(table === 'together_locations', 'resolver must read the location catalog');
    return { select: () => ({ eq: (_column: string, id: string) => ({
      maybeSingle: async () => ({ data: location?.id === id ? location : null }),
    }) }) };
  } };
}

Deno.test('new plans accept a custom activity at a private home without changing its catalog', async () => {
  const home = place();
  const resolved = await resolvePlanOption(database(home), 'user', home.id, '  Cook\n crêpes & listen to jazz! ');
  assert(resolved.activityKey === 'Cook crêpes & listen to jazz!', 'custom wording must survive submission');
  assert(resolved.location === home && resolved.durationMinutes === 90, 'retain the selected home and default duration');
  assert(home.possible_activities.length === 1, 'a custom plan must not edit the home catalog');
});

Deno.test('custom activities work at public venues without suggestions and keep opening hours', async () => {
  const venue = place({ owner_user_id: null, category: 'cafe', possible_activities: [], hours: { open: '09:00', close: '18:00' } });
  const resolved = await resolvePlanOption(database(venue), 'user', venue.id, 'Sketch the view', undefined, 60);
  assert(resolved.activityKey === 'Sketch the view' && resolved.durationMinutes === 60, 'accept custom activity and duration');
  assert(resolved.location.hours === venue.hours, 'availability must still receive the original hours');
});

Deno.test('authored activities retain their keys and scheduled-event duration', async () => {
  const venue = place({ metadata: {
    date_types: ['Coffee date'],
    event_programs: [{ activityKey: 'pub_quiz', title: 'Pub quiz', daysOfWeek: [4], startTime: '20:00', durationMinutes: 120 }],
  } });
  const event = await resolvePlanOption(database(venue), 'user', venue.id, 'Pub quiz', undefined, 45);
  assert(event.activityKey === 'pub_quiz' && event.durationMinutes === 120, 'scheduled event rules must survive selection');
  const date = await resolvePlanOption(database(venue), 'user', venue.id, 'Coffee date');
  assert(date.activityKey === 'coffee_date', 'authored date activity retains the legacy key');
  const custom = await resolvePlanOption(database(venue), 'user', venue.id, 'Play chess', undefined, 45);
  assert(custom.durationMinutes === 45, 'a custom activity must not inherit a different event duration');
});

Deno.test('custom activity support preserves private-place ownership and archive guards', async () => {
  for (const location of [place({ owner_user_id: 'another-user' }), place({ archived_at: '2026-11-01T00:00:00Z' })]) {
    try {
      await resolvePlanOption(database(location), 'user', location.id, 'Build a model ship');
      throw new Error('private place was incorrectly accepted');
    } catch (error) {
      assert(error instanceof AppError && error.code === 'NOT_FOUND', 'deny private or archived places');
    }
  }
});

Deno.test('missing places and invalid custom activity lengths are rejected', async () => {
  for (const [location, activity] of [[null, 'Make tea'], [place(), ' \n '], [place(), 'x'.repeat(121)]] as const) {
    try {
      await resolvePlanOption(database(location), 'user', 'home', activity);
      throw new Error('invalid plan was incorrectly accepted');
    } catch (error) {
      assert(error instanceof AppError && error.code === 'VALIDATION_FAILED', 'reject missing location or invalid activity');
    }
  }
  const resolved = await resolvePlanOption(database(place()), 'user', 'home', 'x'.repeat(120));
  assert(resolved.activityKey.length === 120, 'the maximum supported length is accepted');
});
