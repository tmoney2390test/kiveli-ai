begin;

-- The adult cast already has seven-day coverage. Vary home activities without
-- inventing new commitments, and alternate each public leisure outing with a
-- week at home. Work shifts, sleep, venue hours, and personal plans stay put.
create temporary table routine_cast on commit drop as
select world, slug, hobbies
from jsonb_to_recordset('[{"world":"vharadren","slug":"brannock-forge","hobbies":["Playing a game","Reading over a cup of tea"]},{"world":"vharadren","slug":"brigid-forge","hobbies":["Doing a short stretch at home","Putting on music"]},{"world":"vharadren","slug":"captain-vex-salt","hobbies":["Putting on music","Reading for pleasure"]},{"world":"vharadren","slug":"cinder-marrow","hobbies":["Reading over a cup of tea","Putting on music"]},{"world":"vharadren","slug":"inquisitor-pellan","hobbies":["Reading for pleasure","Putting on music"]},{"world":"vharadren","slug":"ione-glass","hobbies":["Playing a game","Putting on music"]},{"world":"vharadren","slug":"kaelen-thorn","hobbies":["Reading for pleasure","Putting on music"]},{"world":"vharadren","slug":"lysandra-veyl","hobbies":["Putting on music","Mending an outfit"]},{"world":"vharadren","slug":"maera-thorn","hobbies":["Reading for pleasure","Putting on music"]},{"world":"vharadren","slug":"nima-hartwood","hobbies":["Tending a few plants","Putting on music"]},{"world":"vharadren","slug":"oath-sister-calyx","hobbies":["Putting on music","Mending an outfit"]},{"world":"vharadren","slug":"priestess-ashara-flame","hobbies":["Reading for pleasure","Putting on music"]},{"world":"vharadren","slug":"pyra-ashscale","hobbies":["Putting on music","Reading for pleasure"]},{"world":"vharadren","slug":"riven-crow","hobbies":["Playing a game","Putting on music"]},{"world":"vharadren","slug":"ser-jareth-iron","hobbies":["Reading for pleasure","Trying a new recipe"]},{"world":"vharadren","slug":"vaelora-silk","hobbies":["Mending an outfit","Putting on music"]},{"world":"vharadren","slug":"velin-silk","hobbies":["Putting on music","Doing a short stretch at home"]},{"world":"vharadren","slug":"warden-tide","hobbies":["Doing a short stretch at home","Reading over a cup of tea"]},{"world":"vharadren","slug":"whisper-saan","hobbies":["Putting on music","Reading for pleasure"]},{"world":"vharadren","slug":"ysolde-lantern","hobbies":["Putting on music","Mending an outfit"]}]'::jsonb)
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
    raise exception 'Routine polish expected 20 vharadren residents, found %', matched;
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
