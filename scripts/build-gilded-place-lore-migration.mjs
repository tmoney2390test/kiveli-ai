import { writeFileSync } from 'node:fs';
import { gildedPlaces } from '../content/gilded-coast/world.mjs';
import { gildedPlaceRhythms } from '../content/gilded-coast/place-rhythms.mjs';

const output = process.argv[2];
if (!output || !output.endsWith('.sql')) throw new Error('Pass a migration .sql path');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const parts = ['morning', 'afternoon', 'evening', 'late_night'];
const rows = gildedPlaces.map((place) => {
  const lines = gildedPlaceRhythms[place.slug];
  if (!Array.isArray(lines) || lines.length !== 4 || lines.some((line) => !line || line.length < 20)) {
    throw new Error(`Missing complete daypart rhythm for ${place.slug}`);
  }
  const rhythm = Object.fromEntries(parts.map((part, index) => [part, lines[index]]));
  const notes = Object.fromEntries(place.activities.map((activity) => [activity, place.activityDescriptions?.[activity] ?? place.etiquette]));
  return `    (${quote(place.slug)}, ${quote(JSON.stringify(rhythm))}::jsonb, ${quote(JSON.stringify(notes))}::jsonb, ${quote(JSON.stringify([place.history]))}::jsonb)`;
});
const sql = `-- Replace generic coastal rhythm and activity boilerplate with place-specific lore.\n` +
  `-- Guarded against overwriting later editorial changes or private locations.\n` +
  `with edits(slug, rhythm, notes, facts) as (\n  values\n${rows.join(',\n')}\n)\n` +
  `update public.together_locations l\n` +
  `set canonical_lore = jsonb_set(jsonb_set(jsonb_set(jsonb_set(\n` +
  `    coalesce(l.canonical_lore, '{}'::jsonb),\n` +
  `    '{crowdRhythm}', e.rhythm, true),\n` +
  `    '{activityNotes}', e.notes, true),\n` +
  `    '{stableFacts}', e.facts, true),\n` +
  `    '{recurringPeople}', '[]'::jsonb, true),\n` +
  `    updated_at = now()\n` +
  `from edits e\n` +
  `join public.together_worlds w on w.slug = 'gilded-coast'\n` +
  `where l.world_id = w.id and l.slug = e.slug\n` +
  `  and l.owner_user_id is null and l.archived_at is null\n` +
  `  and l.canonical_lore->'crowdRhythm'->>'morning' = 'Crews and neighbors establish the practical day.';\n`;
writeFileSync(output, sql, 'utf8');
console.log(`Wrote ${rows.length} place rhythms to ${output}`);
