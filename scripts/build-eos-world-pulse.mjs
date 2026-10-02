import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eosIncidentBriefs, eosCrossDistrictBriefs, eosParticipantActions } from '../content/world-pulse/eos-meridian-source.mjs';
import { eosPlaceContext, eosTermContext } from '../content/world-pulse/eos-reader-context.mjs';
import { eosEventOverrides } from '../content/world-pulse/eos-event-overrides.mjs';

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
const trailingFillers = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
function roleFromAction(action) {
  const words = action.replace(/[.,;:].*$/, '').split(/\s+/);
  const kept = [];
  for (const word of words) {
    if ([...kept, word].join(' ').length > 34) break;
    kept.push(word);
  }
  while (kept.length > 2 && trailingFillers.has(kept.at(-1).toLowerCase())) kept.pop();
  const role = kept.join(' ');
  return `${role.charAt(0).toUpperCase()}${role.slice(1)}${kept.length < words.length ? '…' : ''}`;
}
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
for (const [lead, others, ...brief] of eosCrossDistrictBriefs) rows.push({ lead, participants: [lead, ...others], brief, crossDistrict: true });
if (rows.length !== 200) throw new Error(`Expected 200 Eos incidents, got ${rows.length}`);

const events = rows.map(({ lead, participants, brief, crossDistrict = false }) => {
  const [title, locationSlug, observed, unresolved, eventType] = brief;
  if (!locations.has(locationSlug) || locationSlug.startsWith('personal-')) throw new Error(`Non-canonical Eos location: ${locationSlug}`);
  const placeContext = eosPlaceContext[locationSlug];
  if (!placeContext) throw new Error(`Missing newcomer context for Eos location: ${locationSlug}`);
  const override = eosEventOverrides[title];
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
  const usedTerms = `${title} ${observed} ${unresolved}`;
  const termContext = Object.entries(eosTermContext)
    .filter(([term]) => usedTerms.toLowerCase().includes(term.toLowerCase()) && !placeContext.toLowerCase().includes(term.toLowerCase()))
    .map(([, explanation]) => explanation);
  // Cross-district briefs already describe each person's contribution in the
  // incident itself. Repeating their action packets made the detail read like
  // a generated recap rather than a coherent account.
  const scene = compact(`${placeContext} ${termContext.join(' ')} ${observed} ${!crossDistrict && otherActions.length ? `${otherActions.join('; ')}.` : ''}`);
  const detailBody = override?.detailBody ?? `${scene}\n\n${compact(unresolved)}`;
  const participantRows = participants.map((characterSlug, ordinal) => {
    const primary = ordinal === 0;
    const action = primary ? null : actions[ordinal - 1];
    const firstName = residents.get(lead).name.replace(/^(Dr\.|Commander)\s+/, '').split(' ')[0];
    const leadAction = observed.startsWith(`${firstName} `) ? observed.slice(firstName.length + 1) : observed;
    const shortRole = roleFromAction(primary ? leadAction : action);
    return {
      characterSlug,
      roleLabel: override?.roleLabels?.[characterSlug] ?? shortRole,
      perspective: override?.perspectives?.[characterSlug] ?? compact(primary
        ? `${observed} ${unresolved}`
        : `${residents.get(characterSlug).name} ${action}.`),
      defaultDirectMessage: override?.directMessages?.[characterSlug] ?? (primary
        ? `I read about “${override?.displayTitle ?? title}” at ${reference.locations.find((location) => location.slug === locationSlug).name}. What happened next?`
        : `I read that you ${action}. What happened next?`),
      knownFactIds: primary ? ['observed'] : [`participant-${ordinal}`],
      revealConstraints: primary ? ['Do not claim to know another participant’s private motive.'] : [`Do not claim to know ${residents.get(lead).name}'s private motive or the parts witnessed only by others.`],
    };
  });
  return {
    slug, repeatIdentity: `eos-meridian:${slug}`, schedulingRank: -1,
    contentVersion: 3, worldSlug: 'eos-meridian', title: override?.displayTitle ?? title,
    feedSummary: override?.feedSummary ?? publicFact,
    detailBody,
    eventType, locationSlug,
    significance: .45, selectionWeight: 1,
    primaryCharacterSlug: lead,
    participants: participantRows,
    facts,
    groupMessage: participants.length > 1 ? override?.groupMessage ?? `I read about “${override?.displayTitle ?? title}” at ${reference.locations.find((location) => location.slug === locationSlug).name}. What did each of you see, and what is still undecided?` : null,
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
