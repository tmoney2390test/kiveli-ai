begin;

do $check$
declare evening_blocks integer;
begin
  select count(*) into evening_blocks
  from together_schedule_templates schedule
  join together_character_versions version on version.id = schedule.character_version_id
  join together_character_templates person on person.id = version.character_template_id
  where (person.slug = 'hana-petrov' and schedule.activity = 'Personal time: swimming'
     or person.slug = 'liora-haddad' and schedule.activity = 'Personal time: picnics')
    and schedule.start_minute = 990 and schedule.end_minute = 1440
    and schedule.location_id is null;
  if evening_blocks <> 10 then
    raise exception 'Expected ten unedited Eos evening blocks, found %', evening_blocks;
  end if;
end $check$;

-- A single hobby had been made into a 7.5-hour, five-night routine. Keep the
-- ordinary after-work evenings at home, with one real outing for each person.
with edits(slug, old_activity, new_activity, variants) as (
  values
    ('hana-petrov', 'Personal time: swimming',
      'Making dinner and painting a miniature at home',
      '["Making dinner and painting a miniature at home","Washing her brushes and putting on music at home","Eating dinner and reading at home"]'::jsonb),
    ('liora-haddad', 'Personal time: picnics',
      'Making dinner and tending plants at home',
      '["Making dinner and tending plants at home","Sorting fruit for tomorrow at home","Cooking supper and putting on music at home"]'::jsonb)
)
update together_schedule_templates schedule
set activity = edits.new_activity,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', edits.variants,
                            'displayLocation', 'Home',
                            'scheduleEditorialVersion', 'routine_v3')
from together_character_versions version,
     together_character_templates person,
     edits
where schedule.character_version_id = version.id
  and version.character_template_id = person.id
  and person.slug = edits.slug
  and schedule.activity = edits.old_activity
  and schedule.start_minute = 990
  and schedule.end_minute = 1440
  and schedule.location_id is null;

-- Swimming and a picnic are believable as short outings, not an overnight
-- location. Both venues are open for these times. The remaining slot is home.
create temporary table eos_outing_targets on commit drop as
with outing(slug, day, location_slug, label) as (
  values
    ('hana-petrov', 3, 'foundry-baths', 'Swimming at Foundry Baths after work'),
    ('liora-haddad', 4, 'solace-reservoir', 'Having an early picnic by Solace Reservoir')
), target as (
  select schedule.id, schedule.character_version_id, schedule.day_of_week,
         schedule.availability, schedule.energy_delta, schedule.metadata,
         outing.location_slug, outing.label, place.id as location_id, place.name as location_name
  from outing
  join together_character_templates person on person.slug = outing.slug
  join together_character_versions version on version.character_template_id = person.id
    and version.version = person.current_published_version
  join together_schedule_templates schedule on schedule.character_version_id = version.id
    and schedule.day_of_week = outing.day and schedule.start_minute = 990
    and schedule.end_minute = 1440 and schedule.location_id is null
    and schedule.metadata->>'scheduleEditorialVersion' = 'routine_v3'
  join together_character_world_presence presence on presence.character_version_id = version.id
  join together_worlds world on world.id = presence.world_id and world.slug = 'eos-meridian'
  join together_locations place on place.world_id = world.id
    and place.slug = outing.location_slug and place.owner_user_id is null
  where (place.hours->>'open')::time <= time '16:30'
    and ((place.hours->>'close')::time >= time '18:00'
      or (place.hours->>'close')::time < (place.hours->>'open')::time)
)
select * from target;

do $check$
begin
  if (select count(*) from eos_outing_targets) <> 2 then
    raise exception 'Eos evening outings were not resolved to open venues';
  end if;
end $check$;

-- Free the unique weekday/start/week slot before inserting the outing.
update together_schedule_templates schedule
set start_minute = 1080
from eos_outing_targets target
where schedule.id = target.id;

insert into together_schedule_templates
  (character_version_id, day_of_week, start_minute, end_minute,
   location_id, activity, availability, energy_delta, metadata)
select character_version_id, day_of_week, 990, 1080, location_id, label,
       availability, energy_delta,
       metadata || jsonb_build_object('activityVariants', jsonb_build_array(label),
                                       'displayLocation', location_name)
from eos_outing_targets;

do $check$
declare outings integer;
begin
  select count(*) into outings
  from together_schedule_templates schedule
  join together_character_versions version on version.id = schedule.character_version_id
  join together_character_templates person on person.id = version.character_template_id
  where (person.slug = 'hana-petrov' and schedule.activity = 'Swimming at Foundry Baths after work'
     or person.slug = 'liora-haddad' and schedule.activity = 'Having an early picnic by Solace Reservoir')
    and schedule.start_minute = 990 and schedule.end_minute = 1080;
  if outings <> 2 then
    raise exception 'Eos evening outings were not resolved to open venues';
  end if;
end $check$;

-- A schedule cannot presume that Hana is physically present on Liora's day
-- off. The childhood-story beat belongs in a conversation, not a fixed slot.
update together_schedule_templates schedule
set activity = 'Reading at home and sorting old family photos',
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(
           'Reading at home and sorting old family photos',
           'Making a meal and tending plants at home'),
           'displayLocation', 'Home', 'scheduleEditorialVersion', 'routine_v3')
from together_character_versions version,
     together_character_templates person
where schedule.character_version_id = version.id
  and version.character_template_id = person.id
  and person.slug = 'liora-haddad'
  and schedule.activity = 'Tease Hana over a shared childhood story.';

-- Time at home is not one continuous action from late afternoon to midnight.
-- Keep the exact original coverage while allowing a different evening beat.
create temporary table eos_long_home on commit drop as
select schedule.*, person.slug as character_slug
from together_schedule_templates schedule
join together_character_versions version on version.id = schedule.character_version_id
join together_character_templates person on person.id = version.character_template_id
where person.slug in ('hana-petrov', 'liora-haddad')
  and schedule.metadata->>'scheduleEditorialVersion' = 'routine_v3'
  and schedule.location_id is null
  and schedule.end_minute - schedule.start_minute > 180;

update together_schedule_templates schedule
set end_minute = schedule.start_minute + 180
from eos_long_home old
where schedule.id = old.id;

insert into together_schedule_templates
  (character_version_id, day_of_week, start_minute, end_minute,
   location_id, activity, availability, energy_delta, metadata)
select old.character_version_id, old.day_of_week,
       old.start_minute + step.n * 180,
       least(old.end_minute, old.start_minute + (step.n + 1) * 180),
       null,
       case
         when old.start_minute + step.n * 180 >= 1260
           then 'Reading in bed before sleep'
         when old.character_slug = 'hana-petrov'
           then 'Painting a miniature at home'
         else 'Reading and tending plants at home'
       end,
       old.availability, old.energy_delta,
       old.metadata || jsonb_build_object(
         'activityVariants',
         case
           when old.start_minute + step.n * 180 >= 1260
             then jsonb_build_array('Reading in bed before sleep',
               'Washing up and getting ready for bed')
           when old.character_slug = 'hana-petrov'
             then jsonb_build_array('Painting a miniature at home',
               'Putting on music and cleaning her brushes')
           else jsonb_build_array('Reading and tending plants at home',
               'Sorting tomorrow’s orchard notes at home')
         end)
from eos_long_home old
cross join lateral generate_series(1, ceil((old.end_minute-old.start_minute) / 180.0)::integer - 1) as step(n);

commit;
