import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('content/world-pulse');
const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sentence = (value) => /[.!?]$/.test(compact(value)) ? compact(value) : `${compact(value)}.`;
const slugify = (value) => compact(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const supportByIssue = {
  consent: [
    ['Permission check', 'checks the written permission against what the person directly affected actually agreed to'],
    ['Affected-person contact', 'asks the named person what may be shared or booked before anyone speaks for them'],
    ['Access safeguard', 'helps withdraw the public listing or access route while the consent question is resolved'],
  ],
  evidence: [
    ['Original-source keeper', 'preserves the original document or observation before a corrected copy replaces it'],
    ['Independent checker', 'compares the date and named witness with another available record'],
    ['Correction witness', 'asks the responsible office to attach the correction without erasing the earlier version'],
  ],
  safety: [
    ['Hazard checker', 'checks the equipment or route involved before another person is exposed to it'],
    ['People check', 'confirms who could be affected and what they were told before the risk was noticed'],
    ['Safe-plan helper', 'helps set a temporary alternative while the responsible crew completes a new check'],
  ],
  care: [
    ['Care-record check', 'checks the patient or recipient record before a medical claim is accepted'],
    ['Consent contact', 'asks the person receiving care what was explained and what they actually agreed to'],
    ['Clinical safeguard', 'helps hold the order or clearance until a qualified team can review it'],
  ],
  work: [
    ['Terms checker', 'compares the posted assignment with the actual paid terms or shift record'],
    ['Worker contact', 'asks the worker affected by the change what they were promised and can accept'],
    ['Schedule repair', 'helps put a workable replacement on the board rather than hiding the lost time'],
  ],
  transport: [
    ['Manifest checker', 'compares the label or route with the signed handoff record'],
    ['Recipient check', 'contacts the person meant to receive the traveler or item before changing its destination'],
    ['Safe handoff', 'keeps the transfer on hold until the responsible crew records the next step'],
  ],
  creative: [
    ['Credit checker', 'checks the maker or performer credit against the original agreement'],
    ['Subject contact', 'asks the person shown or heard what use they actually approved'],
    ['Display correction', 'helps the venue revise the display or program before the next audience arrives'],
  ],
  hospitality: [
    ['Booking checker', 'compares the guest request with the actual reservation and room record'],
    ['Guest contact', 'asks the guest or customer which alternative would genuinely work for them'],
    ['Service repair', 'helps the venue correct the bill or handoff before the next shift inherits the mistake'],
  ],
  competition: [
    ['Rule checker', 'reads the posted rules against the terms the entrants signed'],
    ['Entrant contact', 'asks the people competing whether they accept the changed conditions'],
    ['Fair restart', 'helps post a corrected card or offer a withdrawal without penalty'],
  ],
  community: [
    ['Source check', 'checks whose account or family instruction the public notice rests on'],
    ['Participant contact', 'asks the affected people what part of the gathering or decision they choose to join'],
    ['Public correction', 'helps revise the notice while preserving the choice to stay private'],
  ],
};
const issueGroup = (type) => {
  if (['privacy', 'boundaries', 'consent', 'access', 'rights', 'ratings'].includes(type)) return 'consent';
  if (['records', 'evidence', 'legal', 'civic', 'accountability', 'ethics', 'research', 'education'].includes(type)) return 'evidence';
  if (type === 'care') return 'care';
  if (['safety', 'rescue', 'weather', 'gear', 'training', 'security', 'navigation', 'technology'].includes(type)) return 'safety';
  if (['work', 'labor', 'resources', 'trade', 'craft', 'repair'].includes(type)) return 'work';
  if (['cargo', 'travel', 'salvage', 'land'].includes(type)) return 'transport';
  if (['art', 'performance', 'media', 'music', 'design'].includes(type)) return 'creative';
  if (['hospitality', 'food', 'garden'].includes(type)) return 'hospitality';
  if (['sport', 'game', 'fairness'].includes(type)) return 'competition';
  return 'community';
};
const followUpIntro = {
  consent: 'Before the name, image, or booking is used again, three residents check different parts of the permission:',
  evidence: 'As the record is checked, three residents take separate steps:',
  safety: 'The safety follow-up draws three practical checks:',
  care: 'The care review brings in three different checks:',
  work: 'The work dispute reaches three people with a stake in the handoff:',
  transport: 'At the handoff, three residents verify different parts of the route or load:',
  creative: 'Before the work reaches another audience, three residents check its terms:',
  hospitality: 'The venue asks three residents to sort out the booking and service:',
  competition: 'Before the next round, three residents check the terms and the people affected:',
  community: 'The public account draws three residents into the decision:',
};

export async function loadNewcomers(world) {
  const file = path.join(root, 'newcomers', `${world}.mjs`);
  if (!fs.existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

export function validateSourceResidents(reference, sourceSlugs, expansion) {
  const all = new Set(reference.characters.map(({ slug }) => slug));
  const source = new Set(sourceSlugs);
  const newcomers = new Set((expansion?.groups ?? []).flat());
  if (source.size !== sourceSlugs.length || newcomers.size !== (expansion?.groups ?? []).flat().length)
    throw new Error(`${reference.world.slug}: duplicate source or newcomer resident`);
  if ([...source].some((slug) => newcomers.has(slug) || !all.has(slug)) ||
      [...newcomers].some((slug) => !all.has(slug)) || source.size + newcomers.size !== all.size)
    throw new Error(`${reference.world.slug}: authored residents do not match the published canonical roster`);
  if (newcomers.size && (newcomers.size !== 20 || expansion.groups.some((group) => group.length !== 4)))
    throw new Error(`${reference.world.slug}: expected five curated newcomer groups of four`);
}

export function applyNewcomerIncidents(world, originalEvents, reference, expansion) {
  if (!expansion) return originalEvents;
  const residents = new Map(reference.characters.map((person) => [person.slug, person]));
  const locations = new Map(reference.locations.map((place) => [place.slug, place]));
  const newcomers = expansion.groups.flat();
  if (Object.keys(expansion.incidents).length !== newcomers.length || Object.keys(expansion.contributions).length !== newcomers.length)
    throw new Error(`${world}: each newcomer needs two incidents and a distinct contribution`);
  const additions = [];
  for (const group of expansion.groups) for (const lead of group) {
    const briefs = expansion.incidents[lead];
    const contribution = expansion.contributions[lead];
    if (!Array.isArray(briefs) || briefs.length !== 2 || !contribution || !residents.has(lead))
      throw new Error(`${world}: incomplete newcomer material for ${lead}`);
    for (const brief of briefs) {
      const [title, locationSlug, observed, unresolved, eventType] = brief;
      const place = locations.get(locationSlug);
      if (!place || locationSlug.startsWith('personal-') || !eventType || compact(observed).length < 40 || compact(unresolved).length < 40)
        throw new Error(`${world}: incomplete or noncanonical newcomer incident ${title}`);
      const roster = [lead, ...group.filter((slug) => slug !== lead)];
      const issue = issueGroup(eventType);
      const support = supportByIssue[issue];
      const facts = roster.map((slug, index) => ({
        id: `participant-${index}`,
        text: index === 0 ? sentence(observed) : sentence(`${residents.get(slug).name} ${support[index - 1][1]}`),
        userVisible: true, knownBy: [slug],
      }));
      const participants = roster.map((slug, index) => ({
        characterSlug: slug,
        roleLabel: index === 0 ? expansion.leadRoles[lead] : support[index - 1][0],
        perspective: index === 0
          ? `${sentence(observed)} ${sentence(unresolved)}`
          : `${facts[index].text} ${residents.get(slug).name} knows that part firsthand, but cannot certify the others' private reasons.`,
        defaultDirectMessage: index === 0
          ? `I read about “${title}” at ${place.name}. What did you decide after you noticed the problem?`
          : `I read about “${title}” at ${place.name}. What did your check establish?`,
        knownFactIds: [`participant-${index}`],
        revealConstraints: ["Speak only from your own observation and role. Do not infer another participant's private motive."],
      }));
      const slug = slugify(title);
      additions.push({
        slug, repeatIdentity: `${world}:${slug}`, schedulingRank: -1, contentVersion: 1,
        worldSlug: world, title, feedSummary: compact(observed),
        detailBody: `${expansion.worldIntroduction} At ${place.name}, ${sentence(observed)} ${followUpIntro[issue]} ${facts.slice(1).map((fact) => fact.text).join(' ')}\n\n${sentence(unresolved)}`,
        eventType, locationSlug, significance: .45, selectionWeight: 1,
        primaryCharacterSlug: lead, participants, facts,
        groupMessage: `I read about “${title}” at ${place.name}. What did each of you find out, and what still needs deciding?`,
        contentRating: 'standard', cooldownDays: 30, tags: [eventType, world],
      });
    }
  }
  const required = newcomers.length * 2;
  if (additions.length !== required || new Set(additions.map((event) => event.slug)).size !== required)
    throw new Error(`${world}: need ${required} distinct newcomer-led incidents`);
  const original = [...originalEvents];
  const picked = [];
  const removedPerLead = new Map();
  const sizeTargets = world === 'juniper-city' ? [40, 0, 0] : [20, 20, 0];
  for (const [sizeIndex, target] of sizeTargets.entries()) {
    let count = 0;
    for (const event of original) {
      if (count >= target) break;
      if (event.participants.length !== sizeIndex + 1 || picked.includes(event)) continue;
      const removed = removedPerLead.get(event.primaryCharacterSlug) ?? 0;
      if (removed >= (world === 'juniper-city' ? 2 : 1)) continue;
      picked.push(event); count++; removedPerLead.set(event.primaryCharacterSlug, removed + 1);
    }
    if (count !== target) throw new Error(`${world}: cannot free ${target} size-${sizeIndex + 1} slots while preserving old leads`);
  }
  if (picked.length !== required) throw new Error(`${world}: slot replacement mismatch`);
  const ranks = picked.map((event) => event.schedulingRank).sort((a, b) => a - b);
  additions.forEach((event, index) => { event.schedulingRank = ranks[index]; });
  const dropped = new Set(picked);
  const result = [...original.filter((event) => !dropped.has(event)), ...additions]
    .sort((a, b) => a.schedulingRank - b.schedulingRank);
  // Some original catalogs (notably Juniper) sat exactly at the eight-event
  // coverage floor. Give displaced residents a concrete, authored supporting
  // action in another incident at their usual venue, rather than dropping
  // their presence to make room for the newly published residents.
  const oldSlugs = [...new Set(original.map((event) => event.primaryCharacterSlug))];
  for (const slug of oldSlugs) {
    let count = result.filter((event) => event.participants.some((person) => person.characterSlug === slug)).length;
    if (count >= 8) continue;
    const bridge = expansion.coverageBridges?.[slug];
    if (!bridge || !locations.has(bridge.location) || compact(bridge.action).length < 24)
      throw new Error(`${world}: ${slug} lost catalog coverage without an authored bridge`);
    const relevantTypes = new Set(original.filter((event) => event.primaryCharacterSlug === slug).map((event) => event.eventType));
    while (count < 8) {
      const available = result.filter((event) => event.participants.length < 4 && event.primaryCharacterSlug !== slug
        && !event.participants.some((person) => person.characterSlug === slug));
      const candidate = (bridge.targets ?? []).map((title) => available.find((event) => event.title === title)).find(Boolean)
        ?? available.find((event) => event.locationSlug === bridge.location)
        ?? available.find((event) => relevantTypes.has(event.eventType));
      if (!candidate) throw new Error(`${world}: no fitting incident for ${slug}`);
      const name = residents.get(slug).name;
      const action = sentence(`${name} ${bridge.actions?.[candidate.title] ?? bridge.action} after hearing about “${candidate.title}”`);
      const factId = `support-${slug}`;
      candidate.facts.push({ id: factId, text: action, userVisible: true, knownBy: [slug] });
      candidate.participants.push({ characterSlug: slug, roleLabel: bridge.role,
        perspective: `${action} ${name} can explain this check, but cannot claim to know another person's private reason.`,
        defaultDirectMessage: `I read about “${candidate.title}” at ${locations.get(candidate.locationSlug).name}. What did your check establish?`,
        knownFactIds: [factId],
        revealConstraints: ["Speak only from your own observation and role. Do not infer another participant's private motive."],
      });
      const breakAt = candidate.detailBody.indexOf('\n\n');
      candidate.detailBody = breakAt >= 0
        ? `${candidate.detailBody.slice(0, breakAt)} ${action}${candidate.detailBody.slice(breakAt)}`
        : `${candidate.detailBody} ${action}`;
      if (!candidate.groupMessage) candidate.groupMessage = `I read about “${candidate.title}” at ${locations.get(candidate.locationSlug).name}. What did each of you see?`;
      candidate.contentVersion++;
      count++;
    }
  }
  if (result.length !== 200) throw new Error(`${world}: replacement changed catalog size`);
  return result;
}
