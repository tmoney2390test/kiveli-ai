import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eosHomes, commonHomeActivities } from '../content/homes/eos-meridian.mjs';
import { eosInteriorDirections } from '../content/homes/eos-interiors.mjs';

test('all 67 Eos homes have distinct permanent interiors and window views', () => {
  assert.equal(eosHomes.length, 67);
  assert.deepEqual(Object.keys(eosInteriorDirections).sort(), eosHomes.map(h => h.slug).sort());
  for (const field of ['slug', 'name', 'description', 'windowOutlook', 'interiorStyle', 'prompt']) {
    assert.equal(new Set(eosHomes.map(home => home[field])).size, 67, field);
  }
  for (const home of eosHomes) {
    assert.equal(home.details.length, 3);
    assert.equal(home.activities.length, 6);
    assert.deepEqual(home.activities.slice(0, 4), commonHomeActivities);
    assert.equal(new Set(home.activities).size, 6);
    assert.ok(home.description.length >= 120 && home.description.length <= 1600);
    assert.ok(home.prompt.length >= 300 && home.prompt.length <= 5000);
    assert.ok(home.prompt.includes(home.windowOutlook));
    assert.ok(home.prompt.includes(home.interiorStyle));
    for (const detail of home.details) assert.ok(home.prompt.includes(detail.description));
    assert.doesNotMatch(home.prompt, /undefined|\[object Object\]/);
  }
});

test('interiors preserve budget, hobbies and home/work separation', () => {
  const bySlug = Object.fromEntries(eosHomes.map(h => [h.slug, h]));
  assert.match(bySlug['nia-calder'].interiorStyle, /Patched|scuffed/);
  assert.match(bySlug['commander-rhea-navarro'].interiorStyle, /senior quarters/);
  assert.match(bySlug['hana-petrov'].windowOutlook, /not a pool/);
  assert.match(bySlug['liora-haddad'].windowOutlook, /no orchard/);
  assert.equal(new Set(eosHomes.flatMap(home => home.activities.slice(4))).size, 134);
});
