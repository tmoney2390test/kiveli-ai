import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const worldSlug = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (!worldSlug || !/^[a-z0-9-]+$/.test(worldSlug)) {
  throw new Error('Usage: node scripts/build-resident-world-pulse.mjs <world-slug>');
}
const root = path.resolve('content/world-pulse');
const reference = JSON.parse(fs.readFileSync(path.join(root, 'reference', `${worldSlug}.json`), 'utf8'));
const { groups, residentBriefs, sharedBriefs = [], modeOffsets, participantOverrides = {} } = await import(pathToFileURL(path.join(root, `${worldSlug}-source.mjs`)).href);
const residents = new Map(reference.characters.map((person) => [person.slug, person]));
const places = new Map(reference.locations.map((place) => [place.slug, place]));
const worldIntroductions = {
  'calders-run': "Calder's Run is a frontier town built around rail traffic, ranch work, and neighbors who often depend on one another.",
  'gilded-coast': 'The Gilded Coast is an age-of-sail port and nearby cays where crews, traders, workers, performers, and island families depend on the same tides.',
  'neon-kyo': 'Neon Kyo is a dense city of public screens, private rooms, nightlife, and technology woven into daily work.',
  northvale: 'NorthVale is a mountain community where visitors, residents, and working crews share lifts, trails, and winter weather.',
  'port-vervelle': 'Port Vervelle is a coastal town where hospitality, fishing, sailing, art, and local work meet along the harbor.',
  vespormoor: 'Vespormoor is a university town of old buildings, wooded paths, lakeside venues, and residents who disagree about its history.',
  vharadren: 'Vharadren is a divided realm of royal courts, coastal trade, working settlements, and contested roads.',
};
if (!worldIntroductions[worldSlug]) throw new Error(`${worldSlug}: add a public-safe introduction before building events`);
const member = new Map();
for (const group of groups) {
  if (group.length < 7) throw new Error(`${worldSlug}: all resident groups need at least seven members`);
  for (const [index, slug] of group.entries()) {
    if (!residents.has(slug) || member.has(slug)) throw new Error(`${worldSlug}: invalid or repeated group member ${slug}`);
    member.set(slug, { group, index });
  }
}
if (member.size !== residents.size || Object.keys(residentBriefs).length !== residents.size) {
  throw new Error(`${worldSlug}: every canonical resident needs exactly one grouped brief set`);
}
const defaultOffsets = [[], [1], [2, 3], [4, 5, 6]];
const offsets = modeOffsets ?? defaultOffsets;
if (offsets.some((items) => items.some((value) => !Number.isInteger(value) || value < 1))) {
  throw new Error(`${worldSlug}: invalid mode offsets`);
}
const rows = [];
for (const [lead, briefs] of Object.entries(residentBriefs)) {
  const position = member.get(lead);
  if (!position || briefs.length !== offsets.length) throw new Error(`${worldSlug}: ${lead} needs ${offsets.length} authored briefs`);
  for (const [mode, brief] of briefs.entries()) {
    const others = participantOverrides[briefs[mode][0]]
      ?? offsets[mode].map((offset) => position.group[(position.index + offset) % position.group.length]);
    rows.push({ lead, others, brief });
  }
}
for (const [lead, others, ...brief] of sharedBriefs) rows.push({ lead, others, brief });
if (rows.length !== 200) throw new Error(`${worldSlug}: ${rows.length}/200 incidents`);

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sentence = (value) => /[.!?]$/.test(compact(value)) ? compact(value) : `${compact(value)}.`;
const slugify = (value) => compact(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const role = (action) => {
  const words = compact(action).replace(/[.,;:].*$/, '').split(' ');
  return words.slice(0, 5).join(' ').replace(/^(.)/, (match) => match.toUpperCase());
};
const nameOpeningSubject = (value, name) => sentence(value)
  .replace(/^(He|She)\b/, name)
  .replace(/^(His|Her)\b/, `${name}'s`);
const events = rows.map(({ lead, others, brief }) => {
  const [title, locationSlug, observed, unresolved, eventType, secondaryActions] = brief;
  const place = places.get(locationSlug);
  if (!place || locationSlug.startsWith('personal-')) throw new Error(`${worldSlug}: unknown public place ${locationSlug} in ${title}`);
  const roster = [lead, ...others];
  if (roster.length < 1 || roster.length > 4 || new Set(roster).size !== roster.length || roster.some((slug) => !residents.has(slug))) {
    throw new Error(`${worldSlug}: invalid participant roster in ${title}`);
  }
  if (!Array.isArray(secondaryActions) || secondaryActions.length !== others.length || secondaryActions.some((action) => compact(action).length < 18)) {
    throw new Error(`${worldSlug}: ${title} needs a substantive authored action for every secondary participant`);
  }
  const slug = slugify(title);
  const leadName = residents.get(lead).name;
  const nextStep = nameOpeningSubject(unresolved, leadName);
  const actions = [sentence(observed), ...secondaryActions.map((action, index) => sentence(`${residents.get(others[index]).name} ${compact(action)}`))];
  const facts = actions.map((action, index) => ({
    id: `participant-${index}`, text: action, userVisible: true, knownBy: [roster[index]],
  }));
  const participants = roster.map((characterSlug, index) => ({
    characterSlug,
    roleLabel: role(index === 0 ? compact(observed).split(' ').slice(1).join(' ') : secondaryActions[index - 1]),
    perspective: index === 0
      ? `${actions[index]} ${nextStep}`
      : `${actions[index]} This is their own part in the incident; the public account leaves the outcome open.`,
    defaultDirectMessage: `I read about “${title}” at ${place.name}. The public account says ${actions[index]} What happened next?`,
    knownFactIds: [`participant-${index}`],
    revealConstraints: ["Speak from your own role and observations. Do not claim to know another participant's private motive."],
  }));
  return {
    slug, repeatIdentity: `${worldSlug}:${slug}`, schedulingRank: -1, contentVersion: 1,
    worldSlug, title, feedSummary: compact(observed),
    detailBody: `${worldIntroductions[worldSlug]} At ${place.name}, ${actions.join(' ')}\n\n${nextStep}`,
    eventType, locationSlug, significance: .45, selectionWeight: 1,
    primaryCharacterSlug: lead, participants, facts,
    groupMessage: participants.length > 1 ? `I read about “${title}” at ${place.name}. What did each of you see, and what is still unsettled?` : null,
    contentRating: 'standard', cooldownDays: 30, tags: [eventType, worldSlug],
  };
});
events.sort((left, right) => crypto.createHash('sha256').update(`${worldSlug}-pulse-v1:${left.slug}`).digest('hex')
  .localeCompare(crypto.createHash('sha256').update(`${worldSlug}-pulse-v1:${right.slug}`).digest('hex')));
events.forEach((event, schedulingRank) => { event.schedulingRank = schedulingRank; });
const outputPath = path.join(root, `${worldSlug}.json`);
const output = `${JSON.stringify({ worldSlug, events }, null, 2)}\n`;
if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
    throw new Error(`${worldSlug}: checked-in JSON is out of sync with its authored source`);
  }
  console.log(`Verified ${events.length} ${reference.world.name} World Pulse incidents match authored source.`);
} else {
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${events.length} individually authored ${reference.world.name} World Pulse incidents.`);
}
