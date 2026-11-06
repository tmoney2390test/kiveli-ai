import fs from 'node:fs';
import { allMajorCatalogs } from '../content/world-pulse/major-catalogs.mjs';

const worldIndex = process.argv.indexOf('--world');
const requestedWorld = worldIndex < 0 ? null : process.argv[worldIndex + 1];
if (worldIndex >= 0 && (!requestedWorld || !allMajorCatalogs[requestedWorld])) throw new Error(`No major catalog to validate for ${requestedWorld}`);
const references = fs.readdirSync(new URL('../content/world-pulse/reference/', import.meta.url)).filter((file) => file.endsWith('.json'));
const worlds = requestedWorld ? [requestedWorld] : references.map((file) => file.slice(0, -5)).sort();
const errors = [];
for (const worldSlug of worlds) {
const issues = [];
const events = allMajorCatalogs[worldSlug];
if (!events) { errors.push(`${worldSlug}: missing major catalog`); continue; }
const reference = JSON.parse(fs.readFileSync(new URL(`../content/world-pulse/reference/${worldSlug}.json`, import.meta.url), 'utf8'));
const residents = new Set(reference.characters.map((person) => person.slug));
const locations = new Set(reference.locations.map((place) => place.slug));
if (events.length !== 15) issues.push(`Expected 15 incidents, got ${events.length}`);
const slugs = new Set(), identities = new Set();
for (const [index, event] of events.entries()) {
  const label = `incident ${index + 1} (${event.slug})`;
  if (event.worldSlug !== worldSlug || !event.repeatIdentity.startsWith(`${worldSlug}:major:`)) issues.push(`${label}: wrong world identity`);
  if (slugs.has(event.slug)) issues.push(`${label}: duplicate slug`);
  if (identities.has(event.repeatIdentity)) issues.push(`${label}: duplicate repeat identity`);
  slugs.add(event.slug); identities.add(event.repeatIdentity);
  if (!locations.has(event.locationSlug)) issues.push(`${label}: unknown location ${event.locationSlug}`);
  if (!event.title || event.title.length < 12 || event.feedSummary.length < 80 || event.detailBody.length < 300) issues.push(`${label}: incomplete public story`);
  if (event.cooldownDays < 60 || event.contentRating !== 'standard' || event.eventType !== 'colony_wide') issues.push(`${label}: invalid major-event policy`);
  if (!Array.isArray(event.participants) || event.participants.length < 1 || event.participants.length > 4) issues.push(`${label}: invalid participant count`);
  const participants = new Set();
  for (const person of event.participants) {
    if (!residents.has(person.characterSlug)) issues.push(`${label}: nonresident ${person.characterSlug}`);
    if (participants.has(person.characterSlug)) issues.push(`${label}: duplicate participant ${person.characterSlug}`);
    participants.add(person.characterSlug);
    if (person.perspective.length < 45 || person.roleLabel.length < 4 || person.defaultDirectMessage.length < 18) issues.push(`${label}: thin participant ${person.characterSlug}`);
  }
  if (!participants.has(event.primaryCharacterSlug)) issues.push(`${label}: primary not involved`);
  if (event.groupMessage.length < 20) issues.push(`${label}: missing group draft`);
  for (const fact of event.facts) {
    if (!fact.text || !fact.id || !Array.isArray(fact.knownBy)) issues.push(`${label}: incomplete fact`);
    for (const slug of fact.knownBy) if (!participants.has(slug)) issues.push(`${label}: fact assigned to outsider ${slug}`);
  }
}
const offsets = [0, 4, 7, 14, 18, 21, 28, 32, 35, 42, 46, 49, 56, 60, 63];
if (offsets.length !== events.length || offsets.some((day, index) => index && day - offsets[index - 1] < 3)) issues.push('Major rotation has insufficient spacing');
for (let week = 0; week < 10; week++) {
  const count = offsets.filter((day) => Math.floor(day / 7) === week).length;
  if (count < 1 || count > 2) issues.push(`Week ${week + 1} has ${count} incidents`);
}
if (issues.length) {
  errors.push(...issues.map((issue) => `${worldSlug}: ${issue}`));
} else {
  console.log(`${worldSlug}: ${events.length} major incidents, ${new Set(events.flatMap((event) => event.participants.map((person) => person.characterSlug))).size} focal residents, one or two per week, 70-day identity spacing.`);
}
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
