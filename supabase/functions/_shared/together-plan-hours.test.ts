import { closedLocationPlanMessage, locationClosingWindow, planFitsLocationHours } from './together-plan-hours.ts';

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

Deno.test('an open immediate plan exposes the same-day closing boundary', () => {
  const result = locationClosingWindow({ open: '09:00', close: '18:00' }, 17 * 60 + 20);
  assert(result.isOpen, 'the venue should be open at 5:20 PM');
  assert(result.closingMinute === 18 * 60, 'the plan should be capped at 6 PM');
});

Deno.test('an open overnight venue exposes the correct closing date', () => {
  const beforeMidnight = locationClosingWindow({ open: '18:00', close: '02:00' }, 23 * 60);
  assert(beforeMidnight.isOpen, 'the venue should be open before midnight');
  assert(beforeMidnight.closingMinute === 26 * 60, 'the close should resolve to 2 AM tomorrow');

  const afterMidnight = locationClosingWindow({ open: '18:00', close: '02:00' }, 60);
  assert(afterMidnight.isOpen, 'the venue should remain open after midnight');
  assert(afterMidnight.closingMinute === 2 * 60, 'the close should resolve to 2 AM today');
});

Deno.test('a closed place cannot start immediately', () => {
  const result = locationClosingWindow({ open: '09:00', close: '18:00' }, 20 * 60);
  assert(!result.isOpen, 'the venue should remain closed at 8 PM');
  assert(result.closingMinute === null, 'closed venues have no active closing boundary');
});

Deno.test('midnight-to-midnight hours are treated as always open', () => {
  const result = locationClosingWindow({ open: '00:00', close: '24:00' }, 23 * 60 + 59);
  assert(result.isOpen, 'an all-day venue should be open');
  assert(result.closingMinute === null, 'an all-day venue should not shorten the plan');
});
