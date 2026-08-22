import { closedLocationPlanMessage, planFitsLocationHours } from './together-plan-hours.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('a closed overnight venue tells the user when it opens', () => {
  const hours = { open: '18:00', close: '02:00' };
  assert(!planFitsLocationHours(hours, 15 * 60, 16 * 60 + 30), 'Velours should be closed at 3 PM');
  assert(
    closedLocationPlanMessage({ name: 'Velours', hours, startMinute: 15 * 60, durationMinutes: 90 })
      === 'Velours opens at 6:00 PM. Try then or choose another place.',
    'closed-place copy should prioritize the next opening time',
  );
});

Deno.test('a plan that overruns closing still suggests the latest valid start', () => {
  const hours = { open: '18:00', close: '02:00' };
  assert(!planFitsLocationHours(hours, 60, 3 * 60), 'a 1 AM plan ending at 3 AM should overrun closing');
  assert(
    closedLocationPlanMessage({ name: 'Velours', hours, startMinute: 60, durationMinutes: 120 })
      === 'Velours closes at 2:00 AM. Try 12:00 AM or choose another place.',
    'an overrun should retain the closing-time explanation',
  );
});

Deno.test('unknown hours retain the generic fallback', () => {
  assert(
    closedLocationPlanMessage({ name: 'Somewhere', hours: null, startMinute: 600, durationMinutes: 90 })
      === 'Somewhere is closed at that time. Choose another time or place.',
    'missing authored hours should not invent an opening time',
  );
});
