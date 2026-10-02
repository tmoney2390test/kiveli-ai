import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planWorldPulseHorizon, WORLD_PULSE_TEMPLATES_PER_WORLD } from '../packages/together-domain/src/world-pulse-v2.ts';

const root = path.resolve('content/world-pulse');
const references = path.join(root, 'reference');
const worldFlag = process.argv.indexOf('--world');
const requestedWorld = worldFlag >= 0 ? process.argv[worldFlag + 1] : null;
if (worldFlag >= 0 && (!requestedWorld || requestedWorld.startsWith('--'))) {
  throw new Error('--world requires a canonical world slug');
}
const normal = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const terms = (value) => new Set(normal(value).split(' ').filter((word) => word.length > 3));
const similarity = (left, right) => {
  const a = terms(left), b = terms(right), shared = [...a].filter((item) => b.has(item)).length;
  return shared / Math.max(1, a.size + b.size - shared);
};
const errors = [];
const reports = [];
const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const requireText = (value, min, label) => {
  if (typeof value !== 'string' || value.trim().length < min) errors.push(`${label}: at least ${min} characters required`);
};

if (!fs.existsSync(references)) throw new Error('Missing canonical World Pulse reference directory');
const worldFiles = fs.readdirSync(references).filter((name) => name.endsWith('.json')
  && (!requestedWorld || name === `${requestedWorld}.json`)).sort();
if (!worldFiles.length) throw new Error(`Unknown published world: ${requestedWorld}`);
for (const worldFile of worldFiles) {
  const reference = load(path.join(references, worldFile));
  const world = reference.world.slug;
  if (fs.existsSync(path.join(root, `${world}-source.mjs`)) && !['eos-meridian', 'juniper-city'].includes(world)) {
    const sourceCheck = spawnSync(process.execPath, [path.resolve('scripts/build-resident-world-pulse.mjs'), world, '--check'], {
      cwd: path.resolve('.'), encoding: 'utf8', maxBuffer: 200_000,
    });
    if (sourceCheck.status !== 0) errors.push(`${world}: authored source and checked-in JSON differ: ${sourceCheck.stderr?.trim() || sourceCheck.stdout?.trim()}`);
  }
  if (world === 'juniper-city') {
    const sourceCheck = spawnSync(process.execPath, [path.resolve('scripts/build-juniper-world-pulse.mjs'), '--check'], {
      cwd: path.resolve('.'), encoding: 'utf8', maxBuffer: 200_000,
    });
    if (sourceCheck.status !== 0) errors.push(`${world}: authored source and checked-in JSON differ: ${sourceCheck.stderr?.trim() || sourceCheck.stdout?.trim()}`);
  }
  const file = path.join(root, `${world}.json`);
  const events = fs.existsSync(file) ? load(file).events : [];
  if (!fs.existsSync(file)) errors.push(`${world}: missing authored content pack`);
  if (events.length !== WORLD_PULSE_TEMPLATES_PER_WORLD) errors.push(`${world}: ${events.length}/${WORLD_PULSE_TEMPLATES_PER_WORLD} templates`);
  const residents = new Map(reference.characters.map((item) => [item.slug, item]));
  const places = new Map(reference.locations.map((item) => [item.slug, item]));
  for (const place of reference.locations) {
    if (place.slug.startsWith('personal-')) errors.push(`${world}: private place leaked into canonical reference: ${place.slug}`);
  }
  const counts = new Map([...residents].map(([slug]) => [slug, { appearances: 0, leads: 0, eventTypes: new Set(), locations: new Set(), counterparts: new Set() }]));
  const seenSlug = new Set(), seenRepeat = new Set(), seenText = new Map();
  const seenRank = new Set();
  const sizes = [0, 0, 0, 0];
  for (const [index, event] of events.entries()) {
    const label = `${world}:${event.slug ?? index}`;
    if (event.worldSlug !== world) errors.push(`${label}: wrong worldSlug`);
    if (!event.slug || seenSlug.has(event.slug)) errors.push(`${label}: duplicate/missing slug`);
    if (!event.repeatIdentity || seenRepeat.has(event.repeatIdentity)) errors.push(`${label}: duplicate/missing repeatIdentity`);
    if (!Number.isInteger(event.schedulingRank) || event.schedulingRank < 0 || event.schedulingRank >= WORLD_PULSE_TEMPLATES_PER_WORLD || seenRank.has(event.schedulingRank)) errors.push(`${label}: invalid/duplicate schedulingRank`);
    seenRank.add(event.schedulingRank);
    seenSlug.add(event.slug); seenRepeat.add(event.repeatIdentity);
    if (!Number.isInteger(event.contentVersion) || event.contentVersion < 1) errors.push(`${label}: invalid contentVersion`);
    for (const [field, minimum] of [['title', 12], ['feedSummary', 40], ['detailBody', 100], ['eventType', 3]]) requireText(event[field], minimum, `${label}.${field}`);
    if (/\b(?:todo|placeholder|lorem ipsum|unexpected encounter|strange discovery)\b/i.test(`${event.title} ${event.detailBody}`)) errors.push(`${label}: placeholder or generic hook`);
    if (!places.has(event.locationSlug) || event.locationSlug?.startsWith('personal-')) errors.push(`${label}: unknown or private location ${event.locationSlug}`);
    if (!Number.isFinite(event.significance) || event.significance < 0 || event.significance > 1) errors.push(`${label}: invalid significance`);
    if (event.contentRating !== 'standard') errors.push(`${label}: public Pulse must be standard-rated`);
    if (!Number.isInteger(event.cooldownDays) || event.cooldownDays < 30) errors.push(`${label}: cooldown below 30 days`);
    const participants = Array.isArray(event.participants) ? event.participants : [];
    if (participants.length < 1 || participants.length > 4) errors.push(`${label}: requires 1–4 participants`);
    else sizes[participants.length - 1]++;
    const participantSlugs = participants.map((item) => item.characterSlug);
    if (new Set(participantSlugs).size !== participants.length) errors.push(`${label}: duplicate participant`);
    if (!participantSlugs.includes(event.primaryCharacterSlug)) errors.push(`${label}: primary is not a participant`);
    if (participants.length > 1) requireText(event.groupMessage, 12, `${label}.groupMessage`);
    for (const participant of participants) {
      const slug = participant.characterSlug;
      const row = counts.get(slug);
      if (!row) { errors.push(`${label}: ${slug} is not a published canonical resident`); continue; }
      row.appearances++; if (slug === event.primaryCharacterSlug) row.leads++;
      row.eventTypes.add(event.eventType); row.locations.add(event.locationSlug);
      for (const other of participantSlugs) if (other !== slug) row.counterparts.add(other);
      requireText(participant.roleLabel, 3, `${label}:${slug}.roleLabel`);
      requireText(participant.perspective, 40, `${label}:${slug}.perspective`);
      requireText(participant.defaultDirectMessage, 12, `${label}:${slug}.defaultDirectMessage`);
      if (!Array.isArray(participant.knownFactIds)) errors.push(`${label}:${slug}: knownFactIds required`);
    }
    const factIds = new Set();
    if (!Array.isArray(event.facts) || event.facts.length === 0) errors.push(`${label}: at least one structured fact required`);
    for (const fact of event.facts ?? []) {
      if (!fact.id || factIds.has(fact.id)) errors.push(`${label}: duplicate/missing fact ID`);
      factIds.add(fact.id);
      requireText(fact.text, 12, `${label}.facts.${fact.id}`);
      if (typeof fact.userVisible !== 'boolean') errors.push(`${label}: userVisible boolean required`);
      if (!Array.isArray(fact.knownBy) || fact.knownBy.some((slug) => !participantSlugs.includes(slug))) errors.push(`${label}: invalid fact knowledge roster`);
    }
    for (const participant of participants) for (const id of participant.knownFactIds ?? []) {
      const fact = (event.facts ?? []).find((item) => item.id === id);
      if (!fact || !fact.knownBy.includes(participant.characterSlug)) errors.push(`${label}: ${participant.characterSlug} claims an unknown fact ${id}`);
    }
    for (const fact of event.facts ?? []) for (const knower of fact.knownBy ?? []) {
      const participant = participants.find((item) => item.characterSlug === knower);
      if (!participant?.knownFactIds?.includes(fact.id)) errors.push(`${label}: ${knower} knows ${fact.id} but lacks the participant knowledge assignment`);
    }
    const signature = normal(`${event.title} ${event.feedSummary} ${event.detailBody}`);
    if (seenText.has(signature)) errors.push(`${label}: exact text duplicate of ${seenText.get(signature)}`);
    seenText.set(signature, label);
  }
  const below = [...counts].filter(([, value]) => value.appearances < 8 || value.leads < 2)
    .map(([slug, value]) => ({ slug, appearances: value.appearances, leads: value.leads }));
  if (below.length) errors.push(`${world}: ${below.length} residents below eight appearances/two leads`);
  const repetitive = [...counts].filter(([, value]) => value.appearances >= 8
    && (value.eventTypes.size < 2 || value.locations.size < 2 || value.counterparts.size < 2))
    .map(([slug, value]) => `${slug} (${value.eventTypes.size} types/${value.locations.size} places/${value.counterparts.size} counterparts)`);
  if (repetitive.length) errors.push(`${world}: limited resident variety: ${repetitive.join(', ')}`);
  if (events.length && sizes.some((count) => count < 10)) errors.push(`${world}: solo/duo/trio/four-person representation requires at least 10 each`);
  if (events.length === WORLD_PULSE_TEMPLATES_PER_WORLD && seenRank.size !== WORLD_PULSE_TEMPLATES_PER_WORLD) errors.push(`${world}: scheduling ranks must cover 0–199`);
  const texts = events.map((event) => ({ slug: event.slug, text: `${event.title} ${event.feedSummary} ${event.detailBody}` }));
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (similarity(texts[i].text, texts[j].text) > .82) errors.push(`${world}: likely reskin ${texts[i].slug} / ${texts[j].slug}`);
  }
  const schedule = events.length >= WORLD_PULSE_TEMPLATES_PER_WORLD ? planWorldPulseHorizon({
    worldId: world, startDate: '2028-02-10', days: 90,
    templates: events.map((event) => ({ id: event.slug, repeatIdentity: event.repeatIdentity,
      schedulingRank: event.schedulingRank,
      active: true, participantIds: event.participants.map((item) => item.characterSlug),
      eventType: event.eventType, locationId: event.locationSlug, selectionWeight: event.selectionWeight,
      cooldownDays: event.cooldownDays })),
  }) : null;
  if (schedule && (schedule.shortages.length || Object.values(schedule.dailyCounts).some((count) => count < 6 || count > 8) || (schedule.minimumRepeatHours ?? 0) < 720)) errors.push(`${world}: 90-day schedule infeasible`);
  reports.push({ world, templates: events.length, residents: residents.size, belowCoverage: below,
    limitedVariety: repetitive,
    appearanceMin: Math.min(...[...counts.values()].map((value) => value.appearances)),
    appearanceMax: Math.max(...[...counts.values()].map((value) => value.appearances)),
    leadMin: Math.min(...[...counts.values()].map((value) => value.leads)),
    leadMax: Math.max(...[...counts.values()].map((value) => value.leads)),
    participantSizes: sizes,
    schedule: schedule ? { dailyCounts: schedule.dailyCounts,
      sixDays: Object.values(schedule.dailyCounts).filter((count) => count === 6).length,
      sevenDays: Object.values(schedule.dailyCounts).filter((count) => count === 7).length,
      eightDays: Object.values(schedule.dailyCounts).filter((count) => count === 8).length,
      minimumRepeatHours: schedule.minimumRepeatHours, shortages: schedule.shortages } : null });
}

const report = { generatedAt: new Date().toISOString(), worlds: reports, errors };
if (process.argv.includes('--report')) fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify(report, null, 2));
for (const world of reports) {
  const schedule = world.schedule;
  console.log(`${world.world}: templates ${world.templates}/200; residents ${world.residents}; below coverage ${world.belowCoverage.length}; appearances ${world.appearanceMin}–${world.appearanceMax}; leads ${world.leadMin}–${world.leadMax}; sizes ${world.participantSizes.join('/')}; 90-day ${schedule ? `${schedule.sixDays}/${schedule.sevenDays}/${schedule.eightDays} six/seven/eight days, min repeat ${schedule.minimumRepeatHours}h, shortages ${schedule.shortages.length}` : 'not runnable'}`);
}
if (errors.length) console.error(errors.join('\n'));
else console.log('World Pulse content and 90-day schedule validation passed.');
if (errors.length) process.exitCode = 1;
