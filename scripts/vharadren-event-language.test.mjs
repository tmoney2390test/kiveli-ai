import assert from 'node:assert/strict';
import test from 'node:test';
import { auditVharadrenEvents, buildVharadrenScheduleVariants, enrichVharadrenSchedules } from './lib/vharadren-event-language.mjs';

const character = {
  slug: 'queen-maerra-vaelorian',
  districtSlug: 'crownspire',
  occupation: 'Queen of Aurelis and claimant to the Ember Throne',
  interests: ['statecraft', 'falconry', 'military histories'],
};
const pack = {
  characters: [character],
  districts: [{ slug: 'crownspire', name: 'Crownspire' }],
  locations: [{ slug: 'ember-throne-hall', name: 'The Hall of the Ember Throne' }],
  weeklySchedules: [
    { characterSlug: character.slug, activityKey: 'home_morning', activity: 'Beginning the day in private quarters', diegeticDay: 'Crownrest', slot: 1, locationSlug: null },
    { characterSlug: character.slug, activityKey: 'day_anchor', activity: "Beginning the day's duties", diegeticDay: 'Firstbell', slot: 2, locationSlug: 'ember-throne-hall' },
    { characterSlug: character.slug, activityKey: 'evening_social', activity: 'Entering the evening social rhythm', diegeticDay: 'Veilday', slot: 5, locationSlug: 'ember-throne-hall' },
  ],
  recurringEvents: [{ title: "The Queen's Open Audience", rhythm: 'Petitions begin orderly and grow dangerous as testimony crosses caste lines.', locationSlug: 'ember-throne-hall' }],
};

test('builds three Vharadren-specific variants without the generic recovery copy', () => {
  const variants = buildVharadrenScheduleVariants({ activity: 'Following a personal routine', activityKey: 'day_anchor', day: 'Firstbell', slot: 2, occupation: character.occupation, interests: character.interests, locationName: 'The Hall of the Ember Throne', districtName: 'Crownspire' });
  assert.equal(variants.length, 3);
  assert.match(variants.join(' '), /Firstbell|Ember Throne|statecraft|falconry|military histories/i);
  assert.doesNotMatch(variants.join(' '), /familiar routine|familiar rhythm|comfortable pace/i);
});

test('enriches private and public schedule rows with presentation context', () => {
  const rows = enrichVharadrenSchedules(pack);
  assert.equal(rows[0].displayLocation, 'Private quarters in Crownspire');
  assert.equal(rows[1].displayLocation, 'The Hall of the Ember Throne');
  assert.equal(rows.every((row) => row.activityVariants.length === 3), true);
});

test('audits the authored recurring events and generated schedule language', () => {
  const result = auditVharadrenEvents({ ...pack, weeklySchedules: Array.from({ length: 110 }, (_, index) => ({ ...pack.weeklySchedules[index % 3], slot: index, diegeticDay: `Bell-${index}` })) });
  assert.equal(result.ok, true, result.failures.join(', '));
  assert.equal(result.recurringEvents, 1);
});
