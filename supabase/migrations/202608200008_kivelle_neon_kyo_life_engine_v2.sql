begin;

-- NEON KYO Life Engine V2. The authored calendar is a seven-day projection
-- for profile UI and recurring fallback. Runtime schedules remain dynamic,
-- account-scoped, and are materialized only after a user meets a resident.
create temporary table kivelle_neon_life_v2(
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
  second_variants text[]
) on commit drop;

insert into kivelle_neon_life_v2 values
('aya-mori','fixed_weekdays','maison-vice',array[1,2,3,4,5],630,690,450,510,array['Styling the Maison Vice floor before the rush','Building a projected look for a difficult client','Scouting new talent between styling appointments'],'meal',null,null,null,null,null,null,null),
('emi-takahashi','shifts','pulse-arcade',array[2,3,4,5,6],810,870,450,510,array['Opening a competitive floor at Pulse Arcade','Running the neural-game brackets','Closing out a loud tournament shift'],'meal',null,null,null,null,null,null,null),
('chloe-mercier','fixed_weekdays','mirror-hikari',array[1,2,3,4,5],690,750,450,510,array['Directing a projected styling session at Mirror','Building a look that survives every filter','Reviewing a difficult fashion concept at Mirror'],'meal',null,null,null,null,null,null,null),
('rika-senzaki','roaming_weekdays','hikari-crossing',array[1,3,5],510,570,480,540,array['Auditing the advertising mesh at Hikari Crossing','Tracing a suspicious biometric response through Hikari','Testing a privacy fault inside the public AR grid'],'meal','hikari-skybridge',array[2,4],510,570,480,540,array['Inspecting the Skybridge sensor lattice','Running a high-altitude AR diagnostic','Following an anomalous data trail across Hikari Skybridge']),
('noa-7','night_shifts','hikari-capsule-club',array[0,3,4,5,6],1170,1230,450,510,array['Preparing anonymous arrivals at Hikari Capsule Club','Anticipating guest needs through the overnight shift','Closing the quietest hours at the Capsule Club'],'none',null,null,null,null,null,null,null),
('sora-hayashi','nightlife','velvet-static',array[0,4,5,6],1290,1350,330,390,array['Building the opening movement at Velvet Static','Reading the room from the Velvet Static booth','Taking the club through its final set'],'none',null,null,null,null,null,null,null),
('yumi-kato','night_shifts','room-thirteen',array[2,3,4,5,6],1110,1170,450,510,array['Preparing Room 13 before the unmarked door opens','Mixing private-room cocktails and reading the room','Closing Room 13 after the last confidential table'],'none',null,null,null,null,null,null,null),
('mina-seo','nightlife','eden-shinjira',array[0,3,4,5,6],1170,1230,390,450,array['Calibrating Eden before the first guests arrive','Designing a responsive sensory environment at Eden','Shutting down the club sensory systems after hours'],'none',null,null,null,null,null,null,null),
('elena-volkov','hospitality','hotel-nocturne',array[1,2,3,4,5],1020,1050,450,510,array['Reviewing private arrivals at Hotel Nocturne','Solving a discreet guest problem at Nocturne','Closing the concierge ledger after midnight'],'meal',null,null,null,null,null,null,null),
('zhen-li','gray_market_shifts','ghost-line',array[2,3,4,5,6],1050,1110,450,510,array['Opening a concealed neural-repair bench at Ghost Line','Repairing hardware a corporate clinic rejected','Scrubbing the workbench before the market closes'],'none','the-backroom',array[1],840,900,330,390,array['Taking a difficult off-book repair at The Backroom','Testing an isolated implant at The Backroom']),
('reina-kuroda','fixed_weekdays','aoyama-modification-institute',array[1,2,3,4,5],510,570,510,570,array['Reviewing an expressive prosthetic concept','Prototyping a matte-black articulation system','Debating a design review at the Modification Institute'],'meal',null,null,null,null,null,null,null),
('piper-shaw','student_shifts','the-atrium',array[1,2,3,4,5],810,870,270,330,array['Working the responsive-fashion boutique at The Atrium','Helping a client test an augmented fabric','Closing the boutique after the evening rush'],'meal','maison-vice',array[1,3,5],540,570,150,210,array['Attending a fashion-tech studio session','Testing a responsive-clothing prototype at Maison Vice']),
('lexi-morgan','student_schedule','aoyama-modification-institute',array[1,2,3,4],510,570,330,390,array['Training in augmentation design at the Institute','Sketching a prosthetic mechanism in the design lab','Reviewing an assistive-design prototype'],'meal',null,null,null,null,null,null,null),
('vittoria-bellandi','gallery_schedule','gallery-null',array[2,3,4,5,6],690,750,510,570,array['Preparing Gallery Null before the private opening','Curating a neural-art installation','Talking a collector out of misunderstanding the work'],'meal',null,null,null,null,null,null,null),
('eva-aoyama','nightlife','halo-aoyama',array[0,3,4,5,6],1050,1110,450,510,array['Preparing Halo for its evening guests','Hosting a room full of strategically interesting strangers','Closing Halo after choosing one unoptimized conversation'],'none',null,null,null,null,null,null,null),
('yuna-park','fixed_weekdays','dollhouse-robotics',array[1,2,3,4,5],510,570,570,630,array['Running assistive-robotics diagnostics at Dollhouse','Testing a companion autonomy safeguard','Documenting an uncomfortable synthetic-behavior result'],'meal',null,null,null,null,null,null,null),
('rin-akiyama','mixed_consulting','zeroday',array[4,5,6],1170,1230,390,450,array['Opening the isolated ZeroDay network','Working the ZeroDay bar behind an unrecorded subnet','Closing the bar after the last privacy argument'],'none','hikari-crossing',array[1,2,3],600,660,330,390,array['Auditing a corporate network from Hikari Crossing','Running an ordinary-looking security consultation','Following a privacy exploit through the public mesh']),
('natsumi-endo','studio_shifts','chrome-kiss',array[2,3,4,5,6],690,750,450,510,array['Preparing the body-art stations at Chrome Kiss','Designing a reactive subdermal tattoo','Testing how a finished piece moves under changing light'],'meal',null,null,null,null,null,null,null),
('laleh-rahimi','creative_weekdays','dreamscape',array[1,2,3,4],630,690,510,570,array['Storyboarding a shared neural environment','Authoring an unpredictable Dreamscape sequence','Testing whether a designed fantasy still feels honest'],'meal',null,null,null,null,null,null,null),
('kira-3','event_schedule','nova-arena',array[3,5,6],990,1050,330,390,array['Preparing predictive models before a Nova Arena match','Analyzing elite play from the Nova Arena desk','Discarding the model to watch an impossible final round'],'meal',null,null,null,null,null,null,null),
('mia-lindstrom','night_shifts','twentyfour',array[2,3,4,5,6],1170,1230,390,450,array['Taking over the late TwentyFour counter','Working the fluorescent quiet hours at TwentyFour','Collecting the store sounds before the night shift ends'],'none',null,null,null,null,null,null,null),
('mika-sato','early_shifts','kumo-gym',array[1,2,3,4,5],330,390,450,510,array['Opening Kumo Gym for the early tower crowd','Coaching a biometric training session','Finishing the midday performance block at Kumo Gym'],'meal',null,null,null,null,null,null,null),
('ana-luiza-ribeiro','night_shifts','quiet-hours',array[2,3,4,5,6],1050,1110,450,510,array['Opening Quiet Hours before the neighborhood arrives','Working the bar and keeping neighborhood confidences','Closing the basement bar after the last regular leaves'],'none',null,null,null,null,null,null,null),
('mei-watanabe','early_shifts','laundry-nine',array[1,2,3,4],390,450,390,450,array['Opening the Laundry 9 vending cafe','Serving coffee and watching unguarded moments','Finishing the cafe shift with a camera full of almost-photographs'],'meal',null,null,null,null,null,null,null),
('freya-keller','rotating_weekdays','hikari-skybridge',array[1,3,5],450,510,570,630,array['Inspecting vertical infrastructure above Hikari','Working outside the tower skin in high wind','Certifying a Skybridge stabilization repair'],'meal','the-atrium',array[2,4],450,510,570,630,array['Servicing The Atrium vertical systems','Testing a balance array above The Atrium roofline']),
('akari-fujimoto','owner_schedule','soba-miyako',array[0,2,3,4,5,6],570,630,690,750,array['Opening the fifteen-seat Soba Miyako kitchen','Running the lunch and dinner service at Soba Miyako','Closing the kitchen after the final bowl'],'meal',null,null,null,null,null,null,null),
('fumi-arai','morning_schedule','tsukimi-shrine',array[0,2,3,4,5,6],330,390,330,390,array['Opening Tsukimi Shrine before the city wakes','Tending the shrine and recording its living history','Closing the morning ledger at Tsukimi Shrine'],'meal','paper-moon-books',array[1],780,840,210,270,array['Researching Old Kyo accounts at Paper Moon Books','Comparing oral history with a physical archive']),
('isabella-reyes','project_weekdays','ryokan-kaze',array[1,3,5],450,510,570,630,array['Directing restoration work at Ryokan Kaze','Reviewing a difficult timber repair','Resolving a preservation conflict on site'],'meal','tsukimi-shrine',array[2,4],450,510,570,630,array['Surveying restoration work at Tsukimi Shrine','Reviewing historic joinery at the shrine']),
('talia-okafor','performance_schedule','below-kyo',array[0,3,4,5,6],1050,1110,450,510,array['Soundchecking an underground room Below Kyo','Performing and producing a live set Below Kyo','Breaking down the set after the tunnels empty'],'none',null,null,null,null,null,null,null),
('iori','day_schedule','koi-garden',array[2,3,4,5,6],330,390,570,630,array['Opening Koi Garden before the public arrives','Maintaining the garden living systems','Recording ecological changes before the evening quiet'],'meal',null,null,null,null,null,null,null);

do $$
declare missing_count integer;
begin
  if (select count(*) from kivelle_neon_life_v2)<>30 then
    raise exception 'NEON KYO Life Engine profile must contain all 30 residents';
  end if;

  select count(*) into missing_count
  from kivelle_neon_life_v2 profile
  left join public.together_character_templates template on template.slug=profile.slug
  left join public.together_locations work
    on work.world_id='10000000-0000-4000-8000-000000000009'::uuid and work.slug=profile.work_slug
  left join public.together_locations secondary
    on secondary.world_id='10000000-0000-4000-8000-000000000009'::uuid and secondary.slug=profile.second_slug
  where template.id is null or work.id is null or (profile.second_slug is not null and secondary.id is null);
  if missing_count>0 then
    raise exception 'NEON KYO Life Engine has % unresolved residents or work locations',missing_count;
  end if;
end $$;

-- Make full overnight durations canonical for dynamic generation. The visible
-- calendar below represents post-midnight time as a continuation on the next
-- local day because schedule templates cannot cross midnight.
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
        'scheduleBlocks',jsonb_build_array(jsonb_build_object(
          'key','primary','title',template.occupation,'activityKey','occupation_primary',
          'workDays',to_jsonb(profile.work_days),
          'startRange',jsonb_build_object('startMinute',profile.start_min,'endMinute',profile.start_max),
          'durationMinutes',jsonb_build_array(profile.duration_min,profile.duration_max),
          'primaryLocationSlug',profile.work_slug,'activityVariants',to_jsonb(profile.work_variants),
          'breakPolicy',profile.break_policy,'visibility','known','interruptibility','busy',
          'metadata',jsonb_build_object('upcomingHint','Has work later','scheduleProfile','neon_kyo_life_v2')
        )) || case when profile.second_slug is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
          'key','secondary','title',template.occupation,'activityKey','occupation_secondary',
          'workDays',to_jsonb(profile.second_days),
          'startRange',jsonb_build_object('startMinute',profile.second_start_min,'endMinute',profile.second_start_max),
          'durationMinutes',jsonb_build_array(profile.second_duration_min,profile.second_duration_max),
          'primaryLocationSlug',profile.second_slug,'activityVariants',to_jsonb(profile.second_variants),
          'breakPolicy','none','visibility','known','interruptibility','busy',
          'metadata',jsonb_build_object('upcomingHint','Has another commitment later','scheduleProfile','neon_kyo_life_v2')
        )) end
      ),true
    ),
    '{scheduling}',
    coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
      'repetitionTolerance',.22,'preferredDailyActivityCount',jsonb_build_array(3,5),
      'generationVersion','life_engine_v2','scheduleProfile','neon_kyo_life_v2'
    ),true
  ),updated_at=now()
from public.together_character_templates template,kivelle_neon_life_v2 profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

update public.together_character_versions version set life_config=jsonb_set(version.life_config,'{sleep}',
  case
    when profile.start_min>=990 then jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',240,'endMinute',360),
      'preferredWakeTime',jsonb_build_object('startMinute',660,'endMinute',780),
      'variabilityMinutes',35,'weekendShiftMinutes',30)
    when profile.start_min<=420 then jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',1200,'endMinute',1320),
      'preferredWakeTime',jsonb_build_object('startMinute',240,'endMinute',360),
      'variabilityMinutes',25,'weekendShiftMinutes',45)
    else jsonb_build_object(
      'preferredBedtime',jsonb_build_object('startMinute',1320,'endMinute',60),
      'preferredWakeTime',jsonb_build_object('startMinute',390,'endMinute',510),
      'variabilityMinutes',35,'weekendShiftMinutes',60)
  end,true),updated_at=now()
from public.together_character_templates template,kivelle_neon_life_v2 profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

update public.together_character_world_presence presence set
  metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
    'scheduleProfile','neon_kyo_life_v2','dynamicSchedule',true,'authoredCalendar',true
  ),updated_at=now()
from public.together_character_versions version,public.together_character_templates template,kivelle_neon_life_v2 profile
where presence.character_version_id=version.id and version.character_template_id=template.id
  and template.slug=profile.slug and presence.world_id='10000000-0000-4000-8000-000000000009'::uuid;

-- Promote the launch routines into the V2 activity bank, then replace work
-- timing with the richer profiles above.
update public.together_character_activity_templates activity set
  metadata=activity.metadata||jsonb_build_object('source','neon_kyo_life_v2','scheduleProfile','neon_kyo_life_v2'),
  updated_at=now()
from public.together_character_versions version,public.together_character_templates template,kivelle_neon_life_v2 profile
where activity.character_version_id=version.id and version.character_template_id=template.id
  and template.slug=profile.slug and activity.metadata->>'source'='neon_kyo_character_roster';

with occupation as(
  select profile.slug,'occupation_primary'::text activity_key,profile.work_slug location_slug,
    profile.start_min,profile.start_max+profile.duration_max end_min,
    profile.duration_min,profile.duration_max,profile.work_variants
  from kivelle_neon_life_v2 profile
  union all
  select profile.slug,'occupation_secondary',profile.second_slug,profile.second_start_min,
    profile.second_start_max+profile.second_duration_max,
    profile.second_duration_min,profile.second_duration_max,profile.second_variants
  from kivelle_neon_life_v2 profile where profile.second_slug is not null
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,occupation.activity_key,occupation.work_variants[1],'work',
  jsonb_build_array(jsonb_build_object('startMinute',occupation.start_min,'endMinute',least(1440,occupation.end_min))),
  int4range(occupation.duration_min,occupation.duration_max+1,'[]'),array['work'],array[occupation.location_slug],
  array['work',occupation.activity_key],.96,int4range(1,6,'[]'),6,12,null,'solo',
  'recurring_routine','known','busy',jsonb_build_object(
    'source','neon_kyo_life_v2','scheduleProfile','neon_kyo_life_v2',
    'activityLabel',occupation.work_variants[1],'upcomingHint','Has work later',
    'activityVariants',to_jsonb(occupation.work_variants),'outcomeEligible',false,
    'spansMidnight',occupation.end_min>1440,'canonicalEndMinute',occupation.end_min
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

-- Ground each resident's first five interests in a canonical city location.
-- This gives dynamic generation a larger personal activity bank while keeping
-- every choice inside NEON KYO.
with interests as(
  select version.id version_id,template.slug,lower(item.interest) interest,item.ordinality,
    'interest_'||trim(both '_' from regexp_replace(lower(item.interest),'[^a-z0-9]+','_','g')) activity_key
  from kivelle_neon_life_v2 profile
  join public.together_character_templates template on template.slug=profile.slug
  join public.together_character_versions version
    on version.character_template_id=template.id and version.version=template.current_published_version
  cross join lateral unnest(version.interests) with ordinality item(interest,ordinality)
  where item.ordinality<=5
),presented as(
  select interests.*,
    case
      when interest~'photograph|people-watching|architecture|rooftop|train spotting' then 'Hunting for an unfiltered city frame'
      when interest~'fashion|makeup|perfume|jewelry|costume' then 'Looking for a style choice that still feels personal'
      when interest~'music|jazz|vinyl|synth|karaoke|dancing|poetry|performance' then 'Following a sound the recommendation grid missed'
      when interest~'game|esports|arcade|competition|reality television' then 'Turning a free hour into a competition'
      when interest~'robot|electronic|cyber|hardware|engineering|prosthetic|industrial design|mechanical' then 'Tinkering with '||interest||' off the clock'
      when interest~'swim|fitness|boxing|running|climbing|skating|football|racing|motorcycle' then 'Making time for '||interest||' away from work'
      when interest~'food|cook|cocktail|wine|mezcal|gossip|baseball' then 'Following a craving for '||interest
      when interest~'book|novel|film|history|folklore|calligraphy|ceramic|philosophy|psychology|science fiction|magazine' then 'Going offline to spend time with '||interest
      when interest~'plant|garden|koi|bird|rain|storm|moon|dream|astronomy' then 'Stepping out of the signal noise for '||interest
      else 'Making private time for '||interest
    end label,
    case
      when interest~'photograph|people-watching' then 'hikari-crossing'
      when interest~'architecture|history|folklore|calligraphy|ceramic|woodworking|old neighborhood' then 'lantern-street'
      when interest~'fashion|makeup|perfume|jewelry|costume|vintage magazine' then 'maison-vice'
      when interest~'music|jazz|vinyl|synth|karaoke|dancing|poetry|performance|club' then 'below-kyo'
      when interest~'game|esports|arcade|competition|reality television|learning jokes' then 'pulse-arcade'
      when interest~'robot' then 'dollhouse-robotics'
      when interest~'electronic|cyber|hardware|engineering|prosthetic|industrial design|mechanical|augmentation' then 'zeroday'
      when interest~'swim' then 'moonpool'
      when interest~'fitness|boxing|running|climbing|skating|football|racing' then 'kumo-gym'
      when interest~'motorcycle|late-night train|train spotting' then 'ghost-line'
      when interest~'food|cook|spicy|fried|cocktail|wine|mezcal|gossip|baseball' then 'soba-miyako'
      when interest~'book|novel|film|philosophy|psychology|science fiction' then 'paper-moon-books'
      when interest~'plant|garden|koi|bird|rain|storm|moon|dream|astronomy' then 'koi-garden'
      else 'tea-house-aoi'
    end location_slug,
    case
      when interest~'music|jazz|vinyl|synth|karaoke|dancing|performance|club' then 'nightlife'
      when interest~'game|esports|arcade|competition' then 'gaming'
      when interest~'robot|electronic|cyber|hardware|engineering|prosthetic|industrial design|mechanical|augmentation' then 'technology'
      when interest~'swim|fitness|boxing|running|climbing|skating|football|racing|motorcycle' then 'fitness'
      when interest~'food|cook|spicy|fried|cocktail|wine|mezcal' then 'food'
      when interest~'fashion|makeup|perfume|jewelry|costume|photograph' then 'creative'
      when interest~'book|novel|film|history|folklore|calligraphy|ceramic|poetry|philosophy|psychology|architecture' then 'culture'
      else 'personal'
    end category,
    case when interest~'music|jazz|vinyl|synth|karaoke|dancing|performance|club|cocktail|wine|mezcal' then 1020 else 540 end start_minute,
    case when interest~'music|jazz|vinyl|synth|karaoke|dancing|performance|club|cocktail|wine|mezcal' then 1410 else 1260 end end_minute
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
  .88,int4range(0,3,'[]'),case when presented.ordinality=1 then 2 else 3 end,
  case when presented.ordinality=1 then 36 else 24 end,null,'either',
  case when presented.category='nightlife' then 'social_event' else 'preferred_activity' end,
  case when presented.ordinality=1 then 'hint' else 'hidden' end,'open',
  jsonb_build_object(
    'source','neon_kyo_life_v2','scheduleProfile','neon_kyo_life_v2',
    'activityLabel',presented.label,'upcomingHint','May make time for '||presented.interest||' later',
    'rare',presented.ordinality=1,'outcomeEligible',presented.ordinality<=2,
    'outcomeProbability',case when presented.ordinality=1 then .14 else .09 end,
    'outcomeSignificance',.54,
    'outcomeVariants',case when presented.ordinality<=2
      then jsonb_build_array('Something unplanned made the outing feel more honest than the city intended.') else '[]'::jsonb end
  )
from presented
join public.together_locations location
  on location.world_id='10000000-0000-4000-8000-000000000009'::uuid and location.slug=presented.location_slug
on conflict(character_version_id,activity_key) do update set
  title=excluded.title,category=excluded.category,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_categories=excluded.location_categories,
  location_slugs=excluded.location_slugs,tags=excluded.tags,affinity=excluded.affinity,
  preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

create temporary table kivelle_neon_schedule_characters on commit drop as
select version.id version_id,template.slug,template.occupation
from kivelle_neon_life_v2 profile
join public.together_character_templates template on template.slug=profile.slug
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version;

create temporary table kivelle_neon_schedule_blocks on commit drop as
select character.version_id,profile.slug,profile.work_days,profile.start_min,profile.start_max,
  profile.duration_min,profile.duration_max,profile.work_slug location_slug,
  to_jsonb(profile.work_variants) work_variants,'primary'::text block_key
from kivelle_neon_life_v2 profile join kivelle_neon_schedule_characters character on character.slug=profile.slug
union all
select character.version_id,profile.slug,profile.second_days,profile.second_start_min,profile.second_start_max,
  profile.second_duration_min,profile.second_duration_max,profile.second_slug,
  to_jsonb(profile.second_variants),'secondary'
from kivelle_neon_life_v2 profile join kivelle_neon_schedule_characters character on character.slug=profile.slug
where profile.second_slug is not null;

create temporary table kivelle_neon_schedule_activities on commit drop as
select character.version_id,character.slug,activity.activity_key,
  coalesce(nullif(activity.metadata->>'activityLabel',''),activity.title) title,
  activity.category,coalesce((activity.valid_time_windows->0->>'startMinute')::int,600) valid_start,
  coalesce((activity.valid_time_windows->0->>'endMinute')::int,1260) valid_end,
  greatest(60,least(120,((lower(activity.duration_minutes)+upper(activity.duration_minutes)-1)/2)::int)) duration_minutes,
  case when coalesce(array_length(activity.location_slugs,1),0)>0 then activity.location_slugs[1] end location_slug,
  activity.category='home' display_home,activity.priority,
  left(activity.activity_key,9)='interest_' is_interest,
  activity.activity_key not in('home_cooking','quiet_home','late_errand') is_custom
from kivelle_neon_schedule_characters character
join public.together_character_activity_templates activity on activity.character_version_id=character.version_id
where activity.category<>'work';

create temporary table kivelle_neon_schedule_days on commit drop as
with day_grid as(
  select character.*,day_number day_of_week
  from kivelle_neon_schedule_characters character cross join generate_series(0,6) day_number
),base as(
  select day_grid.*,
    occupation.start_min,occupation.start_max,occupation.duration_min,occupation.duration_max,
    occupation.location_slug work_location_slug,occupation.work_variants,occupation.block_key,
    floor((occupation.start_min+occupation.start_max)/2.0)::int anchor_start,
    floor((occupation.duration_min+occupation.duration_max)/2.0)::int anchor_duration,
    second_today.location_slug second_work_location_slug,second_today.work_variants second_work_variants,
    second_today.block_key second_block_key,
    floor((second_today.start_min+second_today.start_max)/2.0)::int second_anchor_start,
    floor((second_today.duration_min+second_today.duration_max)/2.0)::int second_anchor_duration,
    previous.location_slug previous_work_location_slug,previous.work_variants previous_work_variants,
    previous.carry_end,
    daytime.activity_key daytime_key,daytime.title daytime_title,daytime.location_slug daytime_location_slug,
    daytime.display_home daytime_home,daytime.duration_minutes daytime_duration,
    evening.activity_key evening_key,evening.title evening_title,evening.location_slug evening_location_slug,
    evening.display_home evening_home,evening.duration_minutes evening_duration
  from day_grid
  left join lateral(
    select block.* from kivelle_neon_schedule_blocks block
    where block.version_id=day_grid.version_id and day_grid.day_of_week=any(block.work_days)
    order by block.block_key limit 1
  ) occupation on true
  left join lateral(
    select block.* from kivelle_neon_schedule_blocks block
    where block.version_id=day_grid.version_id and day_grid.day_of_week=any(block.work_days)
    order by block.block_key offset 1 limit 1
  ) second_today on true
  left join lateral(
    select block.location_slug,block.work_variants,
      greatest(0,floor((block.start_min+block.start_max)/2.0)::int
        +floor((block.duration_min+block.duration_max)/2.0)::int-1440) carry_end
    from kivelle_neon_schedule_blocks block
    where block.version_id=day_grid.version_id
      and ((day_grid.day_of_week+6)%7)=any(block.work_days)
      and floor((block.start_min+block.start_max)/2.0)::int
        +floor((block.duration_min+block.duration_max)/2.0)::int>1440
    order by block.block_key limit 1
  ) previous on true
  left join lateral(
    select activity.* from kivelle_neon_schedule_activities activity
    where activity.version_id=day_grid.version_id and activity.valid_start<1020
    order by activity.is_interest desc,activity.is_custom desc,
      md5(day_grid.slug||':'||day_grid.day_of_week||':day:'||activity.activity_key)
    limit 1
  ) daytime on true
  left join lateral(
    select activity.* from kivelle_neon_schedule_activities activity
    where activity.version_id=day_grid.version_id and activity.valid_end>960
      and activity.activity_key<>coalesce(daytime.activity_key,'')
    order by activity.is_interest desc,activity.is_custom desc,
      md5(day_grid.slug||':'||day_grid.day_of_week||':evening:'||activity.activity_key)
    limit 1
  ) evening on true
),calculated as(
  select base.*,anchor_start+anchor_duration anchor_end_total,
    least(1440,anchor_start+anchor_duration) anchor_end,
    second_anchor_start+second_anchor_duration second_anchor_end
  from base
)
select calculated.*,
  case
    when anchor_start is null and carry_end>0 then 'night_recovery'
    when anchor_start is null then 'open_day'
    when second_anchor_start is not null then 'split_day'
    when anchor_start>=990 and carry_end>0 then 'night_turnaround'
    when anchor_start>=990 then 'late_shift'
    when anchor_duration>540 or anchor_end_total>1110 then 'long_shift'
    else 'work_day'
  end day_shape
from calculated;

delete from public.together_schedule_templates schedule
using kivelle_neon_schedule_characters character
where schedule.character_version_id=character.version_id;

with schedule_rows as(
  -- Open days: private morning, two personal anchors, and an unrushed night.
  select version_id,slug,day_of_week,1 slot,540 start_minute,630 end_minute,null::text location_slug,
    'home_morning'::text activity_key,'Starting slowly at home while the city keeps moving'::text activity,
    'available'::text availability,1 energy_delta,'easy'::text mood_influence,
    'recurring_routine'::text priority,day_shape,'Home'::text display_location,false continuation,
    jsonb_build_array('Starting slowly at home while the city keeps moving','Making coffee and ignoring the first wave of alerts','Taking an unhurried start away from the public feed') activity_variants
  from kivelle_neon_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,2,660,780,daytime_location_slug,coalesce(daytime_key,'city_wander'),
    coalesce(daytime_title,'Walking without following the recommendation grid'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,false,jsonb_build_array(coalesce(daytime_title,'Walking without following the recommendation grid'))
  from kivelle_neon_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,3,840,960,null,'home_reset','Resetting at home with the privacy layer closed','available',0,'easy','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Resetting at home with the privacy layer closed','Catching up on private things at home','Letting the apartment go quiet for a while')
  from kivelle_neon_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,4,1020,1170,evening_location_slug,coalesce(evening_key,daytime_key,'quiet_home'),
    coalesce(evening_title,daytime_title,'Keeping the evening private at home'),'available',1,'engaged','preferred_activity',day_shape,
    case when coalesce(evening_home,daytime_home,true) then 'Home' end,false,
    jsonb_build_array(coalesce(evening_title,daytime_title,'Keeping the evening private at home'))
  from kivelle_neon_schedule_days where day_shape='open_day'
  union all
  select version_id,slug,day_of_week,5,1230,1410,null,'home_evening','Winding down behind a closed privacy layer','available',-1,'warm','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Winding down behind a closed privacy layer','Letting the city glow stay outside for the night','Checking tomorrow once, then putting the feed away')
  from kivelle_neon_schedule_days where day_shape='open_day'

  union all
  -- A genuine split day keeps study/consulting and paid work distinct.
  select version_id,slug,day_of_week,1,greatest(0,second_anchor_start-90),second_anchor_start-30,null,'home_morning','Getting ready for two different commitments','limited',0,'focused','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Getting ready for two different commitments','Packing for a split day across NEON KYO','Checking both schedules before leaving home')
  from kivelle_neon_schedule_days where day_shape='split_day'
  union all
  select version_id,slug,day_of_week,2,second_anchor_start,second_anchor_end,second_work_location_slug,
    'occupation_'||coalesce(second_block_key,'secondary'),second_work_variants->>0,'busy',-1,'focused','hard_obligation',day_shape,null,false,second_work_variants
  from kivelle_neon_schedule_days where day_shape='split_day'
  union all
  select version_id,slug,day_of_week,3,second_anchor_end+15,anchor_start-30,'hikari-crossing','between_commitments','Eating and crossing the city between commitments','limited',0,'steady','recurring_routine',day_shape,null,false,
    jsonb_build_array('Eating and crossing the city between commitments','Taking one private breath between the two halves of the day','Switching gears before the next commitment')
  from kivelle_neon_schedule_days where day_shape='split_day'
  union all
  select version_id,slug,day_of_week,4,anchor_start,anchor_end,work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='split_day'
  union all
  select version_id,slug,day_of_week,5,anchor_end+45,least(anchor_end+165,1380),null,'post_split_home','Recovering at home after the split day','available',-2,'tired','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Recovering at home after the split day','Eating something simple and putting both schedules away','Letting the apartment go quiet after a divided day')
  from kivelle_neon_schedule_days where day_shape='split_day'

  union all
  -- Ordinary daytime work: preparation, work, recovery, personal life, home.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready at home','limited',0,'focused','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Getting ready at home','Checking transit and weather before leaving','Starting the day with the public feed muted')
  from kivelle_neon_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,2,anchor_start,anchor_end,work_location_slug,'occupation_'||coalesce(block_key,'primary'),
    work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,3,anchor_end+30,least(anchor_end+120,1200),null,'post_work_reset','Decompressing at home after crossing the city','available',-1,'easy','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Decompressing at home after crossing the city','Taking a private reset after work','Changing out of the public version of the day')
  from kivelle_neon_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,4,least(1230,greatest(anchor_end+150,1020)),least(1320,least(1230,greatest(anchor_end+150,1020))+90),
    evening_location_slug,coalesce(evening_key,daytime_key,'quiet_home'),coalesce(evening_title,daytime_title,'Keeping the evening quiet at home'),
    'available',1,'engaged','preferred_activity',day_shape,case when coalesce(evening_home,daytime_home,true) then 'Home' end,false,
    jsonb_build_array(coalesce(evening_title,daytime_title,'Keeping the evening quiet at home'))
  from kivelle_neon_schedule_days where day_shape='work_day'
  union all
  select version_id,slug,day_of_week,5,1350,1410,null,'home_evening','Ending the day at home','available',-1,'warm','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Ending the day at home','Putting the city on silent before bed','Checking tomorrow and closing the privacy layer')
  from kivelle_neon_schedule_days where day_shape='work_day'

  union all
  -- Long obligations expose a real break instead of pretending to be one block.
  select version_id,slug,day_of_week,1,greatest(0,anchor_start-90),anchor_start-30,null,'home_morning','Getting ready for a long day','limited',0,'focused','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Getting ready for a long day','Packing for a full shift across the city','Starting early with the public feed muted')
  from kivelle_neon_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,2,anchor_start,least(anchor_start+240,anchor_end-90),work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,3,least(anchor_start+240,anchor_end-90),least(anchor_start+240,anchor_end-90)+45,
    work_location_slug,'work_break','Taking a real break during the shift','limited',0,'steady','recurring_routine',day_shape,null,false,
    jsonb_build_array('Taking a real break during the shift','Finding forty-five minutes away from customers and alerts')
  from kivelle_neon_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,4,least(anchor_start+240,anchor_end-90)+45,anchor_end,work_location_slug,
    'occupation_'||coalesce(block_key,'primary'),work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='long_shift'
  union all
  select version_id,slug,day_of_week,5,anchor_end+30,least(anchor_end+120,1410),null,'post_shift_home','Recovering at home after the long shift','available',-2,'tired','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Recovering at home after the long shift','Eating something simple and letting the apartment go quiet')
  from kivelle_neon_schedule_days where day_shape='long_shift'

  union all
  -- First night in a run has no previous carryover.
  select version_id,slug,day_of_week,1,600,690,null,'late_morning_home','Starting a night-worker morning at home','available',1,'easy','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Starting a night-worker morning at home','Waking after the daytime city is already loud','Making a slow start with notifications muted')
  from kivelle_neon_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,2,690,810,daytime_location_slug,coalesce(daytime_key,'late_day_personal'),
    coalesce(daytime_title,'Taking a personal hour before the night begins'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,false,jsonb_build_array(coalesce(daytime_title,'Taking a personal hour before the night begins'))
  from kivelle_neon_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,3,840,least(960,anchor_start-120),null,'home_reset','Keeping the afternoon private at home','available',0,'easy','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Keeping the afternoon private at home','Eating before the shift and staying off the feed','Taking a quiet hour before getting ready')
  from kivelle_neon_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,4,greatest(900,anchor_start-90),anchor_start-30,null,'pre_shift_home','Getting ready for the night shift','limited',0,'focused','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Getting ready for the night shift','Checking the route and closing the apartment privacy layer','Changing into the version of herself the night expects')
  from kivelle_neon_schedule_days where day_shape='late_shift'
  union all
  select version_id,slug,day_of_week,5,anchor_start,1440,work_location_slug,'occupation_'||coalesce(block_key,'primary'),
    work_variants->>0,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='late_shift'

  union all
  -- Consecutive night shifts show yesterday's continuation and tonight's start.
  select version_id,slug,day_of_week,1,0,carry_end,previous_work_location_slug,'occupation_continuation',
    previous_work_variants->>2,'busy',-2,'focused','hard_obligation',day_shape,null,true,previous_work_variants
  from kivelle_neon_schedule_days where day_shape='night_turnaround'
  union all
  select version_id,slug,day_of_week,2,carry_end+30,660,null,'recovery_sleep','Sleeping after the overnight shift','busy',-2,'tired','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Sleeping after the overnight shift','Recovering at home while the daytime city runs','Keeping the room dark after work')
  from kivelle_neon_schedule_days where day_shape='night_turnaround'
  union all
  select version_id,slug,day_of_week,3,720,840,daytime_location_slug,coalesce(daytime_key,'late_day_personal'),
    coalesce(daytime_title,'Taking one personal hour before work'),'available',1,'engaged','preferred_activity',day_shape,
    case when daytime_home then 'Home' end,false,jsonb_build_array(coalesce(daytime_title,'Taking one personal hour before work'))
  from kivelle_neon_schedule_days where day_shape='night_turnaround'
  union all
  select version_id,slug,day_of_week,4,greatest(900,anchor_start-120),anchor_start-30,null,'pre_shift_home','Resetting at home before another night shift','limited',0,'focused','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Resetting at home before another night shift','Eating, showering, and checking the route to work','Closing the privacy layer before heading out again')
  from kivelle_neon_schedule_days where day_shape='night_turnaround'
  union all
  select version_id,slug,day_of_week,5,anchor_start,1440,work_location_slug,'occupation_'||coalesce(block_key,'primary'),
    work_variants->>1,'busy',-2,'focused','hard_obligation',day_shape,null,false,work_variants
  from kivelle_neon_schedule_days where day_shape='night_turnaround'

  union all
  -- The morning after the final night shift remains honest recovery time.
  select version_id,slug,day_of_week,1,0,carry_end,previous_work_location_slug,'occupation_continuation',
    previous_work_variants->>2,'busy',-2,'focused','hard_obligation',day_shape,null,true,previous_work_variants
  from kivelle_neon_schedule_days where day_shape='night_recovery'
  union all
  select version_id,slug,day_of_week,2,carry_end+30,690,null,'recovery_sleep','Sleeping after the final overnight shift','busy',-2,'tired','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Sleeping after the final overnight shift','Letting the daylight pass behind blackout glass','Recovering at home after the night run')
  from kivelle_neon_schedule_days where day_shape='night_recovery'
  union all
  select version_id,slug,day_of_week,3,750,870,null,'home_reset','Waking slowly and restoring a human rhythm','available',0,'easy','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Waking slowly and restoring a human rhythm','Making a late first meal at home','Checking what happened while the room was dark')
  from kivelle_neon_schedule_days where day_shape='night_recovery'
  union all
  select version_id,slug,day_of_week,4,960,1080,evening_location_slug,coalesce(evening_key,daytime_key,'quiet_home'),
    coalesce(evening_title,daytime_title,'Taking an easy evening away from work'),'available',1,'engaged','preferred_activity',day_shape,
    case when coalesce(evening_home,daytime_home,true) then 'Home' end,false,
    jsonb_build_array(coalesce(evening_title,daytime_title,'Taking an easy evening away from work'))
  from kivelle_neon_schedule_days where day_shape='night_recovery'
  union all
  select version_id,slug,day_of_week,5,1140,1320,null,'home_evening','Keeping the recovery night quiet at home','available',-1,'warm','recurring_routine',day_shape,'Home',false,
    jsonb_build_array('Keeping the recovery night quiet at home','Letting the apartment stay quiet before an early bed','Refusing one more night out and staying home')
  from kivelle_neon_schedule_days where day_shape='night_recovery'
),valid_rows as(
  select * from schedule_rows
  where start_minute>=0 and end_minute<=1440 and end_minute>start_minute
),located_rows as(
  select row_data.*,location.id location_id
  from valid_rows row_data
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid
   and location.slug=row_data.location_slug
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,1,
  jsonb_strip_nulls(jsonb_build_object(
    'source','neon_kyo_authored_schedule_v1','scheduleMode','authored',
    'profileVisibility','visible','displayLocation',display_location,
    'activityKey',activity_key,'activityVariants',activity_variants,
    'priority',priority,'dayShape',day_shape,'slot',slot,
    'scheduleProfile','neon_kyo_life_v2','overnightContinuation',continuation
  ))
from located_rows
on conflict(character_version_id,day_of_week,start_minute) do update set
  end_minute=excluded.end_minute,location_id=excluded.location_id,activity=excluded.activity,
  availability=excluded.availability,energy_delta=excluded.energy_delta,
  mood_influence=excluded.mood_influence,variation_weight=excluded.variation_weight,
  metadata=excluded.metadata;

-- Every personal calendar block resolves to one of the resident's interests.
with replacements as(
  select schedule.id,activity.title,activity.activity_key,activity.location_slugs[1] location_slug,location.id location_id
  from public.together_schedule_templates schedule
  join kivelle_neon_schedule_characters character on character.version_id=schedule.character_version_id
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
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid and location.slug=activity.location_slugs[1]
  where schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
    and schedule.metadata->>'priority'='preferred_activity'
)
update public.together_schedule_templates schedule set
  location_id=replacements.location_id,activity=replacements.title,
  metadata=schedule.metadata||jsonb_build_object(
    'activityKey',replacements.activity_key,'activityVariants',jsonb_build_array(replacements.title)
  )
from replacements where schedule.id=replacements.id;

-- Current and historical reality remains untouched. Only stale future dynamic
-- projections are removed so met residents regenerate from the richer profile.
delete from public.together_character_schedule_events event
using public.together_character_instances instance,public.together_character_templates template
where event.character_instance_id=instance.id and instance.character_template_id=template.id
  and template.slug in(select slug from kivelle_neon_life_v2)
  and event.source in('generated','recurring') and event.starts_at>now();

update public.together_character_instances instance set life_engine_version='life_engine_v2',updated_at=now()
from public.together_character_templates template
where instance.character_template_id=template.id
  and template.slug in(select slug from kivelle_neon_life_v2);

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from(
    select character.version_id,day_number
    from kivelle_neon_schedule_characters character cross join generate_series(0,6) day_number
    left join public.together_schedule_templates schedule
      on schedule.character_version_id=character.version_id and schedule.day_of_week=day_number
     and schedule.metadata->>'scheduleProfile'='neon_kyo_life_v2'
    group by character.version_id,day_number
    having count(schedule.id)<>5
  ) incomplete;
  if invalid_count>0 then
    raise exception 'NEON KYO authored calendars left % character-days without five blocks',invalid_count;
  end if;

  select count(*) into invalid_count
  from public.together_character_activity_templates activity
  join kivelle_neon_schedule_characters character on character.version_id=activity.character_version_id
  left join lateral unnest(activity.location_slugs) as activity_location(slug) on true
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid and location.slug=activity_location.slug
  where activity.metadata->>'source'='neon_kyo_life_v2'
    and activity_location.slug is not null and location.id is null;
  if invalid_count>0 then
    raise exception 'NEON KYO Life Engine has % unresolved or cross-world activities',invalid_count;
  end if;

  select count(*) into invalid_count
  from kivelle_neon_schedule_characters character
  where (select count(*) from public.together_character_activity_templates activity
         where activity.character_version_id=character.version_id
           and activity.metadata->>'source'='neon_kyo_life_v2') not between 12 and 16;
  if invalid_count>0 then
    raise exception 'NEON KYO Life Engine left % residents outside the 12-16 activity target',invalid_count;
  end if;

  select count(*) into invalid_count
  from public.together_schedule_templates schedule
  join kivelle_neon_schedule_characters character on character.version_id=schedule.character_version_id
  where schedule.metadata->>'source'='neon_kyo_authored_schedule_v1'
    and schedule.metadata->>'priority'='preferred_activity'
    and left(coalesce(schedule.metadata->>'activityKey',''),9)<>'interest_';
  if invalid_count>0 then
    raise exception 'NEON KYO calendars left % personal blocks without character interests',invalid_count;
  end if;
end $$;

update public.together_worlds set metadata=metadata||jsonb_build_object(
  'residentCalendarVersion',2,'residentCalendarProfile','neon_kyo_life_v2',
  'residentCalendarCoverage','seven_days_five_blocks','residentCalendarCount',30
),updated_at=now()
where id='10000000-0000-4000-8000-000000000009';

commit;
