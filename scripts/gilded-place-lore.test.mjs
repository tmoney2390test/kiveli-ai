import test from 'node:test';
import assert from 'node:assert/strict';
import { gildedPlaces } from '../content/gilded-coast/world.mjs';
import { gildedPlaceRhythms } from '../content/gilded-coast/place-rhythms.mjs';

test('every Gilded Coast place has specific daypart life and every public venue has hours', () => {
  assert.equal(gildedPlaces.length, 42);
  assert.equal(Object.keys(gildedPlaceRhythms).length, gildedPlaces.length);
  const mornings = new Set();
  for (const place of gildedPlaces) {
    const rhythm = gildedPlaceRhythms[place.slug];
    assert.equal(rhythm?.length, 4, place.slug);
    for (const line of rhythm) assert.ok(line.length >= 20, `${place.slug}: ${line}`);
    mornings.add(rhythm[0]);
    if (place.locationType === 'venue') {
      assert.match(place.hours?.open ?? '', /^\d\d:\d\d$/, `${place.slug} opens`);
      assert.match(place.hours?.close ?? '', /^\d\d:\d\d$/, `${place.slug} closes`);
    }
  }
  assert.equal(mornings.size, gildedPlaces.length);
});
