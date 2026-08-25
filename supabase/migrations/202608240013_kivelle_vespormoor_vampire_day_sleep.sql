begin;

-- Vespormoor's vampire-equivalent residents are represented canonically as
-- long-lived Veiled. Their original roster correctly made Mirelle and Dahlia
-- nocturnal, but four other long-lived residents inherited ordinary daytime
-- sleep/work hours. Keep the subtle Veiled canon while giving every member of
-- this cohort one coherent, authored nocturnal rhythm.
create temporary table vespormoor_nocturnal_profiles(
  slug text primary key,
  bedtime smallint not null,
  wake_minute smallint not null,
  ready_minute smallint not null,
  personal_end_minute smallint not null,
  work_end_minute smallint not null,
  work_days smallint[] not null,
  late_night_slug text not null,
  personal_slug text not null,
  work_slug text not null,
  weekday_evening_slug text not null,
  friday_slug text not null,
  saturday_slug text not null,
  sunday_slug text not null,
  late_night_activity text not null,
  wake_activity text not null,
  personal_activity text not null,
  work_activity text not null,
  weekday_evening_activity text not null,
  friday_activity text not null,
  saturday_activity text not null,
  sunday_activity text not null,
  community_day smallint not null,
  community_activity text not null,
  check(0<bedtime and bedtime<wake_minute and wake_minute<ready_minute
    and ready_minute<personal_end_minute and personal_end_minute<work_end_minute
    and work_end_minute<1440)
) on commit drop;

insert into vespormoor_nocturnal_profiles values
(
  'mirelle-voss',300,780,930,1050,1260,'{2,3,4,5,6}',
  'velvet-thorn','the-conservatory','velvet-thorn','velvet-thorn','crimson-room','velvet-thorn','the-conservatory',
  'Closing Velvet Thorn only after its last private conversation has properly ended',
  'Waking slowly at home, reading correspondence, and letting dusk approach without interruption',
  'Taking an unhurried late lunch at The Conservatory before the night asks anything of her',
  'Reviewing Velvet Thorn''s room, cellar, and guest list before opening',
  'Hosting Velvet Thorn with measured attention once the room settles',
  'Moving from Velvet Thorn to a discreet late table at the Crimson Room',
  'Hosting Saturday at Velvet Thorn from first pour through the final confidence',
  'Keeping Sunday private until a late Conservatory supper with the old-family circle',
  3,'Taking the old-family table before Velvet Thorn opens'
),
(
  'seraphine-orison',300,780,930,1080,1260,'{1,2,3,4,5}',
  'whisper-dock','vesper-square','saint-orison-chapel','saint-orison-chapel','whisper-dock','vesper-heights-overlook','saint-orison-chapel',
  'Walking Whisper Dock after the town quiets enough for the lake and chapel bells to separate',
  'Waking at home in the early afternoon with tea, music, and the curtains still drawn',
  'Walking Vesper Square near dusk before opening the chapel for its later visitors',
  'Restoring Saint Orison Chapel and tending visitors who come after ordinary working hours',
  'Playing sacred music in the empty chapel before a quiet night walk',
  'Watching the lake from Whisper Dock after the final chapel light is checked',
  'Taking a restoration notebook to the Overlook once the roads become quiet',
  'Keeping a restrained Sunday evening music hour at Saint Orison Chapel',
  0,'Keeping the chapel open for its quiet Sunday music hour'
),
(
  'vivienne-blackwood',330,810,960,1080,1260,'{1,2,3,4,5}',
  'crimson-room','hawthorne-riding-club','blackwood-estate','the-conservatory','crimson-room','blackwood-estate','vesper-heights-overlook',
  'Leaving the Crimson Room late enough that old-family business has stopped pretending to be social',
  'Waking at Blackwood Estate in the early afternoon and handling only the correspondence that cannot wait',
  'Riding at Hawthorne after the public lessons thin out and before the Heights dinner hour',
  'Managing the Blackwood foundation and the estate''s quieter obligations after dusk',
  'Holding a late Conservatory table where estate business can become an actual conversation',
  'Letting Friday loosen at the Crimson Room without surrendering her judgment',
  'Hosting a late Blackwood Estate dinner after the household has settled',
  'Walking the Overlook at dusk before a private family supper',
  3,'Taking the old-family Conservatory table after dusk'
),
(
  'julian-ashcroft',360,840,960,1080,1260,'{1,2,3,4,5}',
  'saint-mercy-hotel','vesper-house','blackwood-estate','crimson-room','crimson-room','velvet-thorn','the-conservatory',
  'Closing a confidential file at Saint Mercy after the people named in it have gone home',
  'Waking in the early afternoon and reviewing exactly one urgent Covenant message at home',
  'Checking a legal boundary near Vesper House while the grounds are quiet',
  'Handling estate law and Covenant business between old-family properties after dusk',
  'Moving from old-family business to a carefully social Crimson Room table',
  'Finishing Friday''s legal work over a controlled Crimson Room drink',
  'Taking a late Velvet Thorn table where nobody mistakes discretion for innocence',
  'Keeping Sunday technically free over a slow Conservatory dinner',
  3,'Turning the Heights dinner into an unofficial legal briefing only when asked'
),
(
  'selene-morcant',300,780,930,1050,1260,'{1,2,3,4,5,6}',
  'moonwake-baths','stillwater-house','moonwake-baths','stillwater-house','crimson-room','moonwake-baths','whisper-dock',
  'Closing Moonwake Baths after its final private appointment and checking the oldest pool herself',
  'Waking at home in the early afternoon and taking an unhurried private bathing hour',
  'Taking a quiet late lunch at Stillwater House before Moonwake opens for evening appointments',
  'Directing Moonwake Baths and its discreet late-afternoon and evening appointments',
  'Closing the baths with exacting calm before dining at Stillwater House',
  'Taking a late Crimson Room drink after Moonwake''s Friday appointments',
  'Hosting Moonwake''s longest private evening before the town goes quiet',
  'Walking Whisper Dock after dusk with no appointment waiting behind her',
  6,'Taking her regular discreet table during Stillwater Sessions'
),
(
  'dahlia-kane',360,840,960,1080,1260,'{0,3,4,5,6}',
  'nocturne','afterdark-diner','nocturne','nocturne','nocturne','nocturne','afterdark-diner',
  'Owning Nocturne through its last clean transition before the house lights rise',
  'Sleeping through the bright hours, then waking at home with the phone still on silent',
  'Taking a late breakfast at Afterdark Diner while collecting sounds and fragments for the next set',
  'Building the night''s set and sound-checking Nocturne before the doors open',
  'Controlling Nocturne''s room without confusing attention for intimacy',
  'Headlining Friday from sound-check through the final transition',
  'Giving Saturday''s crowd the full set and leaving only after the room is safely empty',
  'Taking the Raven Ward booth after close before a looser Sunday-night set',
  0,'Taking the Afterdark booth where Raven Ward workers decompress after close'
);

do $$
declare
  authored_count integer;
  canonical_count integer;
begin
  select count(*) into authored_count from vespormoor_nocturnal_profiles;
  select count(*) into canonical_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  where template.slug in(select slug from vespormoor_nocturnal_profiles)
    and version.character_bible->>'classification'='long_lived_veiled';

  if authored_count<>6 or canonical_count<>6 then
    raise exception 'Vespormoor nocturnal roster validation failed: authored %, canonical long-lived %',
      authored_count,canonical_count;
  end if;

  if exists(
    select 1
    from public.together_character_templates template
    join public.together_character_versions version
      on version.character_template_id=template.id
     and version.version=template.current_published_version
    where template.discovery_metadata->>'residentWorldSlug'='vespormoor'
      and version.character_bible->>'classification'='long_lived_veiled'
      and not exists(select 1 from vespormoor_nocturnal_profiles profile where profile.slug=template.slug)
  ) then
    raise exception 'A long-lived Vespormoor companion is missing a nocturnal profile';
  end if;
end $$;

-- The generative LifeProfile and the authored schedule now agree. This also
-- gives future scheduling revisions a stable circadian contract.
update public.together_character_versions version
set
  life_config=coalesce(version.life_config,'{}'::jsonb)||jsonb_build_object(
    'circadianProfile','vampire_day_sleep',
    'sleep',jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',profile.bedtime,'endMinute',profile.bedtime+30),
      'preferredWakeTime',jsonb_build_object('startMinute',profile.wake_minute,'endMinute',profile.wake_minute+45),
      'variabilityMinutes',30,
      'weekendShiftMinutes',45,
      'daySleep',true
    ),
    'occupation',coalesce(version.life_config->'occupation','{}'::jsonb)||jsonb_build_object('workPattern','night'),
    'scheduling',coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
      'circadianProfile','vampire_day_sleep',
      'nocturnal',true,
      'scheduleRevision','vespormoor_long_lived_day_sleep_v1'
    )
  ),
  character_bible=coalesce(version.character_bible,'{}'::jsonb)||jsonb_build_object(
    'dailyRhythm','Sleeps through the morning and early afternoon, wakes toward dusk, and lives an ordinary active schedule through the evening and night.'
  ),
  updated_at=now()
from public.together_character_templates template
join vespormoor_nocturnal_profiles profile on profile.slug=template.slug
where version.character_template_id=template.id
  and version.version=template.current_published_version;

create temporary table vespormoor_nocturnal_versions on commit drop as
select
  template.id template_id,
  version.id version_id,
  template.name,
  profile.*
from public.together_character_templates template
join public.together_character_versions version
  on version.character_template_id=template.id
 and version.version=template.current_published_version
join vespormoor_nocturnal_profiles profile on profile.slug=template.slug;

delete from public.together_schedule_templates schedule
using vespormoor_nocturnal_versions character
where schedule.character_version_id=character.version_id;

with day_grid as(
  select
    character.*,
    day_number::smallint day_of_week,
    day_number=any(character.work_days) is_workday,
    ((day_number+6)%7)=any(character.work_days) previous_day_was_workday,
    case
      when day_number=5 then character.friday_slug
      when day_number=6 then character.saturday_slug
      when day_number=0 then character.sunday_slug
      else character.weekday_evening_slug
    end evening_slug,
    case
      when day_number=5 then character.friday_activity
      when day_number=6 then character.saturday_activity
      when day_number=0 then character.sunday_activity
      else character.weekday_evening_activity
    end evening_activity,
    case
      when day_number=5 then 'Friday variation'
      when day_number=6 then 'Saturday variation'
      when day_number=0 then 'Sunday variation'
      else 'Weekday routine'
    end day_variant
  from vespormoor_nocturnal_versions character
  cross join generate_series(0,6) day_number
), timed as(
  select grid.*,segment.*
  from day_grid grid
  cross join lateral(values
    (1,0,grid.bedtime,'after_midnight'),
    (2,grid.bedtime,grid.wake_minute,'sleep'),
    (3,grid.wake_minute,grid.ready_minute,'home_morning'),
    (4,grid.ready_minute,grid.personal_end_minute,'personal'),
    (5,grid.personal_end_minute,grid.work_end_minute,'main'),
    (6,grid.work_end_minute,1440,'evening')
  ) segment(slot,start_minute,end_minute,routine_kind)
), routed as(
  select
    timed.*,
    case
      when routine_kind in('sleep','home_morning') then null
      when routine_kind='after_midnight' then late_night_slug
      when routine_kind='personal' then personal_slug
      when routine_kind='main' and is_workday then work_slug
      when routine_kind='main' then personal_slug
      else evening_slug
    end location_slug,
    case
      when routine_kind='sleep' then 'Sleeping at home through the daylight hours'
      when routine_kind='home_morning' then wake_activity
      when routine_kind='after_midnight' and previous_day_was_workday then late_night_activity
      when routine_kind='after_midnight' then 'Keeping a private nocturnal rhythm after the rest of town has gone quiet'
      when routine_kind='personal' then personal_activity
      when routine_kind='main' and is_workday then work_activity
      when routine_kind='main' then 'Using the day off for an unhurried personal routine before evening'
      else evening_activity
    end activity
  from timed
), located as(
  select routed.*,location.id location_id,location.name location_name
  from routed
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000010'::uuid
   and location.slug=routed.location_slug
), final_rows as(
  select
    located.*,
    case
      when routine_kind='sleep' then 'sleep'
      when routine_kind='home_morning' then 'home_reset'
      when routine_kind='after_midnight' and previous_day_was_workday then 'occupation_'||replace(slug,'-','_')
      when routine_kind='after_midnight' then 'private_night_'||replace(slug,'-','_')
      when routine_kind='personal' then 'personal_interest_'||replace(slug,'-','_')
      when routine_kind='main' and is_workday then 'occupation_'||replace(slug,'-','_')
      when routine_kind='main' then 'day_off_'||replace(slug,'-','_')
      when is_workday then 'occupation_'||replace(slug,'-','_')
      else 'social_routine_'||replace(slug,'-','_')
    end activity_key,
    case
      when routine_kind='sleep' then 'busy'
      when routine_kind='home_morning' then 'limited'
      when routine_kind='main' and is_workday then 'busy'
      when routine_kind='after_midnight' and previous_day_was_workday then 'busy'
      when routine_kind='evening' and is_workday then 'busy'
      else 'available'
    end availability,
    case
      when routine_kind='sleep' then 'sleep'
      when routine_kind in('main','after_midnight') and (is_workday or previous_day_was_workday) then 'focused'
      when routine_kind='evening' then 'engaged'
      else 'easy'
    end mood
  from located
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select
  version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  case when mood='sleep' then -2 when mood='focused' then -1 when mood='engaged' then 1 else 0 end,
  mood,1,
  jsonb_strip_nulls(jsonb_build_object(
    -- Keep the v2 source/profile contract so this is an in-place refinement of
    -- the established world schedule rather than a parallel schedule system.
    'source','vespormoor_authored_schedule_v2',
    'scheduleMode','authored',
    'scheduleProfile','vespormoor_rich_weekly_v2',
    'scheduleRevision','vespormoor_long_lived_day_sleep_v1',
    'vampireDaySleep',true,
    'circadianProfile','vampire_day_sleep',
    'profileVisibility','visible',
    'displayLocation',case when location_id is null then 'Home' else location_name end,
    'activityKey',activity_key,
    'activityVariants',jsonb_build_array(
      activity,
      case
        when routine_kind='sleep' then 'Sleeping deeply at home while daylight passes outside'
        when routine_kind='home_morning' then 'Taking the first private hour after waking at home near dusk'
        when routine_kind='after_midnight' then late_night_activity
        when routine_kind='personal' then personal_activity
        when routine_kind='main' and is_workday then work_activity
        when routine_kind='main' then 'Keeping the night ahead deliberately free of formal obligations'
        else evening_activity
      end,
      case
        when routine_kind='sleep' then 'At home asleep with the phone quiet until the afternoon'
        when routine_kind='home_morning' then wake_activity
        when routine_kind='after_midnight' then 'Letting the nocturnal part of the day resolve at '||coalesce(location_name,'home')
        when routine_kind='personal' then 'Making time for a familiar private interest at '||coalesce(location_name,'home')
        when routine_kind='main' and is_workday then 'Following through on the night''s work at '||coalesce(location_name,'home')
        when routine_kind='main' then personal_activity
        else 'Taking the '||lower(day_variant)||' at '||coalesce(location_name,'home')||' without forcing the pace'
      end
    ),
    'priority',case
      when routine_kind='sleep' then 'recurring_routine'
      when activity_key like 'occupation_%' then 'hard_obligation'
      else 'preferred_activity'
    end,
    'dayVariant',day_variant,
    'slot',slot,
    'worldSlug','vespormoor',
    'routineKind',routine_kind,
    'communityAnchor',case when day_of_week=community_day then community_activity else null end,
    'contextCue','This is an established independent routine, not proof of a shared scene or an invitation.',
    'authoredCoverage','full_day',
    'promptVersion',3
  ))
from final_rows;

update public.together_character_world_presence presence
set metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
  'circadianProfile','vampire_day_sleep',
  'daySleep',true,
  'scheduleRevision','vespormoor_long_lived_day_sleep_v1'
),updated_at=now()
from vespormoor_nocturnal_versions character
where presence.character_version_id=character.version_id
  and presence.world_id='10000000-0000-4000-8000-000000000010'::uuid;

-- Rebuild only routine materializations. Active/shared plans, overrides, Dates,
-- and historical events remain untouched.
delete from public.together_character_schedule_events event
using public.together_character_instances instance,
      vespormoor_nocturnal_versions character
where event.character_instance_id=instance.id
  and instance.character_version_id=character.version_id
  and event.source in('generated','recurring')
  and event.ends_at>now();

do $$
declare
  schedule_count integer;
  complete_day_count integer;
  overlap_count integer;
  missing_day_sleep_count integer;
  asleep_at_night_count integer;
  invalid_location_count integer;
begin
  select count(*) into schedule_count
  from public.together_schedule_templates
  where metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1';

  select count(*) into complete_day_count
  from(
    select character_version_id,day_of_week
    from public.together_schedule_templates
    where metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    group by character_version_id,day_of_week
    having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
  ) complete_days;

  select count(*) into overlap_count
  from public.together_schedule_templates left_schedule
  join public.together_schedule_templates right_schedule
    on right_schedule.character_version_id=left_schedule.character_version_id
   and right_schedule.day_of_week=left_schedule.day_of_week
   and right_schedule.id>left_schedule.id
   and right_schedule.start_minute<left_schedule.end_minute
   and left_schedule.start_minute<right_schedule.end_minute
  where left_schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and right_schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1';

  select count(*) into missing_day_sleep_count
  from vespormoor_nocturnal_versions character
  cross join generate_series(0,6) day_number
  cross join(values(480),(720)) check_time(minute_of_day)
  where not exists(
    select 1 from public.together_schedule_templates schedule
    where schedule.character_version_id=character.version_id
      and schedule.day_of_week=day_number
      and schedule.metadata->>'activityKey'='sleep'
      and schedule.start_minute<=check_time.minute_of_day
      and schedule.end_minute>check_time.minute_of_day
  );

  select count(*) into asleep_at_night_count
  from public.together_schedule_templates schedule
  where schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and schedule.metadata->>'activityKey'='sleep'
    and schedule.start_minute<=1200 and schedule.end_minute>1200;

  select count(*) into invalid_location_count
  from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'scheduleRevision'='vespormoor_long_lived_day_sleep_v1'
    and(
      (schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid)
      or(schedule.location_id is null and schedule.metadata->>'activityKey'<>'sleep' and schedule.metadata->>'routineKind'<>'home_morning')
    );

  if schedule_count<>252 or complete_day_count<>42 or overlap_count<>0
    or missing_day_sleep_count<>0 or asleep_at_night_count<>0 or invalid_location_count<>0 then
    raise exception 'Vespormoor day-sleep validation failed: schedules %, complete days %, overlaps %, missing 08:00/12:00 sleep %, asleep 20:00 %, invalid locations %',
      schedule_count,complete_day_count,overlap_count,missing_day_sleep_count,asleep_at_night_count,invalid_location_count;
  end if;
end $$;

commit;
