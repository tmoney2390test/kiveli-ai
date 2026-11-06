import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'apps/together/src/catalog-artwork.json'), 'utf8'));
const expected = { 'gilded-coast': 42, 'juniper-city': 53, 'port-vervelle': 51 };

test('each published place in the repaired worlds has a distinct delivered image', () => {
  for (const [world, count] of Object.entries(expected)) {
    const source = readFileSync(resolve(root, `apps/together/src/location-assets/${world}.ts`), 'utf8');
    const entries = [...source.matchAll(/'([^']+)':\s*catalogArtwork\('([^']+)'\)/g)]
      .map((match) => ({ slug: match[1], path: match[2] }));
    assert.equal(entries.length, count, `${world}: place count`);
    assert.equal(new Set(entries.map((entry) => entry.slug)).size, count, `${world}: duplicate slug`);
    assert.equal(new Set(entries.map((entry) => entry.path)).size, count, `${world}: reused image`);
    for (const entry of entries) {
      assert.equal(entry.path.split('/').at(-1)?.replace(/\.(?:png|jpe?g|webp)$/i, ''), entry.slug, `${world}: ${entry.slug} uses a fallback`);
      assert.ok(existsSync(resolve(root, 'apps/together/assets', entry.path)), `${world}: ${entry.path} source missing`);
      assert.ok(manifest[entry.path]?.display?.file && manifest[entry.path]?.thumbnail?.file, `${world}: ${entry.path} delivery missing`);
    }
  }
});
