import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(resolve(root, 'content/schedule-repairs/adult-cast-2026.json'), 'utf8'));
const sqlQuote = value => `'${String(value).replaceAll("'", "''")}'`;

// These all make sense inside a private home. In particular, an interest in
// swimming or walking must never become an all-night swim or an indoor walk.
const homeHobbies = [
  [/film|movie|16mm|theatre/i, 'Watching an old film'],
  [/coffee|tea/i, 'Reading over a cup of tea'],
  [/music|jazz|gospel|song|vinyl|record|synth|opera|piano/i, 'Putting on music'],
  [/card|chess|game|gaming|pool|odds|puzzle/i, 'Playing a game'],
  [/cook|food|steak|noodles|pizza|plates|breakfast|bread/i, 'Trying a new recipe'],
  [/book|archive|law|history|liturgy|map|chart|letter|zine/i, 'Reading for pleasure'],
  [/fashion|tailor|sew|jewel|lingerie|cashmere|silk|costume/i, 'Mending an outfit'],
  [/photo|portrait|camera|optics|darkroom|ink|type|paper|sketch|paint/i, 'Sketching at home'],
  [/flower|plant|herb|root|botany/i, 'Tending a few plants'],
  [/repair|hardware|engine|wax|van|moped|knife|gear/i, 'Fixing a piece of equipment'],
  [/dance|reggaeton/i, 'Practicing dance steps'],
  [/swim|diving|cold plunge|boxing|strength|weight|range|jump|climb|fight|run|walk|trail|woods|fog|rain|snow/i, 'Doing a short stretch at home'],
  [/horse|dog|animal/i, 'Looking after an animal'],
  [/sail|boat|tide|fishing|flight sims|route/i, 'Looking over route notes'],
  [/wine|champagne|mezcal|spritz|amaro|grappa|grog|vodka|rum|cocktail|bourbon|whiskey/i, 'Putting on music'],
];

function hobbies(character) {
  const activities = (character.interests ?? [])
    .map(interest => homeHobbies.find(([pattern]) => pattern.test(interest))?.[1])
    .filter(Boolean);
  const unique = [...new Set(activities)];
  for (const fallback of ['Reading for pleasure', 'Trying a new recipe']) {
    if (unique.length >= 2) break;
    if (!unique.includes(fallback)) unique.push(fallback);
  }
  return unique.slice(0, 2);
}

const cast = source.characters.map(character => ({
  world: character.world,
  slug: character.slug,
  hobbies: hobbies(character),
}));
const residentsWithoutMappedHobby = source.characters
  .filter(character => !(character.interests ?? []).some(interest =>
    homeHobbies.some(([pattern]) => pattern.test(interest))))
  .map(character => `${character.world}/${character.slug}`);
if (cast.length !== 180 || new Set(cast.map(x => `${x.world}/${x.slug}`)).size !== 180) {
  throw new Error('Expected the 180 distinct canonical adult-cast residents');
}

const worlds = [...new Set(cast.map(x => x.world))];
// Assigned by the production migration service. Keep checked-in filenames in
// sync with its history so later CLI dry runs do not see phantom migrations.
const migrationVersions = {
  'calders-run': '20261008205507',
  'eos-meridian': '20261008205552',
  'gilded-coast': '20261008205630',
  'juniper-city': '20261008205708',
  'neon-kyo': '20261008205743',
  'northvale': '20261008205822',
  'port-vervelle': '20261008205906',
  'vespormoor': '20261008205944',
  'vharadren': '20261008210024',
};
const outputs = [];
for (const worldSlug of worlds) {
const payload = sqlQuote(JSON.stringify(cast.filter(x => x.world === worldSlug)));
const sql = `begin;

-- The adult cast already has seven-day coverage. Vary home activities without
-- inventing new commitments, and alternate each public leisure outing with a
-- week at home. Work shifts, sleep, venue hours, and personal plans stay put.
create temporary table routine_cast on commit drop as
select world, slug, hobbies
from jsonb_to_recordset(${payload}::jsonb)
  as person(world text, slug text, hobbies jsonb);

do $check$
declare matched integer;
begin
  select count(distinct version.id) into matched
  from routine_cast cast_member
  join together_worlds world on world.slug = cast_member.world and world.published = true
  join together_character_templates person on person.slug = cast_member.slug and person.published = true
  join together_character_versions version on version.character_template_id = person.id
    and version.version = person.current_published_version
  join together_character_world_presence presence on presence.character_version_id = version.id
    and presence.world_id = world.id
  join together_schedule_templates schedule on schedule.character_version_id = version.id
    and schedule.metadata->>'source' = 'adult_cast_schedule_v2';
  if matched <> 20 then
    raise exception 'Routine polish expected 20 ${worldSlug} residents, found %', matched;
  end if;
end $check$;

with roster as (
  select version.id as version_id, cast_member.hobbies
  from routine_cast cast_member
  join together_worlds world on world.slug = cast_member.world and world.published = true
  join together_character_templates person on person.slug = cast_member.slug and person.published = true
  join together_character_versions version on version.character_template_id = person.id
    and version.version = person.current_published_version
  join together_character_world_presence presence on presence.character_version_id = version.id
    and presence.world_id = world.id
)
update together_schedule_templates schedule
set activity = case when schedule.metadata->>'activityKey' = 'home'
  then case when schedule.start_minute < 660
    then 'Making breakfast and getting ready for the day'
    when schedule.start_minute < 1080
    then 'Making a meal and catching up on chores'
    else 'Making dinner and winding down' end
  else schedule.activity end,
  metadata = coalesce(schedule.metadata, '{}'::jsonb) ||
  case when schedule.location_id is null then jsonb_build_object(
    'activityVariants',
    case
      when schedule.metadata->>'activityKey' = 'home' and schedule.start_minute < 660
        then jsonb_build_array('Making breakfast and getting ready for the day',
          'Having a slow breakfast at home', roster.hobbies->>0)
      when schedule.metadata->>'activityKey' = 'home' and schedule.start_minute < 1080
        then jsonb_build_array('Making a meal and catching up on chores',
          roster.hobbies->>0, roster.hobbies->>1)
      when schedule.metadata->>'activityKey' = 'home'
        then jsonb_build_array('Making dinner and winding down',
          roster.hobbies->>0, roster.hobbies->>1)
      else jsonb_build_array(schedule.activity, roster.hobbies->>0, roster.hobbies->>1)
    end,
    'scheduleEditorialVersion', 'routine_v3'
  ) else jsonb_build_object('scheduleEditorialVersion', 'routine_v3') end ||
  case when schedule.metadata->>'activityKey' = 'leisure' and schedule.location_id is not null
    then jsonb_build_object('cycleWeeks', 2, 'weekIndex', 0,
                            'cycleAnchorDate', '2026-10-05')
    else '{}'::jsonb end
from roster
where schedule.character_version_id = roster.version_id
  and schedule.metadata->>'source' = 'adult_cast_schedule_v2'
  and schedule.metadata->>'activityKey' in ('home', 'leisure');

-- The alternate week occupies the exact same slot at home. It never pretends
-- a character is at a closed venue, and no extra public outing is invented.
with roster as (
  select version.id as version_id, cast_member.hobbies
  from routine_cast cast_member
  join together_worlds world on world.slug = cast_member.world and world.published = true
  join together_character_templates person on person.slug = cast_member.slug and person.published = true
  join together_character_versions version on version.character_template_id = person.id
    and version.version = person.current_published_version
  join together_character_world_presence presence on presence.character_version_id = version.id
    and presence.world_id = world.id
)
insert into together_schedule_templates
  (character_version_id, day_of_week, start_minute, end_minute,
   location_id, activity, availability, energy_delta, metadata)
select schedule.character_version_id, schedule.day_of_week, schedule.start_minute,
  schedule.end_minute, null, roster.hobbies->>0, schedule.availability,
  schedule.energy_delta,
  (schedule.metadata - 'displayLocation') ||
    jsonb_build_object('source', 'adult_cast_schedule_v3', 'weekIndex', 1,
      'displayLocation', 'Home', 'activityVariants',
      jsonb_build_array(roster.hobbies->>0, roster.hobbies->>1,
        'Making something to eat at home'))
from together_schedule_templates schedule
join roster on roster.version_id = schedule.character_version_id
where schedule.metadata->>'source' = 'adult_cast_schedule_v2'
  and schedule.metadata->>'activityKey' = 'leisure'
  and schedule.location_id is not null
  and schedule.metadata->>'scheduleEditorialVersion' = 'routine_v3';

-- A home caption that lasts most of a day feels as repetitive as an all-night
-- swim. Split only long open home stretches into contiguous four-hour slots;
-- the underlying work, sleep, and public outing boundaries remain unchanged.
create temporary table long_home_routines on commit drop as
select schedule.*, roster.hobbies
from together_schedule_templates schedule
join (
  select version.id as version_id, cast_member.hobbies
  from routine_cast cast_member
  join together_worlds world on world.slug = cast_member.world and world.published = true
  join together_character_templates person on person.slug = cast_member.slug and person.published = true
  join together_character_versions version on version.character_template_id = person.id
    and version.version = person.current_published_version
  join together_character_world_presence presence on presence.character_version_id = version.id
    and presence.world_id = world.id
) roster on roster.version_id = schedule.character_version_id
where schedule.metadata->>'source' = 'adult_cast_schedule_v2'
  and schedule.metadata->>'activityKey' = 'home'
  and schedule.end_minute - schedule.start_minute > 240;

update together_schedule_templates schedule
set end_minute = schedule.start_minute + 240
from long_home_routines old
where schedule.id = old.id;

insert into together_schedule_templates
  (character_version_id, day_of_week, start_minute, end_minute,
   location_id, activity, availability, energy_delta, metadata)
select old.character_version_id, old.day_of_week,
       old.start_minute + step.n * 240,
       least(old.end_minute, old.start_minute + (step.n + 1) * 240),
       null, old.hobbies->>(step.n % 2), old.availability,
       old.energy_delta,
       old.metadata || jsonb_build_object('activityVariants',
         jsonb_build_array(old.hobbies->>0, old.hobbies->>1),
         'displayLocation', 'Home')
from long_home_routines old
cross join lateral generate_series(1, ceil((old.end_minute-old.start_minute) / 240.0)::integer - 1) as step(n);

-- The v6 schedule runtime replaces stale generated rows on the next read.
-- Migrations must not remove an active Life's current-day coverage ahead of
-- the runtime deployment, and historical schedules and plans remain intact.

commit;
`;

const output = resolve(root, `supabase/migrations/${migrationVersions[worldSlug]}_${worldSlug.replaceAll('-', '_')}_routine_variation.sql`);
await writeFile(output, sql);
outputs.push(output);
}
console.log(JSON.stringify({ residents: cast.length,
  distinctHobbyPairs: new Set(cast.map(x => x.hobbies.join('|'))).size,
  residentsWithoutMappedHobby,
  worlds, outputs }, null, 2));
