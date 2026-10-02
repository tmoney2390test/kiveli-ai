import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { seedableMajorCatalogs } from '../content/world-pulse/major-catalogs.mjs';

// Generates a reviewable SQL import; it never connects to production. The
// optional --world scope is for staged world releases, while default
// validation remains global and must pass before all-world enablement.
const root = path.resolve('content/world-pulse');
const major = process.argv.includes('--major');
const includeUnpublished = process.argv.includes('--include-unpublished');
const worldFlag = process.argv.indexOf('--world');
const requestedWorld = worldFlag >= 0 ? process.argv[worldFlag + 1] : null;
const batchFlag = process.argv.indexOf('--batch-size');
const batchSize = batchFlag >= 0 ? Number(process.argv[batchFlag + 1]) : null;
const target = process.argv.at(-1);
if (!target || target.startsWith('--') || !target.endsWith('.sql')) {
  console.error('Usage: pnpm world-pulse:seed -- [--world <world-slug>] [--batch-size <1..50>] <output.sql>');
  process.exit(2);
}
if (worldFlag >= 0 && (!requestedWorld || requestedWorld.startsWith('--'))) throw new Error('--world requires a canonical world slug');
if (batchFlag >= 0 && (!requestedWorld || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50))
  throw new Error('--batch-size requires a single --world and a value from 1 to 50');
if (major && !requestedWorld) throw new Error('--major requires --world to keep world releases explicit');
if (includeUnpublished && !requestedWorld) throw new Error('--include-unpublished requires one explicit staged world');
if (major && !seedableMajorCatalogs[requestedWorld]) throw new Error(`No seedable major catalog exists for ${requestedWorld}`);
for (const validator of major
  ? ['scripts/world-pulse-validate.mjs', 'scripts/world-pulse-major-validate.mjs']
  : ['scripts/world-pulse-validate.mjs']) {
  const validation = spawnSync(process.execPath, ['--experimental-strip-types', path.resolve(validator), ...(requestedWorld ? ['--world', requestedWorld] : [])], {
    cwd: path.resolve('.'), encoding: 'utf8', maxBuffer: 2_000_000,
  });
  if (validation.status !== 0) {
    process.stderr.write(validation.stdout ?? '');
    process.stderr.write(validation.stderr ?? '');
    throw new Error(`${validator} failed; no seed SQL was written.`);
  }
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const tags = (value) => `array[${(value ?? []).map(quote).join(',')}]::text[]`;
const preamble = () => ['begin;', 'set local search_path = public, extensions;', 'do $world_pulse_seed$', 'declare', '  v_world uuid;', '  v_location uuid;', '  v_primary uuid;', '  v_template uuid;', '  v_character uuid;', '  v_existing record;', '  v_facts jsonb;', '  v_known_ids jsonb;', 'begin'];
const close = (lines) => `${[...lines, 'end $world_pulse_seed$;', 'commit;'].join('\n')}\n`;
let lines = preamble();
const batches = [];
let count = 0;
let batchCount = 0;
for (const referenceFile of fs.readdirSync(path.join(root, 'reference')).filter((name) => name.endsWith('.json')
  && (!requestedWorld || name === `${requestedWorld}.json`)).sort()) {
  const worldSlug = referenceFile.slice(0, -5);
  const packFile = path.join(root, `${worldSlug}.json`);
  if (!fs.existsSync(packFile)) throw new Error(`Missing content pack: ${worldSlug}`);
  const events = major ? seedableMajorCatalogs[worldSlug] : JSON.parse(fs.readFileSync(packFile, 'utf8')).events;
  if (events.length !== (major ? 15 : 200)) throw new Error(`${worldSlug} has ${events.length} templates, expected ${major ? 15 : 200}`);
  lines.push(`  select id into strict v_world from public.together_worlds where slug = ${quote(worldSlug)}${includeUnpublished ? '' : ' and published'};`);
  lines.push('  insert into public.together_world_pulse_settings (world_id, enabled) values (v_world, false) on conflict (world_id) do nothing;');
  for (const [eventIndex, event] of events.entries()) {
    const rank = major ? 200 + eventIndex : event.schedulingRank;
    const metadata = major ? { contentDigest: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'), pulseTier: 'major' } : { contentDigest: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex') };
    lines.push(`  select id into strict v_location from public.together_locations where world_id = v_world and slug = ${quote(event.locationSlug)} and owner_user_id is null and archived_at is null;`);
    lines.push(`  select id into strict v_primary from public.together_character_templates where slug = ${quote(event.primaryCharacterSlug)} and published and creator_id is null;`);
    lines.push(`  select id, repeat_identity, scheduling_rank, content_version, metadata into v_existing from public.together_world_pulse_templates where world_id = v_world and slug = ${quote(event.slug)};`);
    lines.push(`  if found and (v_existing.repeat_identity <> ${quote(event.repeatIdentity)} or v_existing.scheduling_rank <> ${rank} or v_existing.content_version > ${event.contentVersion} or coalesce(v_existing.metadata->>'pulseTier', 'routine') <> ${quote(major ? 'major' : 'routine')}) then raise exception 'Unsafe Pulse identity, rank, tier or version edit: ${worldSlug}/${event.slug}'; end if;`);
    lines.push("  v_facts := '[]'::jsonb;");
    for (const fact of event.facts) {
      const known = fact.knownBy ?? [];
      lines.push(`  select coalesce(jsonb_agg(id::text order by id), '[]'::jsonb) into v_known_ids from public.together_character_templates where slug = any(${tags(known)}) and published and creator_id is null;`);
      lines.push(`  if jsonb_array_length(v_known_ids) <> ${known.length} then raise exception 'Unknown Pulse fact knower: ${worldSlug}/${event.slug}/${fact.id}'; end if;`);
      lines.push(`  v_facts := v_facts || jsonb_build_array(jsonb_build_object('id',${quote(fact.id)},'text',${quote(fact.text)},'userVisible',${fact.userVisible ? 'true' : 'false'},'knownByCharacterTemplateIds',v_known_ids));`);
    }
    lines.push(`  insert into public.together_world_pulse_templates (world_id,slug,repeat_identity,scheduling_rank,content_version,title,feed_summary,detail_body,group_message,event_type,location_id,primary_character_template_id,significance,selection_weight,cooldown_days,content_rating,facts,active,tags,metadata) values (v_world,${quote(event.slug)},${quote(event.repeatIdentity)},${rank},${event.contentVersion},${quote(event.title)},${quote(event.feedSummary)},${quote(event.detailBody)},${event.groupMessage ? quote(event.groupMessage) : 'null'},${quote(event.eventType)},v_location,v_primary,${event.significance},${event.selectionWeight ?? 1},${event.cooldownDays},${quote(event.contentRating)},v_facts,true,${tags(event.tags)},${json(metadata)}) on conflict (world_id,slug) do update set content_version = excluded.content_version,title = excluded.title,feed_summary = excluded.feed_summary,detail_body = excluded.detail_body,group_message = excluded.group_message,event_type = excluded.event_type,location_id = excluded.location_id,primary_character_template_id = excluded.primary_character_template_id,significance = excluded.significance,selection_weight = excluded.selection_weight,cooldown_days = excluded.cooldown_days,content_rating = excluded.content_rating,facts = excluded.facts,active = true,tags = excluded.tags,metadata = excluded.metadata,updated_at = now() returning id into v_template;`);
    lines.push('  delete from public.together_world_pulse_template_participants where template_id = v_template;');
    for (const [ordinal, participant] of event.participants.entries()) {
      lines.push(`  select id into strict v_character from public.together_character_templates where slug = ${quote(participant.characterSlug)} and published and creator_id is null;`);
      lines.push(`  if not exists (select 1 from public.together_character_world_presence presence join public.together_character_versions version on version.id = presence.character_version_id join public.together_character_templates template on template.id = version.character_template_id and template.current_published_version = version.version where presence.world_id = v_world and presence.presence_type = 'resident' and template.id = v_character) then raise exception 'Nonresident Pulse participant: ${worldSlug}/${event.slug}/${participant.characterSlug}'; end if;`);
      lines.push(`  insert into public.together_world_pulse_template_participants (template_id,character_template_id,ordinal,role_label,perspective_summary,default_direct_message,knowledge) values (v_template,v_character,${ordinal},${quote(participant.roleLabel)},${quote(participant.perspective)},${quote(participant.defaultDirectMessage)},${json({ knownFactIds: participant.knownFactIds ?? [], revealConstraints: participant.revealConstraints ?? [] })});`);
    }
    count++;
    batchCount++;
    if (batchSize && batchCount === batchSize) {
      batches.push(close(lines));
      lines = preamble();
      lines.push(`  select id into strict v_world from public.together_worlds where slug = ${quote(worldSlug)}${includeUnpublished ? '' : ' and published'};`);
      batchCount = 0;
    }
  }
}
if (batchSize) {
  if (batchCount) batches.push(close(lines));
  const base = path.resolve(target).slice(0, -4);
  batches.forEach((sql, index) => fs.writeFileSync(`${base}-${String(index + 1).padStart(2, '0')}.sql`, sql));
  console.log(`Wrote ${count} Pulse templates in ${batches.length} reviewable batches at ${base}-NN.sql. No database was changed.`);
} else {
  fs.writeFileSync(path.resolve(target), close(lines));
  console.log(`Wrote ${count} Pulse templates to ${path.resolve(target)}. No database was changed.`);
}
