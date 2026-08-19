begin;

-- Port Vervelle Life Engine V2. Character definitions stay account-independent;
-- schedules are materialized only after a user meets a character.
create temporary table kivelle_port_life_v2(
  slug text primary key,
  work_pattern text not null,
  work_slug text not null,
  work_days int[] not null,
  start_min int not null,
  start_max int not null,
  duration_min int not null,
  duration_max int not null,
  work_variants text[] not null,
  break_policy text not null default 'none',
  second_slug text,
  second_days int[],
  second_start_min int,
  second_start_max int,
  second_duration_min int,
  second_duration_max int,
  second_variants text[],
  second_recovery int4range
) on commit drop;

insert into kivelle_port_life_v2 values
('elena-moretti','shifts','cafe-marelle',array[1,2,3,4,5],360,420,420,510,array['Opening Cafe Marelle for the harbor breakfast crowd','Working the waterfront breakfast shift','Closing out a busy cafe morning'],'meal',null,null,null,null,null,null,null,null),
('lucia-ferraro','shifts','vervelle-sailing-house',array[1,2,4,5,6],450,540,420,540,array['Teaching a coastal sailing lesson','Checking boats before the afternoon wind','Running a practical lesson beyond the harbor'],'meal',null,null,null,null,null,null,null,null),
('sofia-bellini','shifts','forno-bellini',array[2,3,4,5,6],300,360,420,510,array['Finishing the first pastry batch','Working the morning bakery counter','Testing the day''s pastry special'],'meal',null,null,null,null,null,null,null,null),
('camille-laurent','shifts','porto-marina',array[1,2,3,5,6],390,510,420,570,array['Preparing a charter beyond the headland','Checking the boat before a coastal charter','Bringing a charter back through Porto Marina'],'meal',null,null,null,null,null,null,null,null),
('alessia-romano','shifts','casa-del-mare',array[2,3,4,5,6],660,720,570,660,array['Preparing La Casa del Mare for dinner service','Running the harbor dinner service','Closing out a full dining room'],'meal',null,null,null,null,null,null,null,null),
('isabella-conti','fixed_weekdays','libreria-vervelle',array[1,2,3,4,5],510,570,480,540,array['Opening Libreria Vervelle for the day','Organizing the courtyard reading table','Helping a customer find the right book'],'meal',null,null,null,null,null,null,null,null),
('amelie-rousseau','fixed_weekdays','atelier-amelie',array[1,2,3,4,5],540,600,450,540,array['Fitting a difficult custom piece','Sketching a new collection at the atelier','Reviewing fabric and finishing details'],'meal',null,null,null,null,null,null,null,null),
('giulia-marchetti','fixed_weekdays','farmacia-vervelle',array[1,2,3,4,5],450,510,510,600,array['Opening the old-town pharmacy','Covering the Farmacia Vervelle counter','Finishing pharmacy records before closing'],'meal',null,null,null,null,null,null,null,null),
('marta-solari','fixed_weekdays','palazzo-civico',array[1,2,3,4,5],480,540,480,570,array['Reviewing a waterfront planning proposal','Meeting residents about a restoration plan','Revising a town redevelopment brief'],'meal',null,null,null,null,null,null,null,null),
('nina-kovac','freelance','libreria-vervelle',array[1,2,4,5],570,660,300,420,array['Writing beside the courtyard shelves','Reworking a difficult story draft','Researching a new piece in the bookshop'],'none',null,null,null,null,null,null,null,null),
('valentina-costa','shifts','lido-vervelle',array[2,3,4,5,6],690,780,480,570,array['Setting up the Lido bar for the afternoon','Working the beach bar through sunset','Closing out a lively Lido shift'],'meal',null,null,null,null,null,null,null,null),
('mia-han-andersson','shifts','solana-beach-rentals',array[1,2,3,5,6],450,540,420,540,array['Setting out boards and kayaks','Helping visitors choose water gear','Bringing in the last beach rentals'],'meal',null,null,null,null,null,null,null,null),
('eva-moreau','shifts','la-sirena',array[3,4,5,6,0],1080,1140,300,360,array['Building the night''s DJ set','Testing the room before La Sirena opens','Playing the late set at La Sirena'],'none',null,null,null,null,null,null,null,null),
('bianca-de-luca','shifts','velours',array[2,3,4,5,6],990,1050,360,450,array['Preparing the bar before the evening set','Mixing drinks through a busy Velours night','Closing the cocktail bar after the last table'],'none',null,null,null,null,null,null,null,null),
('clara-mendes','shifts','maison-rouge',array[2,3,4,5,6],930,990,390,450,array['Rehearsing the cabaret''s late set','Preparing costumes before the show','Performing the evening cabaret set'],'none',null,null,null,null,null,null,null,null),
('lea-benali','fixed_weekdays','studio-lucent',array[1,2,3,4,5],510,570,420,510,array['Setting up a coastal portrait shoot','Assisting with a Studio Lucent session','Packing down lighting after a shoot'],'meal',null,null,null,null,null,null,null,null),
('chiara-vitale','freelance','studio-lucent',array[1,2,3,4,5],540,660,300,480,array['Directing a portrait session','Editing a client portrait series','Scouting light for an upcoming shoot'],'none',null,null,null,null,null,null,null,null),
('ana-ribeiro','fixed_weekdays','fiore-and-fig',array[2,3,4,5,6],450,510,420,510,array['Opening Fiore and Fig for the day','Building an arrangement for a celebration','Conditioning flowers for the next order'],'meal',null,null,null,null,null,null,null,null),
('tessa-patel-morgan','shifts','bellavista-fitness-club',array[1,2,3,4,5,6],360,480,300,480,array['Teaching an early Pilates session','Coaching a private training session','Programming the next Bellavista class'],'none',null,null,null,null,null,null,null,null),
('margot-lefevre','fixed_weekdays','vervelle-design-works',array[1,2,3,4,5],510,570,420,510,array['Reviewing an interior restoration','Comparing material samples for a client','Reworking a room layout at the studio'],'meal',null,null,null,null,null,null,null,null),
('sara-moretti','shifts','officina-moretti',array[1,2,3,4,5,6],420,480,450,540,array['Opening Officina Moretti for the day','Repairing a stubborn scooter','Finishing a mechanical rebuild'],'meal',null,null,null,null,null,null,null,null),
('emilia-rossi','shifts','vervelle-general-clinic',array[1,2,3,4,5],420,480,480,570,array['Starting clinic rounds','Seeing patients through a full clinic day','Finishing notes after the last appointment'],'meal','vervelle-general-clinic',array[6],1140,1200,600,660,array['Covering an overnight clinic rotation','Handling the clinic''s overnight calls'],int4range(360,451,'[]')),
('noemie-diop','fixed_weekdays','vervelle-general-clinic',array[1,2,3,4,5],480,540,420,510,array['Working through a physical therapy session','Reviewing a patient recovery plan','Finishing the clinic''s therapy appointments'],'meal',null,null,null,null,null,null,null,null),
('inez-el-mansouri','student','studio-ondine',array[1,3,5],540,600,180,300,array['Attending an art class at Studio Ondine','Working through a painting study','Reviewing a portfolio assignment'],'none','vervelle-cooperative',array[2,4,6],720,780,240,360,array['Working the cooperative counter','Helping close the Vervelle Cooperative'],null),
('francesca-leone','fixed_weekdays','vervelle-design-works',array[1,2,3,4,5],480,540,480,570,array['Revising a restoration proposal','Reviewing a historic site plan','Presenting a design revision'],'meal',null,null,null,null,null,null,null,null),
('celine-haddad','shifts','domaine-vervelle',array[2,3,4,5,6],570,630,480,570,array['Preparing the Domaine tasting room','Guiding a vineyard tasting','Reviewing the cellar list after service'],'meal',null,null,null,null,null,null,null,null),
('livia-santoro','shifts','domaine-vervelle',array[1,2,3,4,5],360,420,420,510,array['Starting work between the vineyard rows','Tending the Domaine vines','Finishing the day''s vineyard work'],'meal',null,null,null,null,null,null,null,null),
('juliette-baptiste','shifts','hotel-celeste',array[1,2,3,4,5,6],450,540,420,540,array['Starting the concierge desk at Hotel Celeste','Solving a difficult guest request','Preparing arrivals for the evening desk'],'meal',null,null,null,null,null,null,null,null),
('adriana-vega','fixed_weekdays','hotel-celeste',array[1,2,3,4,5,6],450,510,540,630,array['Directing the hotel through a busy arrival','Reviewing operations with the Celeste team','Resolving a demanding guest problem'],'meal',null,null,null,null,null,null,null,null),
('elise-ben-youssef','shifts','celeste-spa',array[1,2,3,4,5,6],450,510,450,540,array['Opening the Celeste Spa terrace','Preparing the spa for a quiet afternoon','Finishing the day''s treatment schedule'],'meal',null,null,null,null,null,null,null,null);

do $$
declare missing_count integer;
begin
  if (select count(*) from kivelle_port_life_v2) <> 30 then
    raise exception 'Port Vervelle Life Engine profile must contain all 30 residents';
  end if;

  select count(*) into missing_count
  from kivelle_port_life_v2 profile
  left join public.together_character_templates template on template.slug=profile.slug
  left join public.together_locations work
    on work.world_id='10000000-0000-4000-8000-000000000008'::uuid and work.slug=profile.work_slug
  left join public.together_locations secondary
    on secondary.world_id='10000000-0000-4000-8000-000000000008'::uuid and secondary.slug=profile.second_slug
  where template.id is null or work.id is null or (profile.second_slug is not null and secondary.id is null);

  if missing_count > 0 then
    raise exception 'Port Vervelle Life Engine has % unresolved character or work locations',missing_count;
  end if;
end $$;

-- Upgrade the current published definitions without creating CharacterInstances.
update public.together_character_versions version set life_config=
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(version.life_config,'{}'::jsonb),'{version}','2'::jsonb,true),
      '{occupation}',
      jsonb_build_object(
        'title',template.occupation,
        'workPattern',profile.work_pattern,
        'primaryLocationSlug',profile.work_slug,
        'flexibility',coalesce((version.personality_config->>'spontaneity')::numeric,.5),
        'scheduleBlocks',jsonb_build_array(
          jsonb_build_object(
            'key','primary','title',template.occupation,'activityKey','occupation_primary',
            'workDays',to_jsonb(profile.work_days),
            'startRange',jsonb_build_object('startMinute',profile.start_min,'endMinute',profile.start_max),
            'durationMinutes',jsonb_build_array(profile.duration_min,profile.duration_max),
            'primaryLocationSlug',profile.work_slug,'activityVariants',to_jsonb(profile.work_variants),
            'breakPolicy',profile.break_policy,'visibility','known','interruptibility','busy',
            'metadata',jsonb_build_object('upcomingHint','Might be working later','scheduleProfile','port_vervelle_life_v2')
          )
        ) || case when profile.second_slug is null then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object(
            'key','secondary','title',template.occupation,'activityKey','occupation_secondary',
            'workDays',to_jsonb(profile.second_days),
            'startRange',jsonb_build_object('startMinute',profile.second_start_min,'endMinute',profile.second_start_max),
            'durationMinutes',jsonb_build_array(profile.second_duration_min,profile.second_duration_max),
            'primaryLocationSlug',profile.second_slug,'activityVariants',to_jsonb(profile.second_variants),
            'breakPolicy','none','visibility','known','interruptibility','busy',
            'recoverySleepMinutes',case when profile.second_recovery is null then null else jsonb_build_array(lower(profile.second_recovery),upper(profile.second_recovery)-1) end,
            'metadata',jsonb_build_object('upcomingHint','Has a second commitment later','scheduleProfile','port_vervelle_life_v2')
          )
        ) end
      ),true
    ),
    '{scheduling}',
    coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
      'repetitionTolerance',.26,'preferredDailyActivityCount',jsonb_build_array(2,3),
      'generationVersion','life_engine_v2','scheduleProfile','port_vervelle_life_v2'
    ),true
  ),updated_at=now()
from public.together_character_templates template,kivelle_port_life_v2 profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

-- Sleep follows work rhythm instead of one generic clock for the entire world.
update public.together_character_versions version set life_config=jsonb_set(version.life_config,'{sleep}',
  case
    when profile.start_min>=900 then jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',120,'endMinute',240),
      'preferredWakeTime',jsonb_build_object('startMinute',570,'endMinute',720),
      'variabilityMinutes',35,'weekendShiftMinutes',30)
    when profile.start_min<=390 then jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',1200,'endMinute',1320),
      'preferredWakeTime',jsonb_build_object('startMinute',240,'endMinute',360),
      'variabilityMinutes',25,'weekendShiftMinutes',45)
    else jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',1320,'endMinute',60),
      'preferredWakeTime',jsonb_build_object('startMinute',390,'endMinute',510),
      'variabilityMinutes',35,'weekendShiftMinutes',60)
  end,true),updated_at=now()
from public.together_character_templates template,kivelle_port_life_v2 profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

update public.together_character_world_presence presence set
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
    'scheduleProfile','port_vervelle_life_v2','dynamicSchedule',true
  ),updated_at=now()
from public.together_character_versions version,public.together_character_templates template,kivelle_port_life_v2 profile
where presence.character_version_id=version.id and version.character_template_id=template.id
  and template.slug=profile.slug and presence.world_id='10000000-0000-4000-8000-000000000008'::uuid;

-- Replace only the shallow launch activity bank. Other authored extensions stay.
delete from public.together_character_activity_templates activity
using public.together_character_versions version,public.together_character_templates template
where activity.character_version_id=version.id and version.character_template_id=template.id
  and template.slug in(select slug from kivelle_port_life_v2)
  and activity.metadata->>'source'='port_vervelle_character_roster';

with generic_activity(key,label,slug,category,start_min,end_min,max_week,hint) as(values
  ('home_cooking','Cooking something at home','','home',960,1260,3,'May cook at home later'),
  ('quiet_home','Having a quiet evening at home','','home',1080,1380,4,'May keep tonight quiet'),
  ('town_errand','Picking up a few practical things','vervelle-cooperative','errand',480,1140,2,'May run an errand later'),
  ('coastal_walk','Taking a walk above the water','harbor-steps','outdoors',480,1260,3,'May walk by the water later')
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,generic.key,generic.label,generic.category,
  jsonb_build_array(jsonb_build_object('startMinute',generic.start_min,'endMinute',generic.end_min)),int4range(45,121,'[]'),
  array[generic.category],case when generic.slug='' then array[]::text[] else array[generic.slug] end,
  array[generic.category],.62,int4range(1,3,'[]'),generic.max_week,18,null,'either',
  case when generic.category in('home','errand') then 'recurring_routine' else 'preferred_activity' end,
  'hidden','open',jsonb_build_object(
    'source','port_vervelle_life_v2','activityLabel',generic.label,
    'upcomingHint',generic.hint,'outcomeEligible',false
  )
from kivelle_port_life_v2 profile
join public.together_character_templates template on template.slug=profile.slug
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version
cross join generic_activity generic
on conflict(character_version_id,activity_key) do update set
  title=excluded.title,category=excluded.category,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,tags=excluded.tags,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

-- Build a complete visible seven-day profile from the same occupation and
-- activity sources used by runtime generation. This is a projection for UI and
-- schedule fallback, not a second source of character truth.
create temporary table kivelle_port_schedule_characters on commit drop as
select version.id version_id,template.slug,template.occupation
from kivelle_port_life_v2 profile
join public.together_character_templates template on template.slug=profile.slug
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version;

create temporary table kivelle_port_schedule_blocks on commit drop as
select character.version_id,profile.slug,profile.work_days,profile.start_min,profile.start_max,
  profile.duration_min,profile.duration_max,profile.work_slug location_slug,
  to_jsonb(profile.work_variants) work_variants,'primary'::text block_key
from kivelle_port_life_v2 profile
join kivelle_port_schedule_characters character on character.slug=profile.slug
union all
select character.version_id,profile.slug,profile.second_days,profile.second_start_min,profile.second_start_max,
  profile.second_duration_min,profile.second_duration_max,profile.second_slug,
  to_jsonb(profile.second_variants),'secondary'
from kivelle_port_life_v2 profile
join kivelle_port_schedule_characters character on character.slug=profile.slug
where profile.second_slug is not null;

create temporary table kivelle_port_schedule_activities on commit drop as
select character.version_id,character.slug,activity.activity_key,
  coalesce(nullif(activity.metadata->>'activityLabel',''),activity.title) title,
  activity.category,coalesce((activity.valid_time_windows->0->>'startMinute')::int,600) valid_start,
  coalesce((activity.valid_time_windows->0->>'endMinute')::int,1260) valid_end,
  greatest(60,least(120,((lower(activity.duration_minutes)+upper(activity.duration_minutes)-1)/2)::int)) duration_minutes,
  case when coalesce(array_length(activity.location_slugs,1),0)>0 then activity.location_slugs[1] end location_slug,
  activity.category='home' display_home,activity.priority,
  activity.activity_key not in('home_cooking','quiet_home','town_errand','coastal_walk') is_custom
from kivelle_port_schedule_characters character
join public.together_character_activity_templates activity on activity.character_version_id=character.version_id
where activity.category<>'work';

create temporary table kivelle_port_schedule_days on commit drop as
with day_grid as(
  select character.*,day_number day_of_week
  from kivelle_port_schedule_characters character cross join generate_series(0,6) day_number
),base as(
  select day_grid.*,
    occupation.start_min,occupation.start_max,occupation.duration_min,occupation.duration_max,
    occupation.location_slug work_location_slug,occupation.work_variants,occupation.block_key,
    floor((occupation.start_min+occupation.start_max)/2.0)::int anchor_start,
    floor((occupation.duration_min+occupation.duration_max)/2.0)::int anchor_duration,
    daytime.activity_key daytime_key,daytime.title daytime_title,daytime.location_slug daytime_location_slug,
    daytime.display_home daytime_home,daytime.duration_minutes daytime_duration,
    evening.activity_key evening_key,evening.title evening_title,evening.location_slug evening_location_slug,
    evening.display_home evening_home,evening.duration_minutes evening_duration
  from day_grid
  left join lateral(
    select block.* from kivelle_port_schedule_blocks block
    where block.version_id=day_grid.version_id and day_grid.day_of_week=any(block.work_days)
    order by block.block_key limit 1
  ) occupation on true
  left join lateral(
    select activity.* from kivelle_port_schedule_activities activity
    where activity.version_id=day_grid.version_id and activity.valid_start<1020
    order by activity.is_custom desc,md5(day_grid.slug||':'||day_grid.day_of_week||':day:'||activity.activity_key)
    limit 1
  ) daytime on true
  left join lateral(
    select activity.* from kivelle_port_schedule_activities activity
    where activity.version_id=day_grid.version_id and activity.valid_end>960
      and activity.activity_key<>coalesce(daytime.activity_key,'')
    order by activity.is_custom desc,md5(day_grid.slug||':'||day_grid.day_of_week||':evening:'||activity.activity_key)
    limit 1
  ) evening on true
),calculated as(
  select base.*,least(1440,anchor_start+anchor_duration) anchor_end from base
)
select calculated.*,
  case when anchor_start is null then 'open_day'
    when anchor_start>840 then 'late_shift'
    when anchor_duration>540 or anchor_end>1110 then 'long_shift'
    else 'work_day' end day_shape
from calculated;

delete from public.together_schedule_templates schedule
using kivelle_port_schedule_characters character
where schedule.character_version_id=character.version_id;

with schedule_rows as(
  -- Open days retain a home rhythm while drawing two deterministic interests.
  select version_id,slug,day_of_week,1 slot,540 start_minute,630 end_minute,null::text location_slug,
    'home_morning'::text activity_key,'Starting the day at home'::text activity,'available'::text availability,
    1 energy_delta,'easy'::text mood_influence,'recurring_routine'::text priority,day_shape,'Home'::text display_location,
    jsonb_build_array('Starting the day slowly at home','Checking the day ahead at home','Making an easy start at home') activity_variants
  from kivelle_port_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,2,660,780,daytime_location_slug,coalesce(daytime_key,'coastal_walk'),
    coalesce(daytime_title,'Taking a walk above the water'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,jsonb_build_array(coalesce(daytime_title,'Taking a walk above the water'))
  from kivelle_port_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,3,810,930,null,'home_reset','Taking an afternoon reset at home','available',0,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Taking an afternoon reset at home','Catching up on a few things at home','Recharging at home between plans')
  from kivelle_port_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,4,1020,1170,evening_location_slug,coalesce(evening_key,daytime_key,'quiet_home'),
    coalesce(evening_title,daytime_title,'Having a quiet evening at home'),'available',1,'engaged','preferred_activity',day_shape,
    case when coalesce(evening_home,daytime_home,true) then 'Home' end,
    jsonb_build_array(coalesce(evening_title,daytime_title,'Having a quiet evening at home'))
  from kivelle_port_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,5,1230,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine',day_shape,'Home',
    jsonb_build_array('Winding down at home','Taking a quiet end to the day at home','Catching up at home before bed')
  from kivelle_port_schedule_days where day_shape='open_day'

  union all
  -- Standard work and class days leave space for one personal activity.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready at home','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready at home','Checking the day ahead at home','Starting the day with a plan')
  from kivelle_port_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,2,anchor_start,anchor_end,work_location_slug,'occupation_'||coalesce(block_key,'primary'),
    work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,work_variants
  from kivelle_port_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,3,anchor_end+30,least(anchor_end+120,1200),null,'post_work_reset','Resetting at home after work','available',-1,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Resetting at home after work','Taking a break at home','Recharging at home before the evening')
  from kivelle_port_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,4,least(1230,greatest(anchor_end+150,1020)),least(1320,least(1230,greatest(anchor_end+150,1020))+90),
    evening_location_slug,coalesce(evening_key,daytime_key,'quiet_home'),coalesce(evening_title,daytime_title,'Having a quiet evening at home'),
    'available',1,'engaged','preferred_activity',day_shape,case when coalesce(evening_home,daytime_home,true) then 'Home' end,
    jsonb_build_array(coalesce(evening_title,daytime_title,'Having a quiet evening at home'))
  from kivelle_port_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,5,1350,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine',day_shape,'Home',
    jsonb_build_array('Winding down at home','Taking a quiet end to the day at home','Getting ready for tomorrow at home')
  from kivelle_port_schedule_days where day_shape='work_day'

  union all
  -- Long obligations stay location-coherent and expose a real break.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready for a long shift','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready for a long shift','Starting early at home','Packing for a full workday')
  from kivelle_port_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,2,anchor_start,least(anchor_start+240,anchor_end-90),work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,work_variants
  from kivelle_port_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,3,least(anchor_start+240,anchor_end-90),least(anchor_start+240,anchor_end-90)+45,
    work_location_slug,'work_break','Taking a break during the shift','limited',0,'steady','recurring_routine',day_shape,null,
    jsonb_build_array('Taking a break during the shift','Catching a quick break at work')
  from kivelle_port_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,4,least(anchor_start+240,anchor_end-90)+45,
    case when anchor_end>=1380 then anchor_end-90 else anchor_end end,work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,work_variants
  from kivelle_port_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,5,
    case when anchor_end>=1380 then anchor_end-90 else anchor_end+30 end,
    case when anchor_end>=1380 then anchor_end else least(anchor_end+150,1410) end,
    case when anchor_end>=1380 then work_location_slug end,
    case when anchor_end>=1380 then 'occupation_'||coalesce(block_key,'primary') else 'post_shift_home' end,
    case when anchor_end>=1380 then 'Finishing the shift' else 'Recovering at home after the shift' end,
    case when anchor_end>=1380 then 'busy' else 'available' end,-1,
    case when anchor_end>=1380 then 'focused' else 'tired' end,
    case when anchor_end>=1380 then 'hard_obligation' else 'recurring_routine' end,day_shape,
    case when anchor_end<1380 then 'Home' end,
    case when anchor_end>=1380 then work_variants else jsonb_build_array('Recovering at home after the shift','Taking a quiet post-shift reset at home') end
  from kivelle_port_schedule_days where day_shape='long_shift'

  union all
  -- Nightlife and hospitality shifts keep the earlier day genuinely open.
  select version_id,slug,day_of_week,1,540,630,null,'home_morning','Starting the day at home','available',1,'easy','recurring_routine',day_shape,'Home',
    jsonb_build_array('Starting the day slowly at home','Taking an easy morning at home','Checking the day ahead at home')
  from kivelle_port_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,2,660,780,daytime_location_slug,coalesce(daytime_key,'coastal_walk'),
    coalesce(daytime_title,'Taking a walk above the water'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,jsonb_build_array(coalesce(daytime_title,'Taking a walk above the water'))
  from kivelle_port_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,3,greatest(810,anchor_start-120),anchor_start-30,null,'pre_shift_home','Getting ready at home before the shift','limited',0,'focused','recurring_routine',day_shape,'Home',
    jsonb_build_array('Getting ready at home before the shift','Taking a quiet reset before work','Checking the night''s plan at home')
  from kivelle_port_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,4,anchor_start,least(anchor_start+240,anchor_end-90),work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,work_variants
  from kivelle_port_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,5,least(anchor_start+240,anchor_end-90)+30,anchor_end,work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,work_variants
  from kivelle_port_schedule_days where day_shape='late_shift'
),valid_rows as(
  select * from schedule_rows
  where start_minute>=0 and end_minute<=1440 and end_minute>start_minute
),located_rows as(
  select row_data.*,location.id location_id
  from valid_rows row_data
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid
   and location.slug=row_data.location_slug
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,1,
  jsonb_strip_nulls(jsonb_build_object(
    'source','port_vervelle_authored_schedule_v1','scheduleMode','authored',
    'profileVisibility','visible','displayLocation',display_location,
    'activityKey',activity_key,'activityVariants',activity_variants,
    'priority',priority,'dayShape',day_shape,'slot',slot,
    'scheduleProfile','port_vervelle_life_v2'
  ))
from located_rows
on conflict(character_version_id,day_of_week,start_minute) do update set
  end_minute=excluded.end_minute,location_id=excluded.location_id,activity=excluded.activity,
  availability=excluded.availability,energy_delta=excluded.energy_delta,
  mood_influence=excluded.mood_influence,variation_weight=excluded.variation_weight,
  metadata=excluded.metadata;

-- Replace only future runtime projections. Current and historical activity,
-- plans, dates, scenes, and explicit overrides remain untouched.
delete from public.together_character_schedule_events event
using public.together_character_instances instance,public.together_character_templates template
where event.character_instance_id=instance.id and instance.character_template_id=template.id
  and template.slug in(select slug from kivelle_port_life_v2)
  and event.source in('generated','recurring') and event.starts_at>now();

update public.together_character_instances instance set
  life_engine_version='life_engine_v2',updated_at=now()
from public.together_character_templates template
where instance.character_template_id=template.id
  and template.slug in(select slug from kivelle_port_life_v2);

-- Refuse to ship partial schedules or cross-world activity references.
do $$
declare incomplete_count integer;
begin
  select count(*) into incomplete_count
  from(
    select character.version_id,day_number
    from kivelle_port_schedule_characters character cross join generate_series(0,6) day_number
    left join public.together_schedule_templates schedule
      on schedule.character_version_id=character.version_id and schedule.day_of_week=day_number
     and schedule.metadata->>'scheduleProfile'='port_vervelle_life_v2'
    group by character.version_id,day_number
    having count(schedule.id)<>5
  ) incomplete;
  if incomplete_count>0 then
    raise exception 'Port Vervelle authored schedules left % character-days without five blocks',incomplete_count;
  end if;

  select count(*) into incomplete_count
  from public.together_character_activity_templates activity
  join kivelle_port_schedule_characters character on character.version_id=activity.character_version_id
  left join lateral unnest(activity.location_slugs) as activity_location(slug) on true
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid and location.slug=activity_location.slug
  where activity.metadata->>'source'='port_vervelle_life_v2'
    and activity_location.slug is not null and location.id is null;
  if incomplete_count>0 then
    raise exception 'Port Vervelle Life Engine has % cross-world or unresolved activity locations',incomplete_count;
  end if;
end $$;

-- Interests become grounded recurring options. This stays data-driven: future
-- Port characters inherit the same mapping by publishing interests and places.
with interests as(
  select version.id as version_id,lower(item.interest) as interest,item.ordinality,
    'interest_'||trim(both '_' from regexp_replace(lower(item.interest),'[^a-z0-9]+','_','g')) as activity_key
  from kivelle_port_life_v2 profile
  join public.together_character_templates template on template.slug=profile.slug
  join public.together_character_versions version
    on version.character_template_id=template.id and version.version=template.current_published_version
  cross join lateral unnest(version.interests) with ordinality item(interest,ordinality)
  where item.ordinality<=5
),presented as(
  select interests.*,
    case interest
      when 'swimming' then 'Taking a swim at Cala Bianca'
      when 'old movies' then 'Catching an old film at Piccolo Cinema'
      when 'cooking' then 'Trying a new recipe at home'
      when 'harbor gossip' then 'Catching up on harbor news'
      when 'sailing' then 'Taking a sail beyond Porto Marina'
      when 'freediving' then 'Freediving off Cala Bianca'
      when 'photography' then 'Taking coastal photographs'
      when 'spontaneous trips' then 'Planning an unplanned trip from the marina'
      when 'pastry' then 'Testing a pastry idea at Forno Bellini'
      when 'fashion' then 'Browsing a new atelier look'
      when 'dancing' then 'Going dancing at Maison Rouge'
      when 'dance' then 'Going dancing at Maison Rouge'
      when 'beach afternoons' then 'Stretching out an afternoon at Solana Beach'
      when 'guitar' then 'Playing guitar at Blue Lantern'
      when 'travel' then 'Planning a future trip by the marina'
      when 'luxury travel' then 'Comparing faraway hotels over coffee'
      when 'wine' then 'Trying a Domaine Vervelle wine'
      when 'storms' then 'Watching weather gather near the lighthouse'
      when 'family traditions' then 'Helping with a family tradition at Casa del Mare'
      when 'entertaining' then 'Hosting friends for a long evening'
      when 'novels' then 'Reading in Libreria Vervelle''s courtyard'
      when 'poetry' then 'Reading poetry in the bookshop courtyard'
      when 'journaling' then 'Writing in a journal over coffee'
      when 'people-watching' then 'People-watching from Cafe Marelle'
      when 'couture' then 'Studying couture details at the atelier'
      when 'vintage clothing' then 'Hunting for a vintage detail'
      when 'sketching' then 'Sketching in the old town'
      when 'running' then 'Running the Bellavista paths'
      when 'gardening' then 'Working among the Belvedere gardens'
      when 'local history' then 'Tracing local history around Piazza Aurelia'
      when 'architecture' then 'Studying restoration details in the old town'
      when 'politics' then 'Following a town debate at Palazzo Civico'
      when 'restoration' then 'Inspecting a restoration project'
      when 'literature' then 'Writing among the Libreria shelves'
      when 'cafés' then 'Writing from a cafe table'
      when 'night walks' then 'Walking Piazza Aurelia after dark'
      when 'volleyball' then 'Playing beach volleyball at Spiaggia Solana'
      when 'cocktails' then 'Trying a new cocktail at Velours'
      when 'nightlife' then 'Following the night into La Sirena'
      when 'surfing' then 'Surfing before the Solana crowds arrive'
      when 'festivals' then 'Checking out a festival near the beach'
      when 'handmade jewelry' then 'Making jewelry at Studio Ondine'
      when 'electronic music' then 'Listening to a new electronic set'
      when 'motorcycles' then 'Taking a motorcycle along the coast'
      when 'mixology' then 'Working through a new cocktail idea'
      when 'jazz' then 'Listening to jazz at Velours'
      when 'perfume' then 'Comparing perfume notes at the atelier'
      when 'vintage fashion' then 'Hunting for a vintage fashion detail'
      when 'costumes' then 'Working through a new stage costume'
      when 'theater' then 'Watching a rehearsal at Maison Rouge'
      when 'indie music' then 'Catching a small set at Blue Lantern'
      when 'sunsets' then 'Chasing the last light at Faro Vervelle'
      when 'portraiture' then 'Scouting a portrait at Studio Lucent'
      when 'art' then 'Studying new work at Studio Ondine'
      when 'flowers' then 'Experimenting with flowers at Fiore and Fig'
      when 'painting' then 'Painting at Studio Ondine'
      when 'baking' then 'Baking something at Forno Bellini'
      when 'picnics' then 'Putting together a picnic at Belvedere Garden'
      when 'pilates' then 'Taking a focused Pilates session'
      when 'hiking' then 'Hiking toward Faro Vervelle'
      when 'food' then 'Trying somewhere new for dinner'
      when 'ridiculous competitions' then 'Turning a beach afternoon into a competition'
      when 'antiques' then 'Hunting for an overlooked antique'
      when 'dinner parties' then 'Hosting a Bellavista dinner party'
      when 'scooters' then 'Taking a scooter along the harbor road'
      when 'rock music' then 'Catching a loud set at La Sirena'
      when 'football' then 'Joining a beach football match'
      when 'tattoos' then 'Sketching a tattoo idea at Studio Ondine'
      when 'medicine' then 'Catching up on medical reading at the clinic'
      when 'classical music' then 'Listening to a quiet classical program'
      when 'fitness' then 'Training at Bellavista Fitness Club'
      when 'kayaking' then 'Taking a kayak beyond Solana Beach'
      when 'concerts' then 'Catching a live show at La Sirena'
      when 'beaches' then 'Spending time at Spiaggia Solana'
      when 'sketching strangers' then 'Sketching people around Piazza Aurelia'
      when 'historic restoration' then 'Inspecting a historic restoration'
      when 'museums' then 'Studying a small exhibition at Studio Ondine'
      when 'languages' then 'Practicing a language over coffee'
      when 'horses' then 'Spending time with the Domaine horses'
      when 'folk music' then 'Listening to folk music at La Pergola'
      when 'restaurants' then 'Trying a restaurant off the usual route'
      when 'hospitality' then 'Studying the details of a well-run hotel'
      when 'art collecting' then 'Looking over a possible addition to a collection'
      when 'wellness' then 'Taking a quiet wellness hour at Celeste Spa'
      else 'Making time for '||interest
    end as label,
    case
      when interest in('swimming','freediving') then 'cala-bianca'
      when interest='old movies' then 'piccolo-cinema'
      when interest in('cooking','food','restaurants','family traditions') then 'casa-del-mare'
      when interest in('harbor gossip','night walks','people-watching','local history') then 'harbor-steps'
      when interest in('sailing','spontaneous trips','travel','motorcycles') then 'porto-marina'
      when interest in('pastry','baking') then 'forno-bellini'
      when interest in('fashion','couture','vintage clothing','perfume','vintage fashion','costumes') then 'atelier-amelie'
      when interest in('dancing','dance','theater') then 'maison-rouge'
      when interest in('beach afternoons','beaches','volleyball','surfing','football','festivals','ridiculous competitions') then 'spiaggia-solana'
      when interest in('guitar','indie music') then 'blue-lantern'
      when interest in('wine','gardening','horses') then 'domaine-vervelle'
      when interest in('novels','poetry','literature') then 'libreria-vervelle'
      when interest in('journaling','cafés','languages') then 'cafe-marelle'
      when interest in('sketching','painting','art','museums','tattoos','handmade jewelry','art collecting') then 'studio-ondine'
      when interest in('running','picnics') then 'belvedere-garden'
      when interest in('architecture','politics','restoration','historic restoration') then 'palazzo-civico'
      when interest in('cocktails','mixology','jazz','classical music') then 'velours'
      when interest in('nightlife','electronic music','rock music','concerts') then 'la-sirena'
      when interest in('photography','portraiture') then 'studio-lucent'
      when interest in('storms','sunsets','hiking') then 'faro-vervelle'
      when interest in('pilates','fitness') then 'bellavista-fitness-club'
      when interest='scooters' then 'officina-moretti'
      when interest='medicine' then 'vervelle-general-clinic'
      when interest='kayaking' then 'solana-beach-rentals'
      when interest='flowers' then 'fiore-and-fig'
      when interest='folk music' then 'la-pergola'
      when interest in('entertaining','dinner parties') then 'villa-mirabelle'
      when interest in('luxury travel','hospitality') then 'hotel-celeste'
      when interest='wellness' then 'celeste-spa'
      else 'piazza-aurelia'
    end as location_slug,
    case
      when interest in('nightlife','electronic music','rock music','concerts','dancing','dance','jazz','theater','folk music') then 'nightlife'
      when interest in('swimming','freediving','sailing','surfing','volleyball','running','pilates','hiking','fitness','kayaking','football','ridiculous competitions') then 'fitness'
      when interest in('cooking','pastry','baking','food','wine','cocktails','mixology','restaurants') then 'food'
      when interest in('fashion','couture','vintage clothing','sketching','photography','portraiture','art','painting','costumes','handmade jewelry','art collecting','tattoos') then 'creative'
      when interest in('novels','poetry','literature','old movies','museums','local history','historic restoration','architecture') then 'culture'
      when interest in('medicine','politics','languages') then 'learning'
      else 'personal'
    end as category,
    case when interest in('nightlife','electronic music','rock music','concerts','dancing','dance','jazz','theater','folk music') then 1020 else 540 end as start_minute,
    case when interest in('nightlife','electronic music','rock music','concerts','dancing','dance','jazz','theater','folk music') then 1410 else 1260 end as end_minute
  from interests
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select presented.version_id,presented.activity_key,presented.label,presented.category,
  jsonb_build_array(jsonb_build_object('startMinute',presented.start_minute,'endMinute',presented.end_minute)),
  int4range(60,case when presented.category='nightlife' then 181 else 121 end,'[]'),
  array[presented.category],array[presented.location_slug],array[presented.category,presented.interest],
  .84,int4range(0,3,'[]'),case when presented.ordinality=1 then 2 else 3 end,
  case when presented.ordinality=1 then 36 else 24 end,null,'either',
  case when presented.category='nightlife' then 'social_event' else 'preferred_activity' end,
  case when presented.ordinality=1 then 'hint' else 'hidden' end,'open',
  jsonb_build_object(
    'source','port_vervelle_life_v2','activityLabel',presented.label,
    'upcomingHint','Might make time for '||presented.interest||' later',
    'rare',presented.ordinality=1,'outcomeEligible',presented.ordinality<=2,
    'outcomeProbability',case when presented.ordinality=1 then .12 else .08 end,
    'outcomeSignificance',.52,
    'outcomeVariants',case when presented.ordinality<=2
      then jsonb_build_array('Something unplanned made the outing more memorable than expected.') else '[]'::jsonb end
  )
from presented
join public.together_locations location
  on location.world_id='10000000-0000-4000-8000-000000000008'::uuid and location.slug=presented.location_slug
on conflict(character_version_id,activity_key) do update set
  title=excluded.title,category=excluded.category,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_categories=excluded.location_categories,
  location_slugs=excluded.location_slugs,tags=excluded.tags,affinity=excluded.affinity,
  preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

-- Replace the generic free-time projection with deterministic character
-- interests now that the complete activity bank is available.
with replacements as(
  select schedule.id,activity.title,activity.location_slugs[1] location_slug,
    activity.activity_key,location.id location_id
  from public.together_schedule_templates schedule
  join kivelle_port_schedule_characters character on character.version_id=schedule.character_version_id
  cross join lateral(
    select candidate.*
    from public.together_character_activity_templates candidate
    where candidate.character_version_id=character.version_id
      and left(candidate.activity_key,9)='interest_'
      and coalesce(array_length(candidate.location_slugs,1),0)>0
    order by md5(character.slug||':'||schedule.day_of_week||':'||coalesce(schedule.metadata->>'slot','')||':'||candidate.activity_key)
    limit 1
  ) activity
  join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid
   and location.slug=activity.location_slugs[1]
  where schedule.metadata->>'source'='port_vervelle_authored_schedule_v1'
    and schedule.metadata->>'priority'='preferred_activity'
)
update public.together_schedule_templates schedule set
  location_id=replacements.location_id,activity=replacements.title,
  metadata=schedule.metadata||jsonb_build_object(
    'activityKey',replacements.activity_key,'activityVariants',jsonb_build_array(replacements.title)
  )
from replacements where schedule.id=replacements.id;

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from public.together_character_activity_templates activity
  join kivelle_port_schedule_characters character on character.version_id=activity.character_version_id
  left join lateral unnest(activity.location_slugs) as activity_location(slug) on true
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008'::uuid and location.slug=activity_location.slug
  where activity.metadata->>'source'='port_vervelle_life_v2'
    and activity_location.slug is not null and location.id is null;
  if invalid_count>0 then
    raise exception 'Port Vervelle Life Engine has % unresolved activity locations after enrichment',invalid_count;
  end if;

  select count(*) into invalid_count
  from public.together_schedule_templates schedule
  join kivelle_port_schedule_characters character on character.version_id=schedule.character_version_id
  where schedule.metadata->>'source'='port_vervelle_authored_schedule_v1'
    and schedule.metadata->>'priority'='preferred_activity'
    and left(coalesce(schedule.metadata->>'activityKey',''),9)<>'interest_';
  if invalid_count>0 then
    raise exception 'Port Vervelle authored schedules left % free-time blocks without character interests',invalid_count;
  end if;
end $$;

with occupation as(
  select profile.slug,'occupation_primary'::text activity_key,profile.work_slug location_slug,
    profile.start_min,least(1440,profile.start_max+profile.duration_max) end_min,
    profile.duration_min,profile.duration_max,profile.work_variants
  from kivelle_port_life_v2 profile
  union all
  select profile.slug,'occupation_secondary',profile.second_slug,profile.second_start_min,
    least(1440,profile.second_start_max+profile.second_duration_max),
    profile.second_duration_min,profile.second_duration_max,profile.second_variants
  from kivelle_port_life_v2 profile where profile.second_slug is not null
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,occupation.activity_key,occupation.work_variants[1],'work',
  jsonb_build_array(jsonb_build_object('startMinute',occupation.start_min,'endMinute',occupation.end_min)),
  int4range(occupation.duration_min,occupation.duration_max+1,'[]'),array['work'],array[occupation.location_slug],
  array['work',occupation.activity_key],.94,int4range(1,6,'[]'),6,12,null,'solo',
  'recurring_routine','known','busy',jsonb_build_object(
    'source','port_vervelle_life_v2','activityLabel',occupation.work_variants[1],
    'upcomingHint','Might be working later','activityVariants',to_jsonb(occupation.work_variants),
    'outcomeEligible',false
  )
from occupation
join public.together_character_templates template on template.slug=occupation.slug
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version
on conflict(character_version_id,activity_key) do update set
  title=excluded.title,category=excluded.category,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_categories=excluded.location_categories,
  location_slugs=excluded.location_slugs,tags=excluded.tags,affinity=excluded.affinity,
  preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from kivelle_port_schedule_characters character
  where (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=character.version_id
           and activity.metadata->>'source'='port_vervelle_life_v2') not between 9 and 11;
  if invalid_count>0 then
    raise exception 'Port Vervelle Life Engine left % residents outside the 9-11 activity target',invalid_count;
  end if;
end $$;

commit;
