begin;

-- Shared authored weekly schedules for every published Juniper resident.
-- Brooke keeps her hand-tuned reference week; the remaining characters are
-- materialized from their authored occupation blocks and activity banks.

-- The eight earlier residents predate Juniper's private residential bases.
-- Reuse the existing hidden residences for canonical presence while keeping
-- the user-facing schedule label simply "Home".
with legacy_residents as (
  select version.id as version_id,template.slug,
    (array[
      '11000000-0000-4000-8000-000000000037'::uuid,
      '11000000-0000-4000-8000-000000000038'::uuid,
      '11000000-0000-4000-8000-000000000039'::uuid
    ])[1+mod(abs(hashtext(template.slug)::bigint),3)::int] as home_id
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
    and presence.world_id='10000000-0000-4000-8000-000000000001'::uuid
  where template.published and template.lifecycle_status='published'
    and coalesce((version.life_config->>'version')::int,1)=1
    and template.slug in('maya','chloe','alex','sofia','avery','riley','elena','harper')
)
update public.together_character_world_presence presence
set home_location_id=legacy.home_id,
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object('scheduleProfile','juniper_authored_v1'),
  updated_at=now()
from legacy_residents legacy
where presence.character_version_id=legacy.version_id
  and presence.world_id='10000000-0000-4000-8000-000000000001'::uuid;

with legacy_residents as (
  select version.id as version_id,template.slug,
    (array[
      '11000000-0000-4000-8000-000000000037'::uuid,
      '11000000-0000-4000-8000-000000000038'::uuid,
      '11000000-0000-4000-8000-000000000039'::uuid
    ])[1+mod(abs(hashtext(template.slug)::bigint),3)::int] as home_id
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('maya','chloe','alex','sofia','avery','riley','elena','harper')
    and version.version=template.current_published_version
)
update public.together_character_versions version
set life_config=jsonb_set(coalesce(version.life_config,'{}'::jsonb),'{homeLocationId}',to_jsonb(legacy.home_id::text),true),
  updated_at=now()
from legacy_residents legacy
where version.id=legacy.version_id;

create temporary table kivelle_juniper_schedule_characters on commit drop as
select distinct
  version.id as version_id,
  template.id as template_id,
  template.slug,
  template.name,
  template.occupation,
  version.life_config
from public.together_character_world_presence presence
join public.together_character_versions version on version.id=presence.character_version_id
join public.together_character_templates template on template.id=version.character_template_id
where presence.world_id='10000000-0000-4000-8000-000000000001'::uuid
  and presence.presence_type<>'unavailable'
  and version.version=template.current_published_version
  and template.published
  and template.lifecycle_status='published'
  and template.slug<>'brooke-sullivan';

create temporary table kivelle_juniper_legacy_work(
  slug text primary key,
  location_slug text,
  work_variants text[] not null
) on commit drop;

insert into kivelle_juniper_legacy_work values
  ('maya','photography-studio',array['Shooting a client project','Editing a photo set','Planning a studio session']),
  ('chloe','chloe-design-studio',array['Working through a design sprint','Reviewing material and layout ideas','Building a client presentation']),
  ('alex','photography-studio',array['Producing a creative project','Reviewing a production plan','Working through an edit']),
  ('sofia','paper-trail',array['Editing a manuscript','Reviewing author notes','Working through a book deadline']),
  ('avery','static-house',array['Producing a live event','Solving a last-minute venue problem','Coordinating an event crew']),
  ('riley',null,array['Writing a game scene at home','Revising dialogue at home','Working through a story branch at home']),
  ('elena','forgeworks-design-lab',array['Reviewing an architectural plan','Working through a site proposal','Refining a design presentation']),
  ('harper','halcyon-park',array['Checking the park trails','Finishing a ranger patrol','Inspecting a trail route']);

create temporary table kivelle_juniper_schedule_occupation_blocks on commit drop as
with v2_blocks as (
  select character.version_id,character.slug,
    array(select value::int from jsonb_array_elements_text(block.value->'workDays')) as work_days,
    (block.value->'startRange'->>'startMinute')::int as start_min,
    (block.value->'startRange'->>'endMinute')::int as start_max,
    (block.value->'durationMinutes'->>0)::int as duration_min,
    (block.value->'durationMinutes'->>1)::int as duration_max,
    nullif(block.value->>'primaryLocationSlug','') as location_slug,
    coalesce((
      select jsonb_agg(upper(left(variant.value,1))||substr(variant.value,2))
      from jsonb_array_elements_text(block.value->'activityVariants') variant
    ),jsonb_build_array('Working as '||character.occupation)) as work_variants,
    coalesce(block.value->>'key','primary') as block_key
  from kivelle_juniper_schedule_characters character
  cross join lateral jsonb_array_elements(coalesce(character.life_config->'occupation'->'scheduleBlocks','[]'::jsonb)) block
), legacy_blocks as (
  select character.version_id,character.slug,
    array(select value::int from jsonb_array_elements_text(character.life_config->'occupation'->'workDays')) as work_days,
    (character.life_config->'occupation'->'startRange'->>'startMinute')::int as start_min,
    (character.life_config->'occupation'->'startRange'->>'endMinute')::int as start_max,
    (character.life_config->'occupation'->'durationMinutes'->>0)::int as duration_min,
    (character.life_config->'occupation'->'durationMinutes'->>1)::int as duration_max,
    coalesce(nullif(character.life_config->'occupation'->>'primaryLocationSlug',''),legacy.location_slug) as location_slug,
    to_jsonb(legacy.work_variants) as work_variants,
    'primary'::text as block_key
  from kivelle_juniper_schedule_characters character
  join kivelle_juniper_legacy_work legacy on legacy.slug=character.slug
  where jsonb_array_length(coalesce(character.life_config->'occupation'->'scheduleBlocks','[]'::jsonb))=0
)
select * from v2_blocks
union all
select * from legacy_blocks;

create temporary table kivelle_juniper_activity_location_map(
  slug text,
  activity_key text,
  location_slug text,
  primary key(slug,activity_key)
) on commit drop;

insert into kivelle_juniper_activity_location_map values
  ('maya','photo_walk','riverwalk'),('maya','coffee','juniper-cafe'),('maya','gallery','glassline-gallery'),
  ('maya','gym','meridian-fitness'),('maya','drinks_with_chloe','velvet-hour'),('maya','home_creative',null),
  ('chloe','rooftop_social','skyline-rooftop'),('chloe','design_hunt','common-market'),
  ('alex','photo_walk','riverwalk'),('alex','trivia','northside-bar'),
  ('sofia','bookstore','paper-trail'),('sofia','jazz_evening','velvet-hour'),
  ('avery','live_event','static-house'),
  ('riley','arcade','pixel-and-pint'),('riley','home_gaming',null),
  ('elena','gallery','glassline-gallery'),('elena','gym','meridian-fitness'),
  ('harper','park_patrol','halcyon-park'),('harper','reading_home',null);

create temporary table kivelle_juniper_schedule_activities on commit drop as
select
  character.version_id,
  character.slug,
  activity.activity_key,
  coalesce(nullif(activity.metadata->>'activityLabel',''),activity.title) as title,
  activity.category,
  coalesce((activity.valid_time_windows->0->>'startMinute')::int,600) as valid_start,
  coalesce((activity.valid_time_windows->0->>'endMinute')::int,1260) as valid_end,
  greatest(60,least(120,((lower(activity.duration_minutes)+upper(activity.duration_minutes)-1)/2)::int)) as duration_minutes,
  case
    when activity.category='home' then null
    when coalesce(array_length(activity.location_slugs,1),0)>0 then activity.location_slugs[1]
    when mapped.location_slug is not null then mapped.location_slug
    when activity.activity_key='walk' then 'riverwalk'
    when activity.activity_key='dinner' then 'sora-table'
    when activity.activity_key='groceries' then 'common-market'
    when activity.category in('outdoors','park') then 'riverwalk'
    when activity.category='fitness' then 'meridian-fitness'
    when activity.category='culture' then 'glassline-gallery'
    when activity.category in('social','nightlife') then 'static-house'
    when activity.category='entertainment' then 'pixel-and-pint'
    when activity.category='cafe' then 'juniper-cafe'
    when activity.category='food' then 'sora-table'
    when activity.category in('shopping','errand') then 'common-market'
    else 'riverwalk'
  end as location_slug,
  activity.category='home' or mapped.activity_key is not null and mapped.location_slug is null as display_home,
  activity.priority,
  activity.activity_key not in('walk','dinner','groceries','home_evening','home_cooking','quiet_home','city_errand','city_walk') as is_custom
from kivelle_juniper_schedule_characters character
join public.together_character_activity_templates activity on activity.character_version_id=character.version_id
left join kivelle_juniper_activity_location_map mapped
  on mapped.slug=character.slug and mapped.activity_key=activity.activity_key;

create temporary table kivelle_juniper_schedule_days on commit drop as
with day_grid as (
  select character.*,day_number as day_of_week
  from kivelle_juniper_schedule_characters character
  cross join generate_series(0,6) day_number
), base as (
  select day_grid.*,
    occupation.start_min,occupation.start_max,occupation.duration_min,occupation.duration_max,
    occupation.location_slug as work_location_slug,occupation.work_variants,occupation.block_key,
    floor((occupation.start_min+occupation.start_max)/2.0)::int as anchor_start,
    floor((occupation.duration_min+occupation.duration_max)/2.0)::int as anchor_duration,
    daytime.activity_key as daytime_key,daytime.title as daytime_title,daytime.location_slug as daytime_location_slug,
    daytime.display_home as daytime_home,daytime.duration_minutes as daytime_duration,
    evening.activity_key as evening_key,evening.title as evening_title,evening.location_slug as evening_location_slug,
    evening.display_home as evening_home,evening.duration_minutes as evening_duration
  from day_grid
  left join lateral (
    select block.*
    from kivelle_juniper_schedule_occupation_blocks block
    where block.version_id=day_grid.version_id and day_grid.day_of_week=any(block.work_days)
    order by block.block_key
    limit 1
  ) occupation on true
  left join lateral (
    select activity.*
    from kivelle_juniper_schedule_activities activity
    where activity.version_id=day_grid.version_id and activity.valid_start<1020
    order by activity.is_custom desc,md5(day_grid.slug||':'||day_grid.day_of_week||':day:'||activity.activity_key)
    limit 1
  ) daytime on true
  left join lateral (
    select activity.*
    from kivelle_juniper_schedule_activities activity
    where activity.version_id=day_grid.version_id
      and activity.valid_end>960
      and activity.activity_key<>coalesce(daytime.activity_key,'')
    order by activity.is_custom desc,md5(day_grid.slug||':'||day_grid.day_of_week||':evening:'||activity.activity_key)
    limit 1
  ) evening on true
), calculated as (
  select base.*,
    least(1440,anchor_start+anchor_duration) as anchor_end
  from base
)
select calculated.*,
  case
    when anchor_start is null then 'open_day'
    when anchor_start>840 then 'late_shift'
    when anchor_duration>540 or anchor_end>1110 then 'long_shift'
    else 'work_day'
  end as day_shape
from calculated;

delete from public.together_schedule_templates schedule
using kivelle_juniper_schedule_characters character
where schedule.character_version_id=character.version_id;

with schedule_rows as (
  -- Open day: two character activities with a home reset between them.
  select version_id,slug,day_of_week,1 as slot,540 as start_minute,630 as end_minute,null::text as location_slug,
    'home_morning'::text as activity_key,'Starting the day at home'::text as activity,'available'::text as availability,
    1 as energy_delta,'easy'::text as mood_influence,'recurring_routine'::text as priority,day_shape,'Home'::text as display_location,
    jsonb_build_array('Starting the day slowly at home','Checking the day ahead at home','Making an easy start at home') as activity_variants
  from kivelle_juniper_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,2,660,780,daytime_location_slug,coalesce(daytime_key,'city_walk'),coalesce(daytime_title,'Taking a walk through Juniper'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,jsonb_build_array(coalesce(daytime_title,'Taking a walk through Juniper'))
  from kivelle_juniper_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,3,810,930,null,'home_reset','Taking an afternoon reset at home','available',0,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Taking an afternoon reset at home','Catching up on a few things at home','Recharging at home between plans')
  from kivelle_juniper_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,4,1020,1170,evening_location_slug,coalesce(evening_key,daytime_key,'home_evening'),coalesce(evening_title,daytime_title,'Having a quiet evening at home'),'available',1,'engaged','preferred_activity',day_shape,
    case when coalesce(evening_home,daytime_home,true) then 'Home' end,jsonb_build_array(coalesce(evening_title,daytime_title,'Having a quiet evening at home'))
  from kivelle_juniper_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,5,1230,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine',day_shape,'Home',
    jsonb_build_array('Winding down at home','Taking a quiet end to the day at home','Catching up at home before bed')
  from kivelle_juniper_schedule_days where day_shape='open_day'

  union all
  -- A standard work or class day leaves room for one evening interest.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready at home','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready at home','Checking the day ahead at home','Starting the day with a plan')
  from kivelle_juniper_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,2,anchor_start,anchor_end,work_location_slug,'occupation_'||coalesce(block_key,'primary'),occupation,'busy',-2,'focused','hard_obligation',day_shape,
    case when work_location_slug is null then 'Home' end,work_variants
  from kivelle_juniper_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,3,anchor_end+30,least(anchor_end+120,1200),null,'post_work_reset','Resetting at home after work','available',-1,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Resetting at home after work','Taking a break at home','Recharging at home before the evening')
  from kivelle_juniper_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,4,least(1230,greatest(anchor_end+150,1020)),least(1320,least(1230,greatest(anchor_end+150,1020))+90),evening_location_slug,
    coalesce(evening_key,daytime_key,'home_evening'),coalesce(evening_title,daytime_title,'Having a quiet evening at home'),'available',1,'engaged','preferred_activity',day_shape,
    case when coalesce(evening_home,daytime_home,true) then 'Home' end,jsonb_build_array(coalesce(evening_title,daytime_title,'Having a quiet evening at home'))
  from kivelle_juniper_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,5,1350,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine',day_shape,'Home',
    jsonb_build_array('Winding down at home','Taking a quiet end to the day at home','Getting ready for tomorrow at home')
  from kivelle_juniper_schedule_days where day_shape='work_day'

  union all
  -- Long obligations are split around a visible break; very long and
  -- overnight shifts remain at their canonical workplace through midnight.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready for a long shift','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready for a long shift','Starting early at home','Packing for a full workday')
  from kivelle_juniper_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,2,anchor_start,least(anchor_start+240,anchor_end-90),work_location_slug,'occupation_'||coalesce(block_key,'primary'),occupation,'busy',-2,'focused','hard_obligation',day_shape,
    case when work_location_slug is null then 'Home' end,work_variants
  from kivelle_juniper_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,3,least(anchor_start+240,anchor_end-90),least(anchor_start+240,anchor_end-90)+45,work_location_slug,'work_break','Taking a break during the shift','limited',0,'steady','recurring_routine',day_shape,
    case when work_location_slug is null then 'Home' end,jsonb_build_array('Taking a break during the shift','Catching a quick break at work')
  from kivelle_juniper_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,4,least(anchor_start+240,anchor_end-90)+45,
    case when anchor_end>=1380 then anchor_end-90 else anchor_end end,work_location_slug,'occupation_'||coalesce(block_key,'primary'),occupation,'busy',-2,'focused','hard_obligation',day_shape,
    case when work_location_slug is null then 'Home' end,work_variants
  from kivelle_juniper_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,5,
    case when anchor_end>=1380 then anchor_end-90 else anchor_end+30 end,
    case when anchor_end>=1380 then anchor_end else least(anchor_end+150,1410) end,
    case when anchor_end>=1380 then work_location_slug end,
    case when anchor_end>=1380 then 'occupation_'||coalesce(block_key,'primary') else 'post_shift_home' end,
    case when anchor_end>=1380 then 'Finishing the shift' else 'Recovering at home after the shift' end,
    case when anchor_end>=1380 then 'busy' else 'available' end,
    -1,case when anchor_end>=1380 then 'focused' else 'tired' end,
    case when anchor_end>=1380 then 'hard_obligation' else 'recurring_routine' end,day_shape,
    case when anchor_end<1380 or work_location_slug is null then 'Home' end,
    case when anchor_end>=1380 then work_variants else jsonb_build_array('Recovering at home after the shift','Taking a quiet post-shift reset at home') end
  from kivelle_juniper_schedule_days where day_shape='long_shift'

  union all
  -- Late venue, restaurant, and overnight work keeps the daytime open and
  -- splits the work block around a short off-clock gap.
  select version_id,slug,day_of_week,1,540,630,null,'home_morning','Starting the day at home','available',1,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Starting the day slowly at home','Taking an easy morning at home','Checking the day ahead at home')
  from kivelle_juniper_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,2,660,780,daytime_location_slug,coalesce(daytime_key,'city_walk'),coalesce(daytime_title,'Taking a walk through Juniper'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,jsonb_build_array(coalesce(daytime_title,'Taking a walk through Juniper'))
  from kivelle_juniper_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,3,greatest(810,anchor_start-120),anchor_start-30,null,'pre_shift_home','Getting ready at home before the shift','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready at home before the shift','Taking a quiet reset before work','Checking the night’s plan at home')
  from kivelle_juniper_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,4,anchor_start,least(anchor_start+240,anchor_end-90),work_location_slug,'occupation_'||coalesce(block_key,'primary'),occupation,'busy',-2,'focused','hard_obligation',day_shape,
    case when work_location_slug is null then 'Home' end,work_variants
  from kivelle_juniper_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,5,least(anchor_start+240,anchor_end-90)+30,anchor_end,work_location_slug,'occupation_'||coalesce(block_key,'primary'),occupation,'busy',-2,'focused','hard_obligation',day_shape,
    case when work_location_slug is null then 'Home' end,work_variants
  from kivelle_juniper_schedule_days where day_shape='late_shift'
), valid_rows as (
  select * from schedule_rows
  where start_minute>=0 and end_minute<=1440 and end_minute>start_minute
), located_rows as (
  select row_data.*,location.id as location_id
  from valid_rows row_data
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000001'::uuid
   and location.slug=row_data.location_slug
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select
  version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,1,
  jsonb_strip_nulls(jsonb_build_object(
    'source','juniper_authored_schedule_v1',
    'scheduleMode','authored',
    'profileVisibility','visible',
    'displayLocation',display_location,
    'activityKey',activity_key,
    'activityVariants',activity_variants,
    'priority',priority,
    'dayShape',day_shape,
    'slot',slot
  ))
from located_rows
on conflict(character_version_id,day_of_week,start_minute) do update set
  end_minute=excluded.end_minute,
  location_id=excluded.location_id,
  activity=excluded.activity,
  availability=excluded.availability,
  energy_delta=excluded.energy_delta,
  mood_influence=excluded.mood_influence,
  variation_weight=excluded.variation_weight,
  metadata=excluded.metadata;

-- Replace stale randomized materialization for the entire authored roster.
-- Explicit plans, relationship events, and conversation overrides remain.
delete from public.together_character_schedule_events event
using public.together_character_instances instance,
  public.together_character_versions version,
  public.together_character_templates template
where event.character_instance_id=instance.id
  and instance.character_version_id=version.id
  and version.character_template_id=template.id
  and template.slug in(
    select slug from kivelle_juniper_schedule_characters
    union all select 'brooke-sullivan'
  )
  and event.source in('generated','recurring')
  and event.starts_at>=date_trunc('day',now());

-- Fail the migration instead of silently shipping an incomplete character.
do $$
declare incomplete_count int;
begin
  select count(*) into incomplete_count
  from (
    select character.version_id,day_number
    from kivelle_juniper_schedule_characters character
    cross join generate_series(0,6) day_number
    left join public.together_schedule_templates schedule
      on schedule.character_version_id=character.version_id
     and schedule.day_of_week=day_number
     and schedule.metadata->>'scheduleMode'='authored'
    group by character.version_id,day_number
    having count(schedule.id)<>5
  ) incomplete;
  if incomplete_count>0 then
    raise exception 'Juniper authored schedule generation left % character-days without five blocks',incomplete_count;
  end if;
end $$;

commit;
