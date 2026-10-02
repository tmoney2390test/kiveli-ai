import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eosIncidentBriefs, eosCrossDistrictBriefs, eosParticipantActions } from '../content/world-pulse/eos-meridian-source.mjs';

const root = path.resolve('content/world-pulse');
const reference = JSON.parse(fs.readFileSync(path.join(root, 'reference/eos-meridian.json'), 'utf8'));
const residents = new Map(reference.characters.map((character) => [character.slug, character]));
const locations = new Set(reference.locations.map((location) => location.slug));
const districts = [
  ['dr-lena-okafor', 'cassian-vale', 'mara-venn', 'jonah-sato', 'talia-reyes', 'amaya-flores', 'celeste-ren', 'milo-jensen'],
  ['imani-laurent', 'elian-park', 'sora-bell', 'naomi-varga', 'ari-mendoza', 'liora-haddad', 'hana-petrov', 'zoe-mercer'],
  ['commander-rhea-navarro', 'kellan-ro', 'mina-zhao', 'owen-calder', 'zahra-benali', 'yara-kwon', 'leona-baptiste', 'micah-torres'],
  ['dax-holloway', 'nia-calder', 'mateo-singh', 'freya-solberg', 'luc-moreau', 'poppy-reyes', 'samira-cole', 'noah-adeyemi'],
  ['dr-selene-ward', 'aya-nakamura', 'elias-thorne', 'priya-nwosu', 'theo-vance', 'iris-vale', 'noura-castillo', 'kenji-brooks'],
  ['vesper-quinn', 'camille-arden', 'rafael-costa', 'june-callahan', 'malik-orison', 'eden-baptiste', 'mae-lin'],
];
const membership = new Map(districts.flatMap((group) => group.map((slug, index) => [slug, { group, index }])));
if (membership.size !== residents.size || [...residents.keys()].some((slug) => !membership.has(slug))) {
  throw new Error('Eos district roster does not match published canonical residents');
}
if (Object.keys(eosIncidentBriefs).length !== residents.size || Object.values(eosIncidentBriefs).some((rows) => rows.length !== 4)) {
  throw new Error('Every Eos resident needs exactly four individually authored incident briefs');
}

const normalTitle = (title) => title.replace(/[’‘]/g, "'");
const actionsByTitle = new Map(Object.entries(eosParticipantActions)
  .map(([title, actions]) => [normalTitle(title), actions]));
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const compact = (text) => text.replace(/\s+/g, ' ').trim();
const rows = [];
for (const [lead, briefs] of Object.entries(eosIncidentBriefs)) {
  const placeInGroup = membership.get(lead);
  if (!placeInGroup || !residents.has(lead)) throw new Error(`Unpublished Eos lead: ${lead}`);
  for (let mode = 0; mode < 4; mode++) {
    const others = mode === 0 ? [] : mode === 1 ? [1] : mode === 2 ? [2, 3] : [4, 5, 6];
    const participants = [lead, ...others.map((offset) => placeInGroup.group[(placeInGroup.index + offset) % placeInGroup.group.length])];
    rows.push({ lead, participants, brief: briefs[mode] });
  }
}
for (const [lead, others, ...brief] of eosCrossDistrictBriefs) rows.push({ lead, participants: [lead, ...others], brief });
if (rows.length !== 200) throw new Error(`Expected 200 Eos incidents, got ${rows.length}`);

const events = rows.map(({ lead, participants, brief }) => {
  const [title, locationSlug, observed, unresolved, eventType] = brief;
  if (!locations.has(locationSlug) || locationSlug.startsWith('personal-')) throw new Error(`Non-canonical Eos location: ${locationSlug}`);
  if (participants.length < 1 || participants.length > 4 || new Set(participants).size !== participants.length || participants.some((slug) => !residents.has(slug))) {
    throw new Error(`Invalid Eos participant roster: ${title}`);
  }
  const slug = slugify(title);
  const actions = actionsByTitle.get(normalTitle(title)) ?? [];
  if (actions.length !== participants.length - 1) throw new Error(`Missing event-specific participant contributions: ${title}`);
  const otherActions = participants.slice(1).map((slug, index) => {
    const action = actions[index];
    return `${residents.get(slug).name} ${action}`;
  });
  const publicFact = compact(observed);
  const facts = [
    { id: 'observed', text: publicFact, userVisible: true, knownBy: [lead] },
    ...participants.slice(1).map((characterSlug, index) => ({
      id: `participant-${index + 1}`,
      text: `${residents.get(characterSlug).name} ${actions[index]}.`,
      userVisible: true,
      knownBy: [characterSlug],
    })),
  ];
  const detailBody = compact(`${observed} ${otherActions.length ? `${otherActions.join('; ')}. ` : ''}${unresolved}`);
  const participantRows = participants.map((characterSlug, ordinal) => {
    const primary = ordinal === 0;
    const action = primary ? null : actions[ordinal - 1];
    let shortRole = primary ? title : action.split(/\s+/).slice(0, 7).join(' ');
    if (shortRole.length > 38) shortRole = `${shortRole.slice(0, 35).replace(/\s+\S*$/, '')}…`;
    return {
      characterSlug,
      roleLabel: shortRole.charAt(0).toUpperCase() + shortRole.slice(1),
      perspective: compact(primary
        ? `${observed} ${unresolved}`
        : `${residents.get(characterSlug).name} ${action}.`),
      defaultDirectMessage: primary
        ? `I saw the Pulse about “${title}” at ${reference.locations.find((location) => location.slug === locationSlug).name}. What led to your choice?`
        : `I saw the Pulse about “${title}.” What was your part in it?`,
      knownFactIds: primary ? ['observed'] : [`participant-${ordinal}`],
      revealConstraints: primary ? ['Do not claim to know another participant’s private motive.'] : [`Do not claim to know ${residents.get(lead).name}'s private motive or the parts witnessed only by others.`],
    };
  });
  return {
    slug, repeatIdentity: `eos-meridian:${slug}`, schedulingRank: -1,
    contentVersion: 2, worldSlug: 'eos-meridian', title,
    feedSummary: publicFact,
    detailBody,
    eventType, locationSlug,
    significance: .45, selectionWeight: 1,
    primaryCharacterSlug: lead,
    participants: participantRows,
    facts,
    groupMessage: participants.length > 1 ? `I saw the Pulse about “${title}” at ${reference.locations.find((location) => location.slug === locationSlug).name}. What did each of you see, and what is still undecided?` : null,
    contentRating: 'standard', cooldownDays: 30,
    tags: [eventType, 'eos-meridian'],
  };
});

// Stable mixed order keeps one resident's four incidents from clustering in
// the same UTC day and spreads participant sizes across the rotation.
events.sort((a, b) => crypto.createHash('sha256').update(`eos-pulse-v1:${a.slug}`).digest('hex')
  .localeCompare(crypto.createHash('sha256').update(`eos-pulse-v1:${b.slug}`).digest('hex')));
events.forEach((event, schedulingRank) => { event.schedulingRank = schedulingRank; });
fs.writeFileSync(path.join(root, 'eos-meridian.json'), `${JSON.stringify({ worldSlug: 'eos-meridian', events }, null, 2)}\n`);
console.log(`Wrote ${events.length} individually authored Eos incident briefs as World Pulse templates.`);
