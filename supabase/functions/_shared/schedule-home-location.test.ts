import { activityRequiresHome, recurringScheduleLocationId } from './schedule-home-location.ts';

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

Deno.test('home and sleep blocks resolve to the character home rather than a district placeholder', () => {
  assertEqual(recurringScheduleLocationId('home', 'Cooking a meal', 'district', 'home'), 'home');
  assertEqual(recurringScheduleLocationId('sleep', 'Sleeping after the late shift', 'district', 'home'), 'home');
  assertEqual(recurringScheduleLocationId('leisure', 'Reading at home', 'district', 'home'), 'home');
  assertEqual(recurringScheduleLocationId('home_late', 'Returning to private quarters', 'market', 'home'), 'home');
  assertEqual(recurringScheduleLocationId('home_morning', 'Sleeping or keeping private morning time', 'bathhouse', 'home'), 'home');
});

Deno.test('genuine outings keep their scheduled destination', () => {
  assertEqual(recurringScheduleLocationId('work', 'Preparing the kitchen', 'restaurant', 'home'), 'restaurant');
  assertEqual(recurringScheduleLocationId('leisure', 'Taking a walk near home', 'district', 'home'), 'district');
  assertEqual(activityRequiresHome('leisure', 'Taking a walk near home'), false);
  assertEqual(recurringScheduleLocationId('home', 'Cooking a meal', null, 'home'), 'home');
});
