import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parse, resolve } from 'node:path';
import { gildedPack } from '../content/gilded-coast/pack.mjs';

const path = resolve(import.meta.dirname, '../apps/together/src/worlds/gilded-coast.ts');
const source = await readFile(path, 'utf8');
const art = new Set((await readdir(resolve(import.meta.dirname, '../apps/together/assets/locations/gilded-coast'))).map((file) => parse(file).name));
for (const place of gildedPack.locations) if (!art.has(place.slug)) throw new Error(`Missing art for ${place.slug}`);
const locations = gildedPack.locations.map((place) => ({
  id: place.id,
  world_id: place.worldId,
  parent_location_id: place.parentLocationId,
  name: place.name,
  slug: place.slug,
  location_type: place.locationType,
  description: place.description,
  category: place.category,
  ...(place.hours ? { hours: place.hours } : {}),
  possible_activities: place.activities,
  visual_asset_key: place.visualAssetKey,
  canonical_visual_context: place.canonicalVisualContext,
  canonical_lore: place.canonicalLore,
  sort_order: place.index * 10,
  metadata: place.metadata,
}));
const prefix = 'export const gildedCoastLocations: Location[]=';
const line = source.split('\n').find((candidate) => candidate.startsWith(prefix));
if (!line || source.split('\n').filter((candidate) => candidate.startsWith(prefix)).length !== 1) {
  throw new Error('Expected exactly one generated Gilded Coast location catalog');
}
const slotsPrefix = 'export const gildedCoastAssetSlots=';
const slotsLine = source.split('\n').find((candidate) => candidate.startsWith(slotsPrefix));
if (!slotsLine) throw new Error('Expected Gilded Coast artwork slots');
const worldPrefix = 'export const gildedCoastWorld: World=';
const worldLine = source.split('\n').find((candidate) => candidate.startsWith(worldPrefix));
if (!worldLine) throw new Error('Expected Gilded Coast world metadata');
const world = JSON.parse(worldLine.slice(worldPrefix.length, -1));
world.metadata = {
  ...world.metadata,
  locationPhotoStatus: 'reference_ready',
  mappedLocationPhotoCount: locations.length,
  distinctLocationPhotoCount: locations.length,
};
const slots = {
  hero: { key: 'gilded-coast-hero', status: 'local_authored' },
  locations: gildedPack.locations.map((place) => ({ key: place.visualAssetKey, status: 'local_authored' })),
  portraits: gildedPack.characters.map((person) => ({ key: person.portraitAssetKey, status: 'local_authored' })),
};
await writeFile(path, source
  .replace(line, `${prefix}${JSON.stringify(locations)};`)
  .replace(slotsLine, `${slotsPrefix}${JSON.stringify(slots)} as const;`)
  .replace(worldLine, `${worldPrefix}${JSON.stringify(world)};`), 'utf8');
console.log(`Synchronized ${locations.length} Gilded Coast client locations`);
