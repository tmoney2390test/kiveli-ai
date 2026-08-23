begin;

create temporary table port_vervelle_male_profiles(
  slug text primary key,rhythm text not null,work_slug text not null,work_days int[] not null,
  late_work_days int[] not null default '{}',night_days int[] not null default '{}',
  morning_slug text,morning_activity text not null,work_activity text not null,
  afternoon_slug text,afternoon_activity text not null,evening_slug text,evening_activity text not null,
  friday_slug text,friday_activity text not null,saturday_slug text,saturday_activity text not null,
  sunday_slug text,sunday_activity text not null
) on commit drop;

insert into port_vervelle_male_profiles values
('matteo-bellandi','early_marine','porto-marina',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'porto-marina','Checking the forecast, lines, and charter boat before the harbor wakes',
 'Teaching sailing or captaining a charter beyond the headland',
 'spiaggia-solana','Bringing the boat in, handling marina work, or taking a late beach break',
 'blue-lantern','Eating by the harbor after the boats are secure',
 'la-sirena','Joining friends at La Sirena only after the final charter is settled',
 'cala-bianca','Freediving at Cala Bianca or taking an impulsive road trip',
 'cala-bianca','Spending a genuine day off around the cove, Rafael, or Mia'),
('alessandro-moretti','restaurant','sotto-sale',array[0,2,3,4,5,6],array[2,3,4,5,6],array[]::int[],
 'vervelle-fish-market','Choosing the catch and arguing about produce at Vervelle Fish Market',
 'Running prep, lunch, and the open kitchen at Sotto Sale',
 'cafe-marelle','Taking one guarded break over coffee before dinner service',
 'blue-lantern','Having one drink after the kitchen is finally closed',
 'sotto-sale','Commanding a full Friday dinner service at Sotto Sale',
 'sotto-sale','Running the longest dinner service of the week',
 'la-pergola','Protecting a long Sunday meal for family and friends'),
('enzo-moretti','beach_day','spiaggia-solana',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'bellavista-fitness-club','Training before his lifeguard shift and turning it into a competition',
 'Working the Solana Beach lifeguard line between swims',
 'spiaggia-solana','Playing volleyball, checking the water, or studying between beach rounds',
 'lido-vervelle','Eating with the Solana beach crowd after shift',
 'la-sirena','Going out with the beach group after a Friday shift',
 'la-sirena','Joining friends at La Sirena after a full beach day',
 'spiaggia-solana','Taking a slower beach day, studying, and pretending not to plan his future'),
('gabriel-laurent','hotel_day','hotel-coralline',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'hotel-coralline','Reviewing arrivals and walking Hôtel Coralline before guests need him',
 'Managing Hôtel Coralline through arrivals, events, and quiet emergencies',
 'piazza-aurelia','Taking a precise espresso break while studying architecture and people',
 'luna-terrace','Dropping the hotel voice over a late dinner at Luna Terrace',
 'velours','Listening to jazz at Velours after the Friday arrivals settle',
 'hotel-coralline','Remaining visible for a major Saturday hotel event',
 'piazza-aurelia','Spending a rare day off with architecture, art, and no guest list'),
('luca-bianchi','medical','vervelle-general-clinic',array[1,2,3,5,6],array[2],array[]::int[],
 'belvedere-garden','Running the hillside route before checking whether work owns the day',
 'Covering emergency medicine at Vervelle General Clinic',
 'cafe-marelle','Recovering after shift over bad coffee or reading medical history',
 'porto-marina','Taking a short sail, cooking, or meeting a friend away from the clinic',
 'porto-marina','Keeping Friday evening deliberately unmedical when the rota allows',
 'vervelle-general-clinic','Covering a realistic rotating Saturday emergency shift',
 'belvedere-garden','Taking an actual day off for running, guitar, food, and quiet company'),
('idris-benali','night','la-sirena',array[1,2,3,4,5,6],array[]::int[],array[3,4,5,6],
 'studio-lucent','Waking late and collecting photographs or field recordings around Studio Lucent',
 'Producing, rehearsing, and coordinating performers for La Sirena',
 'la-sirena','Testing sound and rebuilding the live set before doors',
 'spiaggia-solana','Taking a late swim or trading music with friends offstage',
 'la-sirena','Running Friday night at La Sirena alongside Eva and the live team',
 'la-sirena','Staying behind the music through the full Saturday night',
 'spiaggia-solana','Sleeping late, seeing Lea, and taking an unplanned sunset swim'),
('marco-de-santis','professional_day','vervelle-design-works',array[1,2,3,4,5],array[]::int[],array[]::int[],
 'piazza-aurelia','Inspecting old stone and sketching before the office day begins',
 'Working between Vervelle Design Works, meetings, and restoration sites',
 'piazza-aurelia','Walking the proposed restoration area with a sketchbook',
 'osteria-rosa','Taking a measured dinner after site work',
 'luna-terrace','Meeting architects, clients, or friends over Friday drinks',
 'porto-marina','Sailing or inspecting old waterfront masonry without a formal meeting',
 'piazza-aurelia','Taking a slow old-town walk and trying not to turn it into work'),
('rafael-silva','early_marine','porto-marina',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'porto-marina','Checking dive conditions, research equipment, and student gear before launch',
 'Leading a dive or collecting marine-conservation data off the coast',
 'cala-bianca','Photographing marine life and clearing debris around Cala Bianca',
 'casa-del-mare','Cooking, eating, or decompressing with the ocean circle',
 'blue-lantern','Meeting the harbor crowd after the week''s last research dive',
 'spiaggia-solana','Running a social group dive or joining the beach crowd afterward',
 'cala-bianca','Taking an unhurried cove day with no class roster'),
('nico-valenti','creative_day','studio-ondine',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'studio-ondine','Opening the studio quietly and preparing clay before customers arrive',
 'Throwing, glazing, teaching, and handling small-batch commissions at Studio Ondine',
 'studio-ondine','Working alone on pieces he refuses to mass-produce',
 'osteria-rosa','Having a quiet dinner rather than chasing nightlife',
 'piccolo-cinema','Catching an old film or a late screening on Friday',
 'piazza-aurelia','Browsing the market for plants, tools, and objects to sketch',
 null,'Cooking, caring for plants, and making tiny ceramic animals at home'),
('lorenzo-bellaforte','estate_day','domaine-vervelle',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'domaine-vervelle','Walking the vines, stables, and cellar before the estate becomes social',
 'Managing Domaine Vervelle and the obligations attached to the Bellaforte name',
 'hotel-celeste','Playing tennis, riding, or holding a business lunch above the coast',
 'luna-terrace','Turning a small dinner into a larger invitation than planned',
 'la-sirena','Appearing at La Sirena after an upscale Friday dinner',
 'domaine-vervelle','Hosting a vineyard evening that blurs business and social life',
 'la-pergola','Sitting through a long family lunch while planning something of his own'),
('elias-romano','research_day','museo-marittimo-vervelle',array[1,2,3,4,5,6],array[]::int[],array[]::int[],
 'museo-marittimo-vervelle','Reviewing the archive before the museum opens',
 'Curating the museum collection and researching new maritime finds',
 'porto-marina','Comparing harbor masonry, charts, or dive notes in the field',
 'libreria-vervelle','Reading, writing, or quietly meeting someone after museum hours',
 'blue-lantern','Joining harbor conversation without turning it into a lecture',
 'cala-bianca','Conducting a bounded archaeological survey offshore',
 'piazza-aurelia','Following an old map through town with no formal work deadline'),
('theo-mancini','fitness_split','bellavista-fitness-club',array[1,2,3,4,5,6],array[1,2,3,4],array[]::int[],
 'bellavista-fitness-club','Coaching early clients and opening his boxing studio',
 'Running personal training, boxing sessions, and the business between classes',
 'spiaggia-solana','Training on the beach, handling errands, or walking his rescue dog',
 'lido-vervelle','Eating with the beach group after the last class',
 'la-sirena','Going out with Idris, Enzo, and the beach crowd after Friday classes',
 'la-sirena','Letting his old party reputation make a brief Saturday appearance',
 'spiaggia-solana','Taking his elderly dog for a slow beach walk and keeping Sunday relaxed');

do $$
declare missing_count int;
begin
  if (select count(*) from port_vervelle_male_profiles)<>12 then raise exception 'Expected 12 male schedule profiles'; end if;
  select count(*) into missing_count
  from port_vervelle_male_profiles profile
  cross join lateral unnest(array_remove(array[profile.work_slug,profile.morning_slug,profile.afternoon_slug,profile.evening_slug,profile.friday_slug,profile.saturday_slug,profile.sunday_slug],null)) as location_slug(slug)
  left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=location_slug.slug
  where location.id is null;
  if missing_count>0 then raise exception 'Male schedule profiles contain % unresolved places',missing_count; end if;
end $$;

update public.together_character_versions version set
  life_config=jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(version.life_config,'{}'::jsonb),'{version}','2'::jsonb,true),
      '{occupation}',
      jsonb_build_object(
        'title',template.occupation,'workPattern',profile.rhythm,'primaryLocationSlug',profile.work_slug,
        'flexibility',coalesce((version.personality_config->>'spontaneity')::numeric,.6),
        'scheduleBlocks',jsonb_build_array(jsonb_build_object(
          'key','primary','title',template.occupation,'activityKey','occupation_primary',
          'workDays',to_jsonb(profile.work_days),
          'startRange',jsonb_build_object('startMinute',case profile.rhythm when 'early_marine' then 450 when 'restaurant' then 660 when 'night' then 780 when 'fitness_split' then 330 else 540 end,'endMinute',case profile.rhythm when 'early_marine' then 510 when 'restaurant' then 720 when 'night' then 840 when 'fitness_split' then 390 else 600 end),
          'durationMinutes',case profile.rhythm when 'restaurant' then jsonb_build_array(240,660) when 'night' then jsonb_build_array(180,720) when 'fitness_split' then jsonb_build_array(180,600) else jsonb_build_array(300,570) end,
          'primaryLocationSlug',profile.work_slug,'activityVariants',jsonb_build_array(profile.work_activity),
          'visibility','known','interruptibility','busy','metadata',jsonb_build_object('scheduleProfile','port_vervelle_male_v1')
        )) || case when cardinality(profile.late_work_days)=0 and cardinality(profile.night_days)=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
          'key','late_rotation','title',template.occupation,'activityKey','occupation_late',
          'workDays',to_jsonb(case when cardinality(profile.night_days)>0 then profile.night_days else profile.late_work_days end),
          'startRange',jsonb_build_object('startMinute',case when profile.rhythm='night' then 1200 else 960 end,'endMinute',case when profile.rhythm='night' then 1260 else 1020 end),
          'durationMinutes',case when profile.rhythm='night' then jsonb_build_array(240,360) else jsonb_build_array(180,360) end,
          'primaryLocationSlug',profile.work_slug,'activityVariants',jsonb_build_array(profile.work_activity),
          'visibility','known','interruptibility','busy','metadata',jsonb_build_object('scheduleProfile','port_vervelle_male_v1')
        )) end
      ),true
    ),
    '{scheduling}',coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
      'repetitionTolerance',.2,'preferredDailyActivityCount',jsonb_build_array(3,5),
      'generationVersion','authored_weekly_v1','scheduleProfile','port_vervelle_male_v1'
    ),true
  ),
  updated_at=now()
from public.together_character_templates template,port_vervelle_male_profiles profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

update public.together_character_world_presence presence set
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object('scheduleProfile','port_vervelle_male_v1','dynamicSchedule',true),
  updated_at=now()
from public.together_character_versions version,public.together_character_templates template,port_vervelle_male_profiles profile
where presence.character_version_id=version.id and version.character_template_id=template.id
  and template.slug=profile.slug and presence.world_id='10000000-0000-4000-8000-000000000008';

-- Profile-specific optional activities let generated schedules vary without
-- replacing the canonical weekly projection below.
with expanded as(
  select profile.slug,activity.* from port_vervelle_male_profiles profile
  cross join lateral(values
    ('routine_morning',profile.morning_activity,profile.morning_slug,'personal',330,780),
    ('routine_afternoon',profile.afternoon_activity,profile.afternoon_slug,'personal',780,1080),
    ('routine_evening',profile.evening_activity,profile.evening_slug,'social',960,1320),
    ('routine_friday',profile.friday_activity,profile.friday_slug,'social',960,1440),
    ('routine_saturday',profile.saturday_activity,profile.saturday_slug,'social',480,1440),
    ('routine_sunday',profile.sunday_activity,profile.sunday_slug,'personal',480,1320),
    ('occupation_primary',profile.work_activity,profile.work_slug,'work',330,1440)
  ) activity(activity_key,title,location_slug,category,start_minute,end_minute)
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,expanded.activity_key,initcap(expanded.title),expanded.category,
  jsonb_build_array(jsonb_build_object('startMinute',expanded.start_minute,'endMinute',expanded.end_minute)),
  int4range(60,241,'[]'),array[expanded.category],case when expanded.location_slug is null then array[]::text[] else array[expanded.location_slug] end,
  array[expanded.category,'port-vervelle'],case when expanded.category='work' then .95 else .82 end,
  int4range(1,4,'[]'),case when expanded.category='work' then 7 else 3 end,18,null,'either',
  case when expanded.category='work' then 'hard_obligation' else 'preferred_activity' end,
  case when expanded.category='work' then 'known' else 'hint' end,
  case when expanded.category='work' then 'busy' else 'open' end,
  jsonb_build_object('source','port_vervelle_male_life_v1','activityLabel',expanded.title,'outcomeEligible',false)
from expanded
join public.together_character_templates template on template.slug=expanded.slug
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
on conflict(character_version_id,activity_key) do update set
  title=excluded.title,category=excluded.category,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,tags=excluded.tags,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,priority=excluded.priority,
  visibility=excluded.visibility,interruptibility=excluded.interruptibility,metadata=excluded.metadata,updated_at=now();

create temporary table port_vervelle_male_schedule_days on commit drop as
select profile.*,day_number day_of_week,
  day_number=any(profile.work_days) is_work_day,
  day_number=any(profile.late_work_days) is_late_work_day,
  day_number=any(profile.night_days) is_night_day,
  case day_number when 5 then profile.friday_slug when 6 then profile.saturday_slug when 0 then profile.sunday_slug else profile.evening_slug end social_slug,
  case day_number when 5 then profile.friday_activity when 6 then profile.saturday_activity when 0 then profile.sunday_activity else profile.evening_activity end social_activity,
  version.id version_id
from port_vervelle_male_profiles profile
cross join generate_series(0,6) day_number
join public.together_character_templates template on template.slug=profile.slug
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version;

delete from public.together_schedule_templates schedule
using (select distinct version_id from port_vervelle_male_schedule_days) character
where schedule.character_version_id=character.version_id;

with schedule_rows as(
  -- Early marine work begins when the harbor wakes.
  select *,1 slot,0 start_minute,330 end_minute,null::text location_slug,'Sleeping at home' activity,'limited' availability,'Home' display_location,'sleep' activity_key from port_vervelle_male_schedule_days where rhythm='early_marine'
  union all select *,2,330,480,morning_slug,morning_activity,'limited',null,'morning_routine' from port_vervelle_male_schedule_days where rhythm='early_marine'
  union all select *,3,480,840,case when is_work_day then work_slug else coalesce(sunday_slug,morning_slug) end,case when is_work_day then work_activity else sunday_activity end,case when is_work_day then 'busy' else 'available' end,null,case when is_work_day then 'occupation_primary' else 'day_off' end from port_vervelle_male_schedule_days where rhythm='early_marine'
  union all select *,4,840,1020,afternoon_slug,afternoon_activity,'available',null,'afternoon_routine' from port_vervelle_male_schedule_days where rhythm='early_marine'
  union all select *,5,1020,1260,social_slug,social_activity,'available',null,'social_evening' from port_vervelle_male_schedule_days where rhythm='early_marine'
  union all select *,6,1260,1440,null,'Winding down at home after the water','available','Home','home_evening' from port_vervelle_male_schedule_days where rhythm='early_marine'

  -- Restaurant work has a real afternoon break and a separate dinner service.
  union all select *,1,0,420,null,'Sleeping at home','limited','Home','sleep' from port_vervelle_male_schedule_days where rhythm='restaurant'
  union all select *,2,420,660,morning_slug,morning_activity,'available',null,'market_and_prep' from port_vervelle_male_schedule_days where rhythm='restaurant'
  union all select *,3,660,900,case when is_work_day then work_slug else coalesce(sunday_slug,morning_slug) end,case when is_work_day then work_activity else sunday_activity end,case when is_work_day then 'busy' else 'available' end,null,case when is_work_day then 'occupation_lunch' else 'day_off' end from port_vervelle_male_schedule_days where rhythm='restaurant'
  union all select *,4,900,1020,afternoon_slug,afternoon_activity,'limited',null,'service_break' from port_vervelle_male_schedule_days where rhythm='restaurant'
  union all select *,5,1020,1380,case when is_late_work_day then work_slug else social_slug end,case when is_late_work_day then work_activity else social_activity end,case when is_late_work_day then 'busy' else 'available' end,null,case when is_late_work_day then 'occupation_dinner' else 'social_evening' end from port_vervelle_male_schedule_days where rhythm='restaurant'
  union all select *,6,1380,1440,null,'Coming down from service at home','available','Home','post_shift_home' from port_vervelle_male_schedule_days where rhythm='restaurant'

  -- Idris keeps a truthful late-night rhythm, including the hours after midnight.
  union all select *,1,0,180,case when is_night_day then work_slug end,case when is_night_day then work_activity else 'Sleeping at home' end,case when is_night_day then 'busy' else 'limited' end,case when is_night_day then null else 'Home' end,case when is_night_day then 'occupation_night' else 'sleep' end from port_vervelle_male_schedule_days where rhythm='night'
  union all select *,2,180,600,null,'Sleeping after a late night','limited','Home','recovery_sleep' from port_vervelle_male_schedule_days where rhythm='night'
  union all select *,3,600,780,morning_slug,morning_activity,'available',null,'late_morning' from port_vervelle_male_schedule_days where rhythm='night'
  union all select *,4,780,1020,case when is_work_day then work_slug else morning_slug end,case when is_work_day then work_activity else morning_activity end,case when is_work_day then 'limited' else 'available' end,null,case when is_work_day then 'occupation_production' else 'day_off' end from port_vervelle_male_schedule_days where rhythm='night'
  union all select *,5,1020,1200,afternoon_slug,afternoon_activity,'limited',null,'event_prep' from port_vervelle_male_schedule_days where rhythm='night'
  union all select *,6,1200,1440,case when is_night_day then work_slug else social_slug end,case when is_night_day then work_activity else social_activity end,case when is_night_day then 'busy' else 'available' end,null,case when is_night_day then 'occupation_night' else 'social_evening' end from port_vervelle_male_schedule_days where rhythm='night'

  -- Theo's split day reflects both early clients and evening classes.
  union all select *,1,0,330,null,'Sleeping at home','limited','Home','sleep' from port_vervelle_male_schedule_days where rhythm='fitness_split'
  union all select *,2,330,600,case when is_work_day then work_slug else morning_slug end,case when is_work_day then work_activity else morning_activity end,case when is_work_day then 'busy' else 'available' end,null,case when is_work_day then 'occupation_morning' else 'day_off' end from port_vervelle_male_schedule_days where rhythm='fitness_split'
  union all select *,3,600,840,case when is_work_day then work_slug else coalesce(sunday_slug,morning_slug) end,case when is_work_day then work_activity else sunday_activity end,case when is_work_day then 'limited' else 'available' end,null,case when is_work_day then 'occupation_clients' else 'day_off' end from port_vervelle_male_schedule_days where rhythm='fitness_split'
  union all select *,4,840,1050,afternoon_slug,afternoon_activity,'available',null,'afternoon_routine' from port_vervelle_male_schedule_days where rhythm='fitness_split'
  union all select *,5,1050,1200,case when is_late_work_day then work_slug else social_slug end,case when is_late_work_day then work_activity else social_activity end,case when is_late_work_day then 'busy' else 'available' end,null,case when is_late_work_day then 'occupation_evening' else 'social_evening' end from port_vervelle_male_schedule_days where rhythm='fitness_split'
  union all select *,6,1200,1440,social_slug,social_activity,'available',null,'late_social' from port_vervelle_male_schedule_days where rhythm='fitness_split'

  -- All remaining contemporary day rhythms use work, a genuine break, social
  -- variation, and private time without cloning Friday through Sunday.
  union all select *,1,0,390,null,'Sleeping at home','limited','Home','sleep' from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
  union all select *,2,390,540,morning_slug,morning_activity,'available',null,'morning_routine' from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
  union all select *,3,540,900,case when is_work_day then work_slug else coalesce(sunday_slug,morning_slug) end,case when is_work_day then work_activity else sunday_activity end,case when is_work_day then 'busy' else 'available' end,null,case when is_work_day then 'occupation_primary' else 'day_off' end from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
  union all select *,4,900,1050,case when is_late_work_day then work_slug else afternoon_slug end,case when is_late_work_day then work_activity else afternoon_activity end,case when is_late_work_day then 'busy' else 'available' end,null,case when is_late_work_day then 'occupation_rotation' else 'afternoon_routine' end from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
  union all select *,5,1050,1290,case when is_late_work_day then work_slug else social_slug end,case when is_late_work_day then work_activity else social_activity end,case when is_late_work_day then 'busy' else 'available' end,null,case when is_late_work_day then 'occupation_rotation' else 'social_evening' end from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
  union all select *,6,1290,1440,null,'Winding down at home','available','Home','home_evening' from port_vervelle_male_schedule_days where rhythm not in('early_marine','restaurant','night','fitness_split')
),located as(
  select row_data.*,location.id location_id
  from schedule_rows row_data
  left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=row_data.location_slug
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  case when activity_key in('sleep','recovery_sleep') then -1 when availability='busy' then -2 else 1 end,
  case when activity_key in('sleep','recovery_sleep') then 'resting' when availability='busy' then 'focused' else 'engaged' end,
  1,jsonb_strip_nulls(jsonb_build_object(
    'source','port_vervelle_male_schedule_v1','scheduleMode','authored','profileVisibility','visible',
    'displayLocation',display_location,'activityKey',activity_key,'activityVariants',jsonb_build_array(activity),
    'priority',case when availability='busy' then 'hard_obligation' when activity_key in('sleep','recovery_sleep') then 'recurring_routine' else 'preferred_activity' end,
    'rhythm',rhythm,'slot',slot,'scheduleProfile','port_vervelle_male_v1'
  ))
from located
on conflict(character_version_id,day_of_week,start_minute) do update set
  end_minute=excluded.end_minute,location_id=excluded.location_id,activity=excluded.activity,
  availability=excluded.availability,energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,
  variation_weight=excluded.variation_weight,metadata=excluded.metadata;

delete from public.together_character_schedule_events event
using public.together_character_instances instance,public.together_character_templates template
where event.character_instance_id=instance.id and instance.character_template_id=template.id
  and template.slug in(select slug from port_vervelle_male_profiles)
  and event.source in('generated','recurring') and event.starts_at>now();

-- Explicit, asymmetric-in-spirit but bidirectionally readable authored ties.
create temporary table port_vervelle_male_edges(
  source_slug text,target_slug text,relationship_type text,affinity int,trust int,history text
) on commit drop;
insert into port_vervelle_male_edges values
('matteo-bellandi','mia-han-andersson','ocean_friends',84,82,'Matteo and Mia trade water conditions, impulsive outings, and honest assessments of risk.'),
('matteo-bellandi','valentina-costa','nightlife_friends',76,72,'Valentina can usually persuade Matteo out after the final charter, but never before the boat is settled.'),
('matteo-bellandi','enzo-moretti','older_friend',78,80,'Matteo teases Enzo and quietly models how to stay calm when a plan fails.'),
('matteo-bellandi','rafael-silva','close_friends',90,91,'Matteo and Rafael trust each other on the water and disagree openly about boating culture.'),
('alessandro-moretti','enzo-moretti','brothers',96,94,'Sandro is Enzo''s older brother; affection often arrives as food, advice, and arguments neither can leave unfinished.'),
('alessandro-moretti','giulia-marchetti','community_friends',82,84,'Giulia and Sandro have years of practical neighborhood trust and an ongoing disagreement about his working hours.'),
('alessandro-moretti','ana-ribeiro','market_friends',84,82,'Ana and Sandro trade market finds, flowers, ingredients, and community news without making it transactional.'),
('alessandro-moretti','chiara-vitale','creative_regulars',73,70,'Chiara photographs occasional Sotto Sale dinners and refuses Sandro''s attempts to feed every production problem.'),
('alessandro-moretti','gabriel-laurent','hospitality_peers',79,76,'Sandro and Gabriel respect one another''s standards while disagreeing about polish versus intimacy.'),
('enzo-moretti','mia-han-andersson','close_beach_friends',89,86,'Enzo and Mia make beach shifts competitive and know when the other is masking uncertainty with energy.'),
('enzo-moretti','valentina-costa','close_beach_friends',87,82,'Enzo and Valentina share volleyball, food, festivals, and a rumor mill they mostly find funny.'),
('enzo-moretti','theo-mancini','friendly_rivals',91,86,'Enzo and Theo turn training into wagers while remaining reliably loyal when competition stops being fun.'),
('gabriel-laurent','amelie-rousseau','professional_friends',81,83,'Gabriel and Amélie understand precise presentation and trust each other with demanding clients.'),
('gabriel-laurent','chiara-vitale','culture_friends',76,75,'Gabriel and Chiara share architecture, observation, and the ability to notice what an event is trying too hard to communicate.'),
('gabriel-laurent','marco-de-santis','professional_colleagues',84,87,'Gabriel hires Marco for restoration advice and expects disagreement to arrive with evidence.'),
('gabriel-laurent','lorenzo-bellaforte','old_social_friends',86,82,'Gabriel and Lorenzo have moved through the same hospitality and old-family rooms long enough to recognize each other''s public masks.'),
('gabriel-laurent','luca-bianchi','close_friends',82,88,'Gabriel and Luca share restrained humor, occasional sailing, and an agreement not to turn friendship into another obligation.'),
('luca-bianchi','giulia-marchetti','trusted_colleagues',90,93,'Luca and Giulia coordinate patient care with deep professional trust and an easy off-duty familiarity.'),
('luca-bianchi','isabella-conti','quiet_friends',77,83,'Isabella saves medical-history books for Luca, and he respects the silence of her courtyard table.'),
('idris-benali','lea-benali','older_cousins',98,96,'Idris is Léa''s older cousin, creative ally, protective critic, and one of the few people who knows when her sarcasm means she needs help.'),
('idris-benali','eva-moreau','creative_collaborators',90,85,'Idris and Eva build live sets together, argue about transitions, and trust one another not to confuse stage persona with private truth.'),
('idris-benali','valentina-costa','nightlife_friends',78,75,'Valentina supplies crowd intelligence Idris pretends not to need; he makes sure she gets home after unusually late nights.'),
('idris-benali','theo-mancini','close_friends',85,83,'Idris and Theo share concerts, motorcycles, teasing, and more serious future plans than either advertises socially.'),
('marco-de-santis','chiara-vitale','creative_colleagues',86,84,'Chiara documents Marco''s restorations and challenges every image that makes change look painless.'),
('marco-de-santis','amelie-rousseau','professional_respect',81,84,'Marco and Amélie share material knowledge, exact standards, and no patience for careless alterations.'),
('marco-de-santis','elias-romano','research_allies',88,86,'Marco and Elias trade structural evidence and historical records while disagreeing about what development should be allowed to touch.'),
('rafael-silva','ana-ribeiro','community_friends',81,84,'Ana supports Rafael''s conservation work and notices when idealism has pushed him past reasonable rest.'),
('rafael-silva','mia-han-andersson','ocean_friends',88,86,'Rafael and Mia trade surf conditions, equipment, and an instinctive refusal to leave coastal trash behind.'),
('rafael-silva','elias-romano','research_partners',93,92,'Rafael and Elias share offshore evidence, dive safety, and strict rules about claims that have not been verified.'),
('nico-valenti','isabella-conti','close_friends',88,90,'Nico and Isabella share quiet work, old films, and conversations that do not need constant filling.'),
('nico-valenti','ana-ribeiro','creative_friends',83,84,'Ana brings Nico unusual plant forms and he remembers every color she asks him to test in glaze.'),
('nico-valenti','lea-benali','creative_friends',79,76,'Léa photographs Nico''s process without making it look mass-produced, which matters more to him than publicity.'),
('lorenzo-bellaforte','amelie-rousseau','old_social_peers',78,74,'Amélie knows exactly when Lorenzo''s effortless style required considerable effort and refuses to flatter the family name.'),
('lorenzo-bellaforte','chiara-vitale','old_friends',80,77,'Lorenzo and Chiara share art events and a long-running attraction rumor neither considers public property.'),
('elias-romano','isabella-conti','archive_friends',87,89,'Isabella helps Elias trace obscure references while he brings her the history behind objects that reach the museum.'),
('elias-romano','chiara-vitale','cultural_colleagues',82,80,'Chiara and Elias collaborate on exhibitions and disagree productively about beauty versus documentary evidence.'),
('theo-mancini','valentina-costa','flirtatious_friends',82,76,'Theo and Valentina share easy chemistry, beach wagers, and no assumed claim on each other.'),
('theo-mancini','mia-han-andersson','beach_friends',85,84,'Mia joins Theo''s beach workouts when she wants a challenge and slows down for his elderly dog without being asked.');

with directed as(
  select * from port_vervelle_male_edges
  union all select target_slug,source_slug,relationship_type,affinity,trust,history from port_vervelle_male_edges
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000008',source.id,target.id,
  edge.relationship_type,edge.affinity,edge.trust,edge.history,
  jsonb_build_object('source','port_vervelle_male_expansion_v1','memorySharing','event_only','authored',true)
from directed edge
join public.together_character_templates source on source.slug=edge.source_slug
join public.together_character_templates target on target.slug=edge.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,
  history=excluded.history,metadata=excluded.metadata,updated_at=now();

create temporary table port_vervelle_expansion_events(
  event_index int,name text,event_type text,location_slug text,participant_slugs text[],probability numeric,
  duration_minutes int,narrative_summary text,category text,tone text,recurrence jsonb
) on commit drop;
insert into port_vervelle_expansion_events values
(1,'Solana Beach Volleyball','social','spiaggia-solana',array['enzo-moretti','theo-mancini','mia-han-andersson','valentina-costa','matteo-bellandi','rafael-silva'],.78,150,'The Solana beach circle turns an afternoon volleyball game into friendly competition, food, and changing teams.','social','funny','{"frequency":"weekly","weekday":6,"startMinute":900}'::jsonb),
(2,'La Sirena Live Night','social','la-sirena',array['eva-moreau','idris-benali','matteo-bellandi','theo-mancini','valentina-costa'],.84,300,'Idris coordinates a live Friday set around Eva''s room, drawing the harbor and beach circles into La Sirena.','social','exciting','{"frequency":"weekly","weekday":5,"startMinute":1320}'::jsonb),
(3,'Studio Ondine Art Opening','social','studio-ondine',array['chiara-vitale','lea-benali','marco-de-santis','nico-valenti','elias-romano','ana-ribeiro'],.52,180,'A small Studio Ondine opening brings craft, photography, restoration, and maritime history into the same crowded room.','social','positive','{"frequency":"monthly","ordinal":2,"weekday":4,"startMinute":1110}'::jsonb),
(4,'Sotto Sale Community Table','social','sotto-sale',array['alessandro-moretti','ana-ribeiro','giulia-marchetti','luca-bianchi','gabriel-laurent'],.46,180,'Sandro opens one long table after service for friends whose schedules rarely align.','relationship','romantic','{"frequency":"monthly","ordinal":1,"weekday":0,"startMinute":1200}'::jsonb),
(5,'Vervelle Sailing Morning','world','porto-marina',array['matteo-bellandi','rafael-silva','mia-han-andersson','camille-laurent','lucia-ferraro','elias-romano'],.62,240,'A clear weather window brings sailors, divers, and researchers into a shared morning beyond the harbor.','world','positive','{"frequency":"weather_condition","weather":["sunny","breezy"],"weekday":[0,6],"startRange":[420,540]}'::jsonb),
(6,'Porto Market Morning','world','vervelle-fish-market',array['alessandro-moretti','ana-ribeiro','giulia-marchetti','nico-valenti','elena-moretti'],.86,180,'The fish and produce market concentrates cooks, artists, regulars, and the morning''s best local information.','world','mundane','{"frequency":"weekly","weekday":6,"startMinute":390}'::jsonb),
(7,'Domaine Vervelle Evening','celebration','domaine-vervelle',array['lorenzo-bellaforte','amelie-rousseau','gabriel-laurent','chiara-vitale','celine-haddad','livia-santoro'],.48,240,'A vineyard dinner mixes old-family expectations, hospitality, art, and people Lorenzo invited without checking the table size.','celebration','romantic','{"frequency":"monthly","ordinal":3,"weekday":6,"startMinute":1080}'::jsonb);

insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,duration_minutes,
  narrative_summary,state_effects,user_visibility,proactive_eligible,metadata,active,category,tone,scale,content_level,conditions,followups
)
select ('3b000000-0000-4000-8008-'||lpad(event.event_index::text,12,'0'))::uuid,event.name,event.event_type,
  '10000000-0000-4000-8000-000000000008',location.id,
  array(select template.id from public.together_character_templates template where template.slug=any(event.participant_slugs)),
  .55,event.probability,event.duration_minutes,event.narrative_summary,'{}'::jsonb,'contextual',true,
  jsonb_build_object('worldSlug','port-vervelle','worldEvent',true,'recurrence',event.recurrence,'scheduleAware',true,'source','port_vervelle_male_expansion_v1'),
  true,event.category,event.tone,'normal','standard',jsonb_build_object('recurrence',event.recurrence),'{}'::text[]
from port_vervelle_expansion_events event
join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=event.location_slug
on conflict(id) do update set
  name=excluded.name,event_type=excluded.event_type,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,probability=excluded.probability,
  duration_minutes=excluded.duration_minutes,narrative_summary=excluded.narrative_summary,
  metadata=excluded.metadata,conditions=excluded.conditions,active=true,updated_at=now();

create temporary table port_vervelle_male_story_arcs(
  slug text,title text,lead_slug text,location_slugs text[],chapter_seeds text[],min_stage text
) on commit drop;
insert into port_vervelle_male_story_arcs values
('port-vervelle-stay-or-sail','Stay or Sail','matteo-bellandi',array['porto-marina','cala-bianca','blue-lantern'],array['Matteo mentions the international captain offer without asking for advice.','A disrupted charter exposes what competence and belonging mean to him.','He names what leaving would cost without making the user decide for him.'],'friend'),
('port-vervelle-small-table','The Small Table','alessandro-moretti',array['sotto-sale','vervelle-fish-market'],array['Sandro reveals what investors want to change at Sotto Sale.','A dinner service demonstrates both the restaurant''s limits and its value.','He chooses a negotiating position based on his own priorities, not a forced quest outcome.'],'friend'),
('port-vervelle-no-scoreboard','No Scoreboard','enzo-moretti',array['spiaggia-solana','bellavista-fitness-club'],array['Enzo admits that competition is easier than choosing a future.','A study or work setback cannot be solved by charm.','He makes one concrete adult decision while retaining room to change.'],'friend'),
('port-vervelle-off-the-clock','Off the Clock','gabriel-laurent',array['hotel-coralline','velours','piazza-aurelia'],array['Gabriel''s personal plan is interrupted by a hotel problem.','He attempts an evening with no experience to manage for somebody else.','He identifies a boundary between excellence and self-erasure.'],'friend'),
('port-vervelle-after-burnout','After the Shift','luca-bianchi',array['vervelle-general-clinic','porto-marina','belvedere-garden'],array['Luca describes burnout as history rather than a plea for rescue.','A difficult rotation tests whether his new boundaries are real.','He chooses a sustainable commitment outside medicine.'],'friend'),
('port-vervelle-free-sound','The Free Sound','idris-benali',array['la-sirena','studio-lucent','spiaggia-solana'],array['Idris receives an opportunity that would professionalize his music quickly.','A local live night reminds him what cannot be measured by reach.','He defines success in his own terms before answering the offer.'],'friend'),
('port-vervelle-old-stone-new-money','Old Stone, New Money','marco-de-santis',array['vervelle-design-works','piazza-aurelia','palazzo-civico'],array['Marco shares the real tradeoff inside his restoration-development plan.','Local objections reveal both sentimental and valid structural concerns.','He revises or defends the plan through evidence, not automatic agreement.'],'acquaintance'),
('port-vervelle-damaged-water','The Damaged Water','rafael-silva',array['porto-marina','cala-bianca','museo-marittimo-vervelle'],array['Rafael shows verified signs of coastal damage.','The source implicates interests with money and local influence.','He chooses a responsible disclosure path without inventing a villain.'],'friend'),
('port-vervelle-one-of-one','One of One','nico-valenti',array['studio-ondine','piazza-aurelia'],array['Nico receives a mass-production request large enough to change his business.','A market day shows both the opportunity and the emotional cost.','He defines what growth can mean without abandoning singular craft.'],'friend'),
('port-vervelle-own-vintage','His Own Vintage','lorenzo-bellaforte',array['domaine-vervelle','la-pergola','luna-terrace'],array['Lorenzo distinguishes his work from the Bellaforte inheritance.','A family obligation publicly absorbs credit for something he built.','He launches or protects one project under terms he chose.'],'friend'),
('port-vervelle-below-the-chart','Below the Chart','elias-romano',array['museo-marittimo-vervelle','porto-marina','cala-bianca'],array['Elias presents evidence of a submerged structure with careful uncertainty.','The find intersects a planned development and Rafael''s environmental data.','He chooses when and how to publish after verification.'],'acquaintance'),
('port-vervelle-serious-reputation','The Reputation','theo-mancini',array['bellavista-fitness-club','spiaggia-solana','la-sirena'],array['Theo''s old party reputation costs his studio a serious opportunity.','Friends see the actual work he now carries without turning it into praise theater.','He decides whether to confront, outgrow, or strategically use the reputation.'],'friend');

insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select story.slug,story.title,'personal',array[template.id],story.min_stage,
  jsonb_build_object('worldSlug','port-vervelle','characterSlugs',jsonb_build_array(story.lead_slug),'locationSlugs',to_jsonb(story.location_slugs),'dialogueDriven',true,'requiresCorrectPlaceWhenAdvancing',false),
  (select jsonb_agg(jsonb_build_object(
    'id','chapter-'||ordinality,'title',case ordinality when 1 then 'The pressure appears' when 2 then 'The choice becomes real' else 'A choice of his own' end,
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,
    'mayTriggerProactiveMessage',true,'mayCreateMoment',ordinality=array_length(story.chapter_seeds,1),
    'narrativeSeed',seed,'minimumHoursBeforeNext',case when ordinality=1 then 18 else 36 end,
    'eligibleCharacterSlugs',jsonb_build_array(story.lead_slug),'eligibleLocationSlugs',to_jsonb(story.location_slugs)
  ) order by ordinality) from unnest(story.chapter_seeds) with ordinality chapter(seed,ordinality)),
  90,false,'major',true,'specific','10000000-0000-4000-8000-000000000008'
from port_vervelle_male_story_arcs story
join public.together_character_templates template on template.slug=story.lead_slug
on conflict(slug) do update set
  title=excluded.title,category=excluded.category,eligible_template_ids=excluded.eligible_template_ids,
  min_relationship_stage=excluded.min_relationship_stage,prerequisites=excluded.prerequisites,
  chapters=excluded.chapters,world_scope='specific',specific_world_id=excluded.specific_world_id,
  active=true,updated_at=now();

update public.together_worlds set metadata=metadata||jsonb_build_object(
  'residentCompanionCount',42,'residentRosterVersion',2,'residentScheduleStatus','life_v2_plus_male_authored_v1',
  'socialGraphStatus','expanded_interconnected_v2','recurringEventCount',7,'maleStoryArcCount',12
),updated_at=now()
where id='10000000-0000-4000-8000-000000000008';

do $$
declare character_count int;schedule_count int;invalid_locations int;edge_count int;event_count int;story_count int;
begin
  select count(*) into character_count from port_vervelle_male_profiles;
  select count(*) into schedule_count from public.together_schedule_templates schedule
    where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
      and schedule.metadata->>'source'='port_vervelle_male_schedule_v1';
  select count(*) into invalid_locations from public.together_schedule_templates schedule
    left join public.together_locations location on location.id=schedule.location_id
    where schedule.character_version_id::text ~ '^23000000-0000-4000-8008-0000000000(3[1-9]|4[0-2])$'
      and schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000008'::uuid;
  select count(*) into edge_count from public.together_character_relationship_edges where metadata->>'source'='port_vervelle_male_expansion_v1';
  select count(*) into event_count from public.together_event_templates where metadata->>'source'='port_vervelle_male_expansion_v1' and active;
  select count(*) into story_count from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000008' and slug like 'port-vervelle-%' and active;
  if character_count<>12 or schedule_count<>504 or invalid_locations<>0 or edge_count<70 or event_count<>7 or story_count<12 then
    raise exception 'Port Vervelle male simulation validation failed: characters %, schedules %, invalid locations %, edges %, events %, stories %',character_count,schedule_count,invalid_locations,edge_count,event_count,story_count;
  end if;
end $$;

commit;
