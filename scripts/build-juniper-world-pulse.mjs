import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { juniperResidentBriefs, juniperSharedBriefs } from '../content/world-pulse/juniper-city-source.mjs';

const root = path.resolve('content/world-pulse');
const reference = JSON.parse(fs.readFileSync(path.join(root, 'reference/juniper-city.json'), 'utf8'));
const residents = new Map(reference.characters.map((person) => [person.slug, person]));
const places = new Map(reference.locations.map((place) => [place.slug, place]));
const slugify = (value) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const short = (value) => value.replace(/\s+/g, ' ').trim();
if (Object.keys(juniperResidentBriefs).length !== residents.size || Object.values(juniperResidentBriefs).some((briefs) => briefs.length !== 4))
  throw new Error('Juniper needs exactly four individual incidents per canonical resident');
if (juniperSharedBriefs.length !== 48) throw new Error(`Juniper needs 48 shared incidents, got ${juniperSharedBriefs.length}`);

const records = [];
for (const [characterSlug, briefs] of Object.entries(juniperResidentBriefs)) {
  if (!residents.has(characterSlug)) throw new Error(`Unknown resident ${characterSlug}`);
  for (const [title, locationSlug, observed, unresolved, eventType, question] of briefs) {
    const person = residents.get(characterSlug);
    records.push({ title, locationSlug, observed, unresolved, eventType,
      participants: [[characterSlug, person.occupation, short(`${observed} ${unresolved}`), question]] });
  }
}
for (const [title, locationSlug, observed, unresolved, eventType, participants] of juniperSharedBriefs)
  records.push({ title, locationSlug, observed, unresolved, eventType, participants });
if (records.length !== 200) throw new Error(`Expected 200 Juniper incidents, got ${records.length}`);

const events = records.map(({ title, locationSlug, observed, unresolved, eventType, participants }) => {
  const place = places.get(locationSlug);
  if (!place || locationSlug.startsWith('personal-')) throw new Error(`Unknown public place ${locationSlug} in ${title}`);
  if (participants.length < 1 || participants.length > 4 || new Set(participants.map(([slug]) => slug)).size !== participants.length)
    throw new Error(`Invalid participant roster in ${title}`);
  for (const [slug] of participants) if (!residents.has(slug)) throw new Error(`Unknown participant ${slug} in ${title}`);
  const slug = slugify(title);
  const publicFact = short(observed);
  const facts = [{ id: 'public-report', text: publicFact, userVisible: true, knownBy: participants.map(([person]) => person) }];
  const participantRows = participants.map(([characterSlug, roleLabel, perspective, question]) => ({
    characterSlug, roleLabel, perspective,
    defaultDirectMessage: question,
    knownFactIds: ['public-report'],
    revealConstraints: ["Speak only from your own role and observations. Do not invent another participant's motive."],
  }));
  return {
    slug, repeatIdentity: `juniper-city:${slug}`, schedulingRank: -1, contentVersion: 1,
    worldSlug: 'juniper-city', title, feedSummary: publicFact,
    detailBody: `${short(observed)}\n\n${short(unresolved)}`,
    eventType, locationSlug, significance: .45, selectionWeight: 1,
    primaryCharacterSlug: participants[0][0], participants: participantRows, facts,
    groupMessage: participants.length > 1 ? `I read about ${title} at ${place.name}. What did each of you do, and what remains unresolved?` : null,
    contentRating: 'standard', cooldownDays: 30, tags: [eventType, 'juniper-city'],
  };
});
events.sort((a, b) => crypto.createHash('sha256').update(`juniper-pulse-v1:${a.slug}`).digest('hex')
  .localeCompare(crypto.createHash('sha256').update(`juniper-pulse-v1:${b.slug}`).digest('hex')));
events.forEach((event, schedulingRank) => { event.schedulingRank = schedulingRank; });
const outputPath = path.join(root, 'juniper-city.json');
const output = `${JSON.stringify({ worldSlug: 'juniper-city', events }, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output)
    throw new Error('Juniper City authored source and checked-in JSON differ');
  console.log('Juniper City authored source matches checked-in JSON.');
} else {
  fs.writeFileSync(outputPath, output);
  console.log('Wrote 200 authored Juniper City World Pulse 2.0 incidents.');
}
