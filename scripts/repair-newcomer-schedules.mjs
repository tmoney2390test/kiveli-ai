import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(resolve(root, 'content/schedule-repairs/adult-cast-2026.json'), 'utf8'));
const homes = JSON.parse(await readFile(resolve(root, 'content/schedule-repairs/home-locations-2026.json'), 'utf8'));
const allPlaces = [...source.locations, ...homes];
const locations = new Map(allPlaces.map(place => [`${place.world}/${place.slug}`, place]));
const byId = new Map(allPlaces.map(place => [place.id, place]));
const hash = value => createHash('sha256').update(value).digest().readUInt32BE(0);
const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

// These are ordinary visible tasks, not new story claims or edits to protected bibles.
const taskRules = [
  [/clinic euphorics dealer/i, 'Checking patient requests and preparing clinic doses'],
  [/hostage negotiator/i, 'Reviewing the case and rehearsing the next negotiation'],
  [/love-hotel clerk/i, 'Handling arrivals, room keys, and night requests'],
  [/spice courtyard poisoner/i, 'Measuring ingredients and checking orders'],
  [/manuscript forger/i, 'Copying pages and matching the original hand'],
  [/weapons smuggler/i, 'Checking cargo covers and departure paperwork'],
  [/brass compass knife-girl/i, 'Rehearsing the knife act and checking the stage'],
  [/privateer boarding-master/i, 'Inspecting rigging and drilling the boarding crew'],
  [/avalanche body-recovery/i, 'Checking rescue equipment and recovery reports'],
  [/dock debt collector/i, 'Reconciling dock accounts and meeting debtors'],
  [/boat-rental cover/i, 'Inspecting rental boats and handling bookings'],
  [/forbidden anatomist/i, 'Preparing anatomical studies and checking notes'],
  [/grave-witch/i, 'Gathering herbs and preparing graveyard remedies'],
  [/strangler-for-hire/i, 'Reviewing the assignment and checking equipment'],
  [/nude-portrait painter/i, 'Preparing a sitting and working the canvas'],
  [/fishing-boat hitman/i, 'Preparing the fishing boat and checking gear'],
  [/war-surgeon/i, 'Preparing surgical instruments and checking patients'],
  [/iceworks killer-for-hire/i, 'Checking cold-weather gear and meeting a client'],
  [/signal interrogator/i, 'Reviewing transmission logs and questioning witnesses'],
  [/marigold house girl|dance-hall girl/i, 'Greeting guests and preparing the evening room'],
  [/private military contractor/i, 'Inspecting equipment and briefing the security team'],
  [/crime-scene cleaner/i, 'Documenting the site and cleaning hazardous residue'],
  [/fight promoter|deathmatch promoter/i, 'Checking the card, venue, and fighter bookings'],
  [/pleasure-android handler/i, 'Inspecting android systems and handling client requests'],
  [/terrain-park rider/i, 'Practicing jumps and checking the course'],
  [/dominatrix/i, 'Preparing private appointments and checking the room'],
  [/beach attendant/i, 'Setting out beach equipment and helping visitors'],
  [/conservatory siren/i, 'Rehearsing and preparing the conservatory performance'],
  [/estate huntsman/i, 'Checking the estate trails and tending equipment'],
  [/pirate boarding-master/i, 'Inspecting rigging and drilling the boarding crew'],
  [/portraitist|portrait painter|blackmail photographer|photographer/i, 'Setting up portrait sittings and processing images'],
  [/printer|lithograph/i, 'Setting type and pulling fresh prints'],
  [/red sash girl|working girl|call girl|courtesan|escort|companion|gigolo/i, 'Taking appointments and tending to guests'],
  [/card-room lookout|card-room killer/i, 'Watching the tables and reading the room'],
  [/card cheat/i, 'Working the card tables and watching the stakes'],
  [/clerk|court|magistrate|attorney|counsel|investigator|detective/i, 'Reviewing case files and meeting clients'],
  [/deacon|priestess|priest|inquisition|oathbinder|oath-sex binder/i, 'Preparing rites and receiving visitors'],
  [/widow who shoots|close-protection|ranger|guide/i, 'Checking routes and equipment before heading out'],
  [/grave|funeral|body-recovery/i, 'Recording the dead and tending the grounds'],
  [/forge|arms founder|weapons|knife|iron/i, 'Checking tools, orders, and finished metalwork'],
  [/saloon girl|bartender|waitress|sommelier/i, 'Serving guests and closing out the room'],
  [/strikebreaker|railroad|mine-road runner|road runner/i, 'Inspecting the route and arranging the next run'],
  [/baths attendant|bathhouse|sauna|spa|private-recovery/i, 'Preparing rooms and checking on guests'],
  [/ranch|horses/i, 'Checking the stock and tending the property'],
  [/dancer|burlesque|stripper|exhibition|performer|dj|film programmer/i, 'Rehearsing and preparing the next show'],
  [/cook|chef|kitchen|bakery/i, 'Preparing the kitchen and cooking the service'],
  [/ferryman|diver|boat|fishing|harbor|dock|privateer|smuggler|importer|customs|wrecker|cargo/i, 'Checking manifests, gear, and the next crossing'],
  [/dealer|broker|fence|collector|fixer|access/i, 'Meeting clients and checking the accounts'],
  [/tattooist|body-mod/i, 'Preparing designs, tools, and client appointments'],
  [/pleasure designer|set designer|film director|livestreamer|porn producer/i, 'Setting up the room, equipment, and next production'],
  [/nurse|clinician|medic|surgeon|anatomist/i, 'Checking patient records and preparing care'],
  [/gene-mod|chemists?|poisoner|researcher/i, 'Preparing samples and reviewing results'],
  [/trainer|pilot|suit|patrol/i, 'Inspecting equipment and running a supervised session'],
  [/interrogator|spy|intelligence|memory thief/i, 'Sorting leads and checking witness accounts'],
  [/fighter|duelist|enforcer|assassin|killer|hitman|gunner|executioner|guard|warden/i, 'Training, checking equipment, and meeting the next assignment'],
  [/dominant|host|madam|floor captain|floor mistress/i, 'Preparing the space and handling bookings'],
  [/gallery|auction|market|exchange|mercantile/i, 'Preparing displays and meeting buyers'],
  [/letter|manuscript forger|editor/i, 'Working through documents and checking details'],
  [/gardener|horticult/i, 'Tending plants and checking the growing beds'],
  [/witch/i, 'Preparing remedies and meeting visitors'],
];

const unmatchedTasks = new Set();
const workTask = character => {
  const rule = taskRules.find(([pattern]) => pattern.test(character.occupation));
  if (!rule) { unmatchedTasks.add(`${character.world}/${character.slug}: ${character.occupation}`); return 'Preparing for appointments'; }
  return rule[1];
};

const leisureRules = [
  [/swim|diving|cold plunge/i, 'Swimming'],
  [/dance|reggaeton/i, 'Practicing dance steps'],
  [/music|jazz|gospel|song|vinyl|record|synth|opera|piano/i, 'Listening to music'],
  [/film|movie|16mm|theatre/i, 'Watching a film'],
  [/coffee|tea|aquavit|bourbon|whiskey|wine|champagne|mezcal|spritz|amaro|grappa|grog|vodka|rum|cocktail/i, 'Sharing a drink and catching up'],
  [/card|chess|game|gaming|pool|odds/i, 'Playing a game'],
  [/run|walk|trail|woods|fog|rain|snow|first tracks/i, 'Taking a long walk'],
  [/boxing|strength|weight|range|jump|climb|fight/i, 'Training'],
  [/cook|food|steak|noodles|pizza|plates|breakfast/i, 'Cooking a meal'],
  [/book|archive|law|history|liturgy|map|chart|letter|zine/i, 'Reading'],
  [/fashion|tailor|sew|jewel|lingerie|cashmere|silk|costume/i, 'Repairing and choosing an outfit'],
  [/photo|portrait|camera|optics|darkroom|ink|type|paper|sketch|paint/i, 'Sketching and sorting images'],
  [/flower|plant|herb|root|botany/i, 'Tending plants'],
  [/horse|dog/i, 'Spending time with animals'],
  [/sail|boat|tide|night fishing/i, 'Walking by the water'],
  [/repair|hardware|engine|wax|van|moped/i, 'Tinkering with equipment'],
  [/sailing|racing|flight sims/i, 'Practicing routes'],
];
const leisure = (character, day) => {
  const interests = character.interests ?? [];
  for (let offset = 0; offset < interests.length; offset++) {
    const interest = interests[(day + offset) % interests.length];
    const rule = leisureRules.find(([pattern]) => pattern.test(interest));
    if (rule) return rule[1];
  }
  return 'Reading and resting';
};

function venueWindow(place) {
  if (!place?.hours?.open || !place?.hours?.close) return null;
  const open = minutes(place.hours.open);
  let close = minutes(place.hours.close);
  if (close <= open) close += 1440;
  return [open, close];
}
function venueOpen(place, start, end) {
  const window = venueWindow(place);
  if (!window) return true;
  return [0, -1440, 1440].some(offset => start >= window[0] + offset && end <= window[1] + offset);
}
function shiftFor(character) {
  const place = locations.get(`${character.world}/${character.workLocation}`);
  if (!place) throw new Error(`Workplace missing: ${character.slug}`);
  const [open, close] = venueWindow(place) ?? (character.workPattern === 'night' ? [1020, 1560] : [480, 1140]);
  const preferred = character.workPattern === 'night' ? 1080 : 540;
  const start = Math.max(open, Math.min(preferred, close - 360));
  const end = Math.min(start + 420, close);
  if (end - start < 300) throw new Error(`Workplace has no credible shift: ${character.slug}`);
  return { place, start, end };
}
function offDays(character) {
  const start = [0, 5, 6][hash(character.slug) % 3];
  return new Set([start, (start + 1) % 7]);
}
function activityAtPlace(activity, place) {
  const category = String(place.category ?? '').toLowerCase();
  const named = String(place.name ?? '').toLowerCase();
  const matches = (pattern) => pattern.test(category) || pattern.test(named);
  const compatible = {
    'Swimming': /beach|bath|pool|spa|waterfall|lake|reef/,
    'Practicing dance steps': /dance|nightclub|music|theater|theatre|entertainment/,
    'Listening to music': /music|karaoke|lounge|bar|club|theater|theatre|saloon|tavern/,
    'Watching a film': /cinema|theater|theatre|entertainment/,
    'Sharing a drink and catching up': /bar|cafe|pub|saloon|tavern|restaurant|diner|lounge|roadhouse/,
    'Playing a game': /cardroom|barcade|pub|saloon|tavern|cafe|lounge/,
    'Taking a long walk': /beach|park|trail|garden|nature|outdoor|market|courtyard|harbor|pier|waterfall/,
    'Training': /gym|fitness|arena|training|terrain park|climbing/,
    'Cooking a meal': /kitchen|restaurant|bakery|diner/,
    'Reading': /bookstore|library|archive|cafe|academic/,
    'Repairing and choosing an outfit': /shopping|market|laundry|salon/,
    'Sketching and sorting images': /gallery|studio|garden|park|cafe/,
    'Tending plants': /garden|conservatory|orchard|greenhouse|courtyard/,
    'Spending time with animals': /equestrian|ranch|park|outdoor/,
    'Walking by the water': /beach|harbor|marina|pier|dock|reef|waterfall/,
    'Tinkering with equipment': /workshop|repair|forge|foundry|yard|hangar/,
    'Practicing routes': /transit|spaceport|harbor|marina|trail|outdoor/,
  };
  if (compatible[activity]?.test(category) || compatible[activity]?.test(named)) return activity;
  if (matches(/restaurant|cafe|diner|bakery|pizza shop/)) return 'Having a meal';
  if (matches(/bar|pub|saloon|tavern|lounge|roadhouse/)) return 'Meeting a friend for a drink';
  if (matches(/beach|park|trail|garden|nature|outdoor|waterfall|pier/)) return 'Taking a walk';
  if (matches(/gallery|museum/)) return 'Viewing an exhibition';
  if (matches(/market|shopping|general store/)) return 'Browsing the stalls';
  if (matches(/music|theater|theatre|cinema|karaoke/)) return 'Watching a performance';
  if (matches(/gym|fitness|arena|training/)) return 'Training';
  return null;
}
function homeLeisure(activity) {
  if (['Swimming','Walking by the water','Taking a long walk','Spending time with animals'].includes(activity)) return 'Taking a walk near home';
  if (activity === 'Training') return 'Exercising at home';
  if (activity === 'Practicing routes') return 'Studying routes at home';
  if (activity === 'Sharing a drink and catching up') return 'Making a drink and calling a friend';
  if (activity === 'Watching a film') return 'Watching a film at home';
  return activity;
}
function openLeisure(character, day, preferred, occupied, interestActivity) {
  const slugs = (character.publicLocations ?? []).filter(slug => slug !== character.workLocation);
  for (const delta of [0, 60, -60, 120, -120, 180, -180]) {
    const start = Math.round((preferred + delta) / 30) * 30;
    const end = start + 90;
    if (start < 420 || end > 1320 || occupied.some(block => start < block.end && end > block.start)) continue;
    for (const slug of slugs) {
      const place = locations.get(`${character.world}/${slug}`);
      const activity = place ? activityAtPlace(interestActivity, place) : null;
      if (place && activity && venueOpen(place, start, end)) return { start, end, place, activity };
    }
  }
  return null;
}
function generateCharacter(character) {
  const home = byId.get(character.homeLocationId);
  if (!home || home.world !== character.world) throw new Error(`Home mismatch: ${character.slug}`);
  const shift = shiftFor(character);
  const off = offDays(character);
  const shifts = [];
  for (let day = -7; day < 14; day++) {
    if (off.has((day + 70) % 7)) continue;
    shifts.push({ start: day * 1440 + shift.start, end: day * 1440 + shift.end });
  }
  const rows = [];
  for (let day = 0; day < 7; day++) {
    const absolute = day * 1440;
    const work = shifts.flatMap(item => {
      const start = Math.max(0, item.start - absolute), end = Math.min(1440, item.end - absolute);
      return start < end ? [{ start, end, place: shift.place, activity: workTask(character), availability: 'busy', kind: 'work' }] : [];
    });
    const carryEnd = work.find(item => item.start === 0 && item.end <= 360)?.end ?? 0;
    const firstWork = work.find(item => item.start >= 240)?.start ?? 1440;
    const night = character.workPattern === 'night' || shift.start >= 960;
    let wake = carryEnd ? Math.min(carryEnd + 420, 720) : night ? 540 : 420;
    wake = Math.min(wake, Math.max(300, firstWork - 60));
    const blocks = [...work];
    if (carryEnd) blocks.push({ start: carryEnd, end: wake, place: home, activity: 'Sleeping after the late shift', availability: 'busy', kind: 'sleep' });
    else blocks.push({ start: 0, end: wake, place: home, activity: off.has(day) ? 'Sleeping in at home' : 'Sleeping at home', availability: 'busy', kind: 'sleep' });
    const preferred = off.has(day) ? (night ? 1020 : 840) : night ? Math.max(wake + 90, Math.min(840, firstWork - 180)) : Math.min(1110, firstWork < 1000 ? firstWork + 480 : 900);
    const interestActivity = leisure(character, day);
    const outing = openLeisure(character, day, preferred, blocks, interestActivity);
    if (outing) blocks.push({ ...outing, availability: 'available', kind: 'leisure' });
    else {
      const free = [];
      const sorted = [...blocks].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i++) {
        const start = sorted[i].end, end = sorted[i + 1]?.start ?? 1440;
        if (end - start >= 120 && start >= wake) free.push({ start, end });
      }
      const gap = free.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
      if (gap) blocks.push({ start: gap.start + 30, end: gap.start + 120, place: home, activity: homeLeisure(interestActivity), availability: 'available', kind: 'leisure' });
    }
    const sorted = blocks.sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      if (i && block.start < sorted[i - 1].end) throw new Error(`Overlapping blocks: ${character.slug} day ${day}`);
      rows.push({ day, ...block });
      const gapEnd = sorted[i + 1]?.start ?? 1440;
      if (block.end < gapEnd) {
        const mid = (block.end + gapEnd) / 2;
        const activity = off.has(day)
          ? mid < 960 ? 'Cooking and taking care of home' : 'Relaxing at home after errands'
          : mid < 900 ? 'Having a meal and preparing for the day' : mid < 1200 ? 'Eating and getting ready for the next shift' : 'Unwinding at home';
        rows.push({ day, start: block.end, end: gapEnd, place: home, activity, availability: 'available', kind: 'home' });
      }
    }
  }
  return { rows, workDays: [...Array(7).keys()].filter(day => !off.has(day)) };
}

const planned = source.characters.map(character => ({ character, ...generateCharacter(character) }));
if (unmatchedTasks.size) throw new Error(`No specific work task for:\n${[...unmatchedTasks].join('\n')}`);
const issues = [];
for (const { character, rows, workDays } of planned) {
  if (workDays.length !== 5 || rows.length < 28) issues.push(`${character.slug}: missing days or blocks`);
  for (let day = 0; day < 7; day++) {
    const list = rows.filter(row => row.day === day).sort((a, b) => a.start - b.start);
    if (list[0]?.start !== 0 || list.at(-1)?.end !== 1440) issues.push(`${character.slug}: incomplete day ${day}`);
    for (let i = 1; i < list.length; i++) if (list[i - 1].end !== list[i].start) issues.push(`${character.slug}: gap/overlap day ${day}`);
    for (const row of list) {
      if (row.end <= row.start || (row.place !== byId.get(character.homeLocationId) && !venueOpen(row.place, row.start, row.end)))
        issues.push(`${character.slug}: closed venue day ${day}`);
      if (row.kind === 'leisure' && row.place !== byId.get(character.homeLocationId) && activityAtPlace(row.activity, row.place) !== row.activity)
        issues.push(`${character.slug}: mismatched activity/venue day ${day}`);
    }
  }
}
if (issues.length) throw new Error(issues.slice(0, 25).join('\n'));
const report = {
  characters: planned.length,
  worlds: Object.fromEntries([...new Set(source.characters.map(x => x.world))].map(world => [world, planned.filter(x => x.character.world === world).length])),
  blocks: planned.reduce((n, x) => n + x.rows.length, 0),
  workDays: planned.reduce((n, x) => n + x.workDays.length, 0),
  offDays: planned.length * 2,
  outsideVenueHours: 0,
  incompleteDays: 0,
};
if (process.argv.includes('--review')) {
  for (const { character, rows, workDays } of planned) {
    console.log(`${character.world}/${character.slug} | ${character.occupation} | ${workTask(character)} | ${leisure(character, 1)} | off: ${[...Array(7).keys()].filter(day => !workDays.includes(day)).join(',')} | blocks: ${rows.length}`);
  }
  process.exit(0);
}
if (process.argv.includes('--job-payload')) {
  console.log(JSON.stringify(planned.map(({character,workDays})=>({versionId:character.versionId,workDays,workTask:workTask(character)}))));
  process.exit(0);
}
if (process.argv.includes('--report')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
if (!process.argv.includes('--write-sql')) throw new Error('Use --report or --write-sql');
const outputs = [];
for (const world of Object.keys(report.worlds)) {
  const payload = planned.filter(item => item.character.world === world).map(({ character, rows, workDays }) => ({
    slug: character.slug, workDays, workTask: workTask(character),
    blocks: rows.map(row => [
      row.day, row.start, row.end, row.place.slug, row.activity, row.availability,
      row.kind === 'sleep' ? 2 : row.kind === 'work' ? -1 : 0, row.kind,
    ]),
  }));
  const sql = `-- Adult-cast routine repair for ${world}; resolves characters and venues by canonical slugs.
-- Updates only their V1/this repair's authored schedule rows and future recurring materialization.
begin;
do $repair$
declare
  v_world uuid;
  v_version uuid;
  v_location uuid;
  v_location_name text;
  v_old_count integer;
  v_owned_count integer;
  v_char jsonb;
  v_row jsonb;
  v_payload jsonb := ${quote(JSON.stringify(payload))}::jsonb;
begin
  select id into strict v_world from together_worlds where slug = ${quote(world)} and published = true;
  if jsonb_array_length(v_payload) <> 20 then raise exception 'Expected 20 ${world} characters'; end if;
  for v_char in select value from jsonb_array_elements(v_payload) loop
    select cv.id into strict v_version
    from together_character_templates ct
    join together_character_versions cv on cv.character_template_id = ct.id and cv.version = ct.current_published_version
    join together_character_world_presence p on p.character_version_id = cv.id and p.world_id = v_world
    where ct.slug = v_char->>'slug' and ct.published = true
    limit 1;
    select count(*), count(*) filter (
      where metadata->>'source' in ('adult_cast_expansion_v1','gilded_coast_adult_cast_v1','adult_cast_schedule_v2')
    ) into v_old_count, v_owned_count
    from together_schedule_templates where character_version_id = v_version;
    if v_old_count <> v_owned_count then
      raise exception 'Refusing to replace a manually edited schedule: %', v_char->>'slug';
    end if;
    delete from together_character_schedule_events e
    using together_character_instances i
    where e.character_instance_id = i.id
      and i.character_version_id = v_version
      and e.source = 'recurring'
      and e.ends_at > now();
    delete from together_schedule_templates where character_version_id = v_version;
    for v_row in select value from jsonb_array_elements(v_char->'blocks') loop
      select id,name into strict v_location,v_location_name
      from together_locations
      where world_id = v_world and slug = v_row->>3 and owner_user_id is null;
      insert into together_schedule_templates
        (character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,metadata)
      values
        (v_version,(v_row->>0)::smallint,(v_row->>1)::smallint,(v_row->>2)::smallint,
         v_location,v_row->>4,v_row->>5,(v_row->>6)::smallint,
         jsonb_build_object('source','adult_cast_schedule_v2','scheduleMode','authored',
           'userLocalClock',true,'weekIndex',0,'activityKey',v_row->>7,
           'displayLocation',v_location_name));
    end loop;
    update together_character_versions
    set life_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(life_config,'{workDays}',v_char->'workDays',true),
          '{occupation,workDays}',v_char->'workDays',true),
        '{occupation,activityVariants}',jsonb_build_array(v_char->>'workTask'),true),
      '{scheduling,generationVersion}',to_jsonb('adult_cast_schedule_v2'::text),true)
    where id = v_version;
  end loop;
end $repair$;
commit;
`;
  const output = resolve(root, `scripts/sql/newcomer-schedule-repair-${world}.sql`);
  await writeFile(output, sql);
  outputs.push({ world, output, bytes: Buffer.byteLength(sql) });
}
console.log(JSON.stringify({ ...report, outputs }, null, 2));
