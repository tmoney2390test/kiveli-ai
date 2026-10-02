import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Generates a reviewable SQL import; it never connects to production. Apply
// only after world-pulse:validate passes and the release is approved.
const root = path.resolve('content/world-pulse');
const target = process.argv.at(-1);
if (!target || target.startsWith('--') || !target.endsWith('.sql')) {
  console.error('Usage: pnpm world-pulse:seed -- <output.sql>');
  process.exit(2);
}
const validation = spawnSync(process.execPath, ['--experimental-strip-types', path.resolve('scripts/world-pulse-validate.mjs')], {
  cwd: path.resolve('.'), encoding: 'utf8', maxBuffer: 2_000_000,
});
if (validation.status !== 0) {
  process.stderr.write(validation.stdout ?? '');
  process.stderr.write(validation.stderr ?? '');
  throw new Error('World Pulse validation failed; no seed SQL was written.');
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const tags = (value) => `array[${(value ?? []).map(quote).join(',')}]::text[]`;
const lines = ['begin;', 'set local search_path = public, extensions;', 'do $world_pulse_seed$', 'declare', '  v_world uuid;', '  v_location uuid;', '  v_primary uuid;', '  v_template uuid;', '  v_character uuid;', '  v_existing record;', '  v_facts jsonb;', '  v_known_ids jsonb;', 'begin'];
let count = 0;
for (const referenceFile of fs.readdirSync(path.join(root, 'reference')).filter((name) => name.endsWith('.json')).sort()) {
  const worldSlug = referenceFile.slice(0, -5);
  const packFile = path.join(root, `${worldSlug}.json`);
  if (!fs.existsSync(packFile)) throw new Error(`Missing content pack: ${worldSlug}`);
  const events = JSON.parse(fs.readFileSync(packFile, 'utf8')).events;
  if (events.length !== 200) throw new Error(`${worldSlug} has ${events.length} templates, expected 200`);
  lines.push(`  select id into strict v_world from public.together_worlds where slug = ${quote(worldSlug)} and published;`);
  lines.push('  insert into public.together_world_pulse_settings (world_id, enabled) values (v_world, false) on conflict (world_id) do nothing;');
  for (const event of events) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    lines.push(`  select id into strict v_location from public.together_locations where world_id = v_world and slug = ${quote(event.locationSlug)};`);
    lines.push(`  select id into strict v_primary from public.together_character_templates where slug = ${quote(event.primaryCharacterSlug)} and published and creator_id is null;`);
    lines.push(`  select id, repeat_identity, scheduling_rank, content_version into v_existing from public.together_world_pulse_templates where world_id = v_world and slug = ${quote(event.slug)};`);
    lines.push(`  if found and (v_existing.repeat_identity <> ${quote(event.repeatIdentity)} or v_existing.scheduling_rank <> ${event.schedulingRank} or v_existing.content_version > ${event.contentVersion}) then raise exception 'Unsafe Pulse identity, rank or version edit: ${worldSlug}/${event.slug}'; end if;`);
    lines.push("  v_facts := '[]'::jsonb;");
    for (const fact of event.facts) {
      const known = fact.knownBy ?? [];
      lines.push(`  select coalesce(jsonb_agg(id::text order by id), '[]'::jsonb) into v_known_ids from public.together_character_templates where slug = any(${tags(known)}) and published and creator_id is null;`);
      lines.push(`  if jsonb_array_length(v_known_ids) <> ${known.length} then raise exception 'Unknown Pulse fact knower: ${worldSlug}/${event.slug}/${fact.id}'; end if;`);
      lines.push(`  v_facts := v_facts || jsonb_build_array(jsonb_build_object('id',${quote(fact.id)},'text',${quote(fact.text)},'userVisible',${fact.userVisible ? 'true' : 'false'},'knownByCharacterTemplateIds',v_known_ids));`);
    }
    lines.push(`  insert into public.together_world_pulse_templates (world_id,slug,repeat_identity,scheduling_rank,content_version,title,feed_summary,detail_body,group_message,event_type,location_id,primary_character_template_id,significance,selection_weight,cooldown_days,content_rating,facts,active,tags,metadata) values (v_world,${quote(event.slug)},${quote(event.repeatIdentity)},${event.schedulingRank},${event.contentVersion},${quote(event.title)},${quote(event.feedSummary)},${quote(event.detailBody)},${event.groupMessage ? quote(event.groupMessage) : 'null'},${quote(event.eventType)},v_location,v_primary,${event.significance},${event.selectionWeight ?? 1},${event.cooldownDays},${quote(event.contentRating)},v_facts,true,${tags(event.tags)},${json({ contentDigest: digest })}) on conflict (world_id,slug) do update set content_version = excluded.content_version,title = excluded.title,feed_summary = excluded.feed_summary,detail_body = excluded.detail_body,group_message = excluded.group_message,event_type = excluded.event_type,location_id = excluded.location_id,primary_character_template_id = excluded.primary_character_template_id,significance = excluded.significance,selection_weight = excluded.selection_weight,cooldown_days = excluded.cooldown_days,content_rating = excluded.content_rating,facts = excluded.facts,active = true,tags = excluded.tags,metadata = excluded.metadata,updated_at = now() returning id into v_template;`);
    lines.push('  delete from public.together_world_pulse_template_participants where template_id = v_template;');
    for (const [ordinal, participant] of event.participants.entries()) {
      lines.push(`  select id into strict v_character from public.together_character_templates where slug = ${quote(participant.characterSlug)} and published and creator_id is null;`);
      lines.push(`  if not exists (select 1 from public.together_character_world_presence presence join public.together_character_versions version on version.id = presence.character_version_id join public.together_character_templates template on template.id = version.character_template_id and template.current_published_version = version.version where presence.world_id = v_world and presence.presence_type = 'resident' and template.id = v_character) then raise exception 'Nonresident Pulse participant: ${worldSlug}/${event.slug}/${participant.characterSlug}'; end if;`);
      lines.push(`  insert into public.together_world_pulse_template_participants (template_id,character_template_id,ordinal,role_label,perspective_summary,default_direct_message,knowledge) values (v_template,v_character,${ordinal},${quote(participant.roleLabel)},${quote(participant.perspective)},${quote(participant.defaultDirectMessage)},${json({ knownFactIds: participant.knownFactIds ?? [], revealConstraints: participant.revealConstraints ?? [] })});`);
    }
    count++;
  }
}
lines.push('end $world_pulse_seed$;', 'commit;');
fs.writeFileSync(path.resolve(target), `${lines.join('\n')}\n`);
console.log(`Wrote ${count} Pulse templates to ${path.resolve(target)}. No database was changed.`);
