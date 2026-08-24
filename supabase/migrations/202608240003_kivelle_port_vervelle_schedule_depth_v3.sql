begin;

-- Port Vervelle previously had separate five-block and six-block projections
-- for its original and expanded casts. This pack keeps their authored jobs,
-- interests, and locations, while giving all 42 residents the same complete,
-- varied, schedule-aware weekly model.
create temporary table port_vervelle_schedule_characters on commit drop as
select
  version.id version_id,
  template.id template_id,
  template.slug,
  template.name,
  template.occupation,
  version.interests,
  version.default_social_graph,
  version.life_config->'occupation'->>'workPattern' work_pattern,
  version.life_config->'occupation'->'scheduleBlocks' schedule_blocks
from public.together_character_world_presence presence
join public.together_character_versions version on version.id=presence.character_version_id
join public.together_character_templates template
  on template.id=version.character_template_id and version.version=template.current_published_version
where presence.world_id='10000000-0000-4000-8000-000000000008'
  and presence.presence_type='resident'
  and template.published and template.lifecycle_status='published';

create temporary table port_vervelle_work_block_rows on commit drop as
select
  character.version_id,character.slug,
  work_day.value::smallint day_of_week,
  block->>'key' block_key,
  block->>'primaryLocationSlug' location_slug,
  coalesce(block->'activityVariants','[]'::jsonb) activity_variants,
  floor(((block->'startRange'->>'startMinute')::numeric+(block->'startRange'->>'endMinute')::numeric)/2)::integer work_start,
  floor(((block->'durationMinutes'->>0)::numeric+(block->'durationMinutes'->>1)::numeric)/2)::integer work_duration
from port_vervelle_schedule_characters character
cross join lateral jsonb_array_elements(coalesce(character.schedule_blocks,'[]'::jsonb)) block
cross join lateral jsonb_array_elements_text(coalesce(block->'workDays','[]'::jsonb)) work_day(value);

-- A split-shift character can have more than one authored occupation block on
-- the same day. Collapse those into one daily work span before projecting the
-- visible timeline so the unique schedule key can never race itself.
create temporary table port_vervelle_work_blocks on commit drop as
select
  version_id,slug,day_of_week,
  string_agg(block_key,'+' order by work_start) block_key,
  (array_agg(location_slug order by work_start))[1] location_slug,
  (array_agg(activity_variants order by work_start))[1] activity_variants,
  min(work_start) work_start,
  max(work_start+work_duration)-min(work_start) work_duration
from port_vervelle_work_block_rows
group by version_id,slug,day_of_week;

create temporary table port_vervelle_routine_activities on commit drop as
select
  character.version_id,character.slug,activity.activity_key,
  coalesce(nullif(activity.metadata->>'activityLabel',''),activity.title) title,
  activity.category,activity.location_slugs[1] location_slug
from port_vervelle_schedule_characters character
join public.together_character_activity_templates activity on activity.character_version_id=character.version_id
where activity.category<>'work'
  and coalesce(array_length(activity.location_slugs,1),0)>0;

-- These are recurring chances for believable overlap, not claims that a scene,
-- invitation, or witnessed interaction occurred. Mixed original/expanded groups
-- make the town feel interconnected instead of split into two launch packs.
create temporary table port_vervelle_community_rhythms(
  rhythm_slug text primary key,
  day_of_week smallint not null,
  slot_role text not null check(slot_role in('personal','social')),
  location_slug text not null,
  activity text not null,
  member_slugs text[] not null,
  priority smallint not null default 10
) on commit drop;

insert into port_vervelle_community_rhythms values
('harbor-sunday-table',0,'social','casa-del-mare','Taking the long Sunday harbor table with friends who know the week behind the small talk',array['elena-moretti','sofia-bellini','alessia-romano','alessandro-moretti','giulia-marchetti'],20),
('creative-midweek',3,'social','studio-ondine','Joining the loose midweek creative circle to trade work, criticism, and whatever gossip survives both',array['isabella-conti','amelie-rousseau','chiara-vitale','lea-benali','nina-kovac','ana-ribeiro','nico-valenti','elias-romano'],20),
('preservation-supper',4,'social','osteria-rosa','Sharing the preservation supper where architects, planners, and historians disagree without losing dinner',array['marta-solari','francesca-leone','margot-lefevre','marco-de-santis','elias-romano','adriana-vega'],20),
('health-garden-reset',0,'personal','belvedere-garden','Taking an unhurried garden walk with the health and wellness circle after a demanding week',array['giulia-marchetti','emilia-rossi','noemie-diop','elise-ben-youssef','ana-ribeiro','luca-bianchi'],30),
('vineyard-sunday-lunch',0,'social','la-pergola','Settling into the vineyard Sunday lunch where work talk is allowed only until the first shared plate arrives',array['celine-haddad','livia-santoro','lorenzo-bellaforte','gabriel-laurent','amelie-rousseau','camille-laurent'],20),
('ocean-thursday',4,'social','blue-lantern','Meeting the ocean circle after the boats are secure and keeping the difficult water stories among people who understand them',array['camille-laurent','lucia-ferraro','matteo-bellandi','rafael-silva','elias-romano','mia-han-andersson'],30),
('sirena-friday',5,'social','la-sirena','Drifting into La Sirena for the Friday set with the music and beach crowd',array['eva-moreau','clara-mendes','bianca-de-luca','idris-benali','valentina-costa','theo-mancini','matteo-bellandi','juliette-baptiste','lea-benali'],30),
('hotel-friday-cocktails',5,'social','velours','Taking the polished Friday table where hotel stories, design opinions, and private jokes can coexist',array['adriana-vega','juliette-baptiste','gabriel-laurent','amelie-rousseau','bianca-de-luca','lorenzo-bellaforte','celine-haddad'],20),
('solana-saturday',6,'social','lido-vervelle','Ending the long Solana afternoon with the beach circle after the last competition stops pretending to be casual',array['lucia-ferraro','mia-han-andersson','valentina-costa','tessa-patel-morgan','matteo-bellandi','enzo-moretti','rafael-silva','theo-mancini'],30),
('young-locals-saturday',6,'social','spiaggia-solana','Catching the younger local crowd between beach games, food, and the first serious plan for the night',array['inez-el-mansouri','sofia-bellini','sara-moretti','mia-han-andersson','enzo-moretti','tessa-patel-morgan','theo-mancini'],20),
('market-saturday',6,'personal','mercato-vecchio','Making the Saturday market round with cooks, artists, and regulars who all stop at different stalls',array['alessandro-moretti','ana-ribeiro','nico-valenti','giulia-marchetti','elena-moretti'],30);

do $$
declare
  character_count integer;
  missing_work_location_count integer;
  missing_community_location_count integer;
  missing_member_count integer;
begin
  select count(*) into character_count from port_vervelle_schedule_characters;
  select count(*) into missing_work_location_count
  from port_vervelle_work_blocks block
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=block.location_slug
  where location.id is null;
  select count(*) into missing_community_location_count
  from port_vervelle_community_rhythms rhythm
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=rhythm.location_slug
  where location.id is null;
  select count(*) into missing_member_count
  from port_vervelle_community_rhythms rhythm
  cross join lateral unnest(rhythm.member_slugs) as member(member_slug)
  left join port_vervelle_schedule_characters character on character.slug=member_slug
  where character.version_id is null;
  if character_count<>42 or missing_work_location_count<>0 or missing_community_location_count<>0 or missing_member_count<>0 then
    raise exception 'Port Vervelle schedule seed invalid: characters %, missing work places %, missing community places %, missing members %',
      character_count,missing_work_location_count,missing_community_location_count,missing_member_count;
  end if;
end $$;

delete from public.together_schedule_templates schedule
using port_vervelle_schedule_characters character
where schedule.character_version_id=character.version_id;

with day_grid as(
  select
    character.*,day_number::smallint day_of_week,
    current_work.block_key,current_work.location_slug work_slug,
    current_work.activity_variants work_variants,current_work.work_start,current_work.work_duration,
    previous_work.location_slug previous_work_slug,
    previous_work.activity_variants previous_work_variants,
    previous_work.work_start previous_work_start,previous_work.work_duration previous_work_duration
  from port_vervelle_schedule_characters character
  cross join generate_series(0,6) as days(day_number)
  left join port_vervelle_work_blocks current_work
    on current_work.version_id=character.version_id and current_work.day_of_week=day_number
  left join port_vervelle_work_blocks previous_work
    on previous_work.version_id=character.version_id and previous_work.day_of_week=((day_number+6)%7)
), selected as(
  select grid.*,
    personal.activity_key personal_key,personal.title personal_activity,personal.location_slug personal_slug,
    social.activity_key social_key,social.title social_activity,social.location_slug social_slug,
    case
      when work_start>=1080 and work_duration>=480 then 'overnight'
      when work_start>=900 then 'evening'
      when work_start<480 then 'early'
      when work_duration>=540 or work_start+work_duration>1110 then 'long'
      when work_start is not null then 'day'
      when previous_work_start>=1080 and previous_work_duration>=480 then 'overnight_off'
      when previous_work_start>=900 then 'late_off'
      else 'off_day'
    end schedule_family,
    case grid.day_of_week when 5 then 'Friday variation' when 6 then 'Saturday variation' when 0 then 'Sunday variation' else 'Weekday routine' end day_variant
  from day_grid grid
  left join lateral(
    select activity.*
    from port_vervelle_routine_activities activity
    where activity.version_id=grid.version_id
    order by
      case
        when grid.day_of_week=5 and activity.activity_key='routine_friday' then 0
        when grid.day_of_week=6 and activity.activity_key='routine_saturday' then 0
        when grid.day_of_week=0 and activity.activity_key='routine_sunday' then 0
        when activity.activity_key like 'interest_%' then 1
        when activity.activity_key like 'routine_%' then 2
        else 3
      end,
      md5(grid.slug||':'||grid.day_of_week||':personal:'||activity.activity_key)
    limit 1
  ) personal on true
  left join lateral(
    select activity.*
    from port_vervelle_routine_activities activity
    where activity.version_id=grid.version_id and activity.activity_key<>coalesce(personal.activity_key,'')
    order by
      case
        when grid.day_of_week=5 and activity.activity_key='routine_friday' then 0
        when grid.day_of_week=6 and activity.activity_key='routine_saturday' then 0
        when grid.day_of_week=0 and activity.activity_key='routine_sunday' then 0
        when activity.activity_key like 'interest_%' then 1
        when activity.activity_key like 'routine_%' then 2
        else 3
      end,
      md5(grid.slug||':'||grid.day_of_week||':social:'||activity.activity_key)
    limit 1
  ) social on true
), timed as(
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,330,'sleep'),(2,330,420,'home_morning'),(3,420,840,'main_work'),
    (4,840,1020,'personal'),(5,1020,1320,'social'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='early'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,390,'sleep'),(2,390,480,'home_morning'),(3,480,960,'main_work'),
    (4,960,1050,'personal'),(5,1050,1320,'social'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='day'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,390,'sleep'),(2,390,480,'home_morning'),(3,480,780,'work_first'),
    (4,780,840,'work_break'),(5,840,1320,'work_second'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='long'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,180,'after_midnight'),(2,180,600,'sleep'),(3,600,780,'home_morning'),
    (4,780,1020,'personal'),(5,1020,1200,'prep_work'),(6,1200,1440,'late_work')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='evening'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,360,'after_midnight'),(2,360,780,'sleep'),(3,780,900,'home_morning'),
    (4,900,1080,'personal'),(5,1080,1200,'prep_work'),(6,1200,1440,'late_work')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='overnight'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,480,'sleep'),(2,480,600,'home_morning'),(3,600,840,'personal'),
    (4,840,1020,'personal_second'),(5,1020,1320,'social'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='off_day'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,180,'after_midnight'),(2,180,600,'sleep'),(3,600,780,'home_morning'),
    (4,780,1020,'personal'),(5,1020,1320,'social'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='late_off'
  union all
  select selected.*,segment.* from selected
  cross join lateral(values
    (1,0,360,'after_midnight'),(2,360,780,'sleep'),(3,780,900,'home_morning'),
    (4,900,1080,'personal'),(5,1080,1320,'social'),(6,1320,1440,'home_evening')
  ) segment(slot,start_minute,end_minute,role) where schedule_family='overnight_off'
), contextualized as(
  select timed.*,community.rhythm_slug community_rhythm_slug,
    community.location_slug community_slug,community.activity community_activity,
    case
      when role in('sleep','home_morning','home_evening','prep_work') then null
      when role='after_midnight' and previous_work_start is not null then previous_work_slug
      when role in('main_work','work_first','work_break','work_second','late_work') then work_slug
      when community.rhythm_slug is not null then community.location_slug
      when role='personal' then personal_slug
      when role='personal_second' then social_slug
      when role='social' then social_slug
      else null
    end location_slug,
    case
      when role='sleep' then 'Sleeping at home'
      when role='after_midnight' and previous_work_start is not null then coalesce(previous_work_variants->>0,'Finishing the late shift before heading home')
      when role='after_midnight' then 'Sleeping at home'
      when role='home_morning' then case when schedule_family in('evening','overnight','late_off','overnight_off') then 'Taking a private late morning at home' else 'Starting the day at home' end
      when role='home_evening' then 'Winding down at home after a full Port Vervelle day'
      when role in('main_work','work_first','work_second','late_work') then coalesce(work_variants->>0,occupation)
      when role='work_break' then 'Taking a real break during the shift'
      when role='prep_work' then 'Preparing for '||lower(occupation)||' responsibilities before the shift'
      when community.rhythm_slug is not null then community.activity
      when role='personal' then coalesce(personal_activity,'Taking personal time by the water')
      when role='personal_second' then coalesce(social_activity,personal_activity,'Following an unhurried afternoon plan')
      when role='social' then coalesce(social_activity,personal_activity,'Keeping the evening open for friends')
      else 'Keeping the day flexible'
    end activity
  from timed
  left join lateral(
    select rhythm.* from port_vervelle_community_rhythms rhythm
    where rhythm.day_of_week=timed.day_of_week
      and(
        (rhythm.slot_role='personal' and(
          (timed.schedule_family='off_day' and timed.role='personal_second')
          or(timed.schedule_family<>'off_day' and timed.role='personal')
        ))
        or(rhythm.slot_role='social' and timed.role='social')
      )
      and timed.slug=any(rhythm.member_slugs)
    order by rhythm.priority desc,rhythm.rhythm_slug
    limit 1
  ) community on true
), located as(
  select contextualized.*,location.id location_id,location.name location_name
  from contextualized
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000008' and location.slug=contextualized.location_slug
), final_rows as(
  select located.*,
    case
      when role='sleep' or(role='after_midnight' and previous_work_start is null) then 'sleep'
      when role in('home_morning','home_evening') then 'home_routine'
      when role in('main_work','work_first','work_break','work_second','late_work') then 'occupation_'||replace(slug,'-','_')
      when role='prep_work' then 'occupation_prep_'||replace(slug,'-','_')
      when community_rhythm_slug is not null then 'community_'||replace(community_rhythm_slug,'-','_')
      else 'personal_'||replace(slug,'-','_')
    end activity_key,
    case
      when role='sleep' or(role='after_midnight' and previous_work_start is null) then 'busy'
      when role='after_midnight' and previous_work_start is not null then 'busy'
      when role in('main_work','work_first','work_second','late_work') then 'busy'
      when role in('prep_work','work_break','home_morning') then 'limited'
      else 'available'
    end availability,
    case
      when role='sleep' or(role='after_midnight' and previous_work_start is null) then 'sleep'
      when role in('main_work','work_first','work_second','late_work','after_midnight') then 'focused'
      when role in('personal','personal_second','social') then 'engaged'
      else 'easy'
    end mood,
    case when location_slug in('spiaggia-solana','cala-bianca','porto-marina','faro-vervelle','harbor-steps','belvedere-garden','lido-vervelle','mercato-vecchio')
      then 'Coastal weather may move this routine indoors without changing its purpose.' end weather_contingency,
    jsonb_build_array(
      activity,
      case
        when role='sleep' or(role='after_midnight' and previous_work_start is null) then 'Getting uninterrupted sleep at home with the phone quiet'
        when role in('home_morning','home_evening') then 'Taking private time at home with '||coalesce(interests[1],'a familiar routine')
        when role in('main_work','work_first','work_second','late_work') then coalesce(work_variants->>1,'Following through on the day''s '||lower(occupation)||' responsibilities')
        when role='work_break' then 'Stepping away long enough to eat and reset during the shift'
        when role='prep_work' then 'Checking the practical details before work begins'
        else activity||' without rushing what comes next'
      end,
      case
        when role='sleep' or(role='after_midnight' and previous_work_start is null) then 'Sleeping at home until the next real obligation'
        when role in('home_morning','home_evening') then 'Keeping this part of the day private at home'
        when role in('main_work','work_first','work_second','late_work') then coalesce(work_variants->>2,work_variants->>0,'Staying focused on '||lower(occupation)||' work')
        when role='work_break' then 'Catching a quiet work break before the next responsibility'
        when role='prep_work' then 'Getting ready at home before heading into the shift'
        else activity||' while leaving room for the day to change naturally'
      end
    ) activity_variants
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
    'source','port_vervelle_authored_schedule_v3',
    'scheduleMode','authored',
    'scheduleProfile','port_vervelle_rich_weekly_v3',
    'profileVisibility','visible',
    'displayLocation',case when location_id is null then 'Home' else location_name end,
    'activityKey',activity_key,
    'activityVariants',activity_variants,
    'priority',case when activity_key like 'occupation_%' then 'hard_obligation' when activity_key='sleep' then 'recurring_routine' else 'preferred_activity' end,
    'dayVariant',day_variant,
    'slot',slot,
    'worldSlug','port-vervelle',
    'routineKind',role,
    'potentialCompanionSlugs',default_social_graph,
    'communityAnchor',community_rhythm_slug,
    'weatherContingency',weather_contingency,
    'contextCue','This is an established independent routine, not proof of a shared scene or an invitation.',
    'authoredCoverage','full_day',
    'promptVersion',3
  ))
from final_rows;

update public.together_character_versions version
set life_config=jsonb_set(
  version.life_config,'{scheduling}',coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
    'repetitionTolerance',.12,
    'preferredDailyActivityCount',jsonb_build_array(4,6),
    'generationVersion','port_vervelle_authored_weekly_v3',
    'scheduleProfile','port_vervelle_rich_weekly_v3',
    'authoredCoverage','full_week',
    'activityVariantCount',3,
    'socialOverlapAware',true,
    'weatherContingencyAware',true,
    'privateTimeAuthored',true
  ),true
),updated_at=now()
from port_vervelle_schedule_characters character
where version.id=character.version_id;

update public.together_character_world_presence presence
set metadata=coalesce(presence.metadata,'{}'::jsonb)||jsonb_build_object(
  'dynamicSchedule',true,
  'scheduleProfile','port_vervelle_rich_weekly_v3',
  'scheduleDepth','full_day_character_specific',
  'activityVariants',true,
  'socialOverlapAware',true,
  'weatherContingencyAware',true
),updated_at=now()
from port_vervelle_schedule_characters character
where presence.character_version_id=character.version_id
  and presence.world_id='10000000-0000-4000-8000-000000000008';

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'scheduleProfile','port_vervelle_rich_weekly_v3',
  'residentScheduleCount',42,
  'scheduleDepth','full_day_character_specific',
  'communityRhythms',true,
  'coastalWeatherContingencies',true
),updated_at=now()
where id='10000000-0000-4000-8000-000000000008';

delete from public.together_character_schedule_events event
using public.together_character_instances instance,port_vervelle_schedule_characters character
where event.character_instance_id=instance.id
  and instance.character_version_id=character.version_id
  and event.source in('generated','recurring')
  and event.starts_at>=date_trunc('day',now());

do $$
declare
  schedule_count integer;
  complete_day_count integer;
  overlap_count integer;
  invalid_location_count integer;
  missing_variant_count integer;
  uncovered_check_count integer;
  community_character_count integer;
begin
  select count(*) into schedule_count
  from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3';
  select count(*) into complete_day_count from(
    select character_version_id,day_of_week
    from public.together_schedule_templates
    where metadata->>'source'='port_vervelle_authored_schedule_v3'
    group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
  ) days;
  select count(*) into overlap_count
  from public.together_schedule_templates left_schedule
  join public.together_schedule_templates right_schedule
    on right_schedule.character_version_id=left_schedule.character_version_id
   and right_schedule.day_of_week=left_schedule.day_of_week
   and right_schedule.id>left_schedule.id
   and right_schedule.start_minute<left_schedule.end_minute
   and left_schedule.start_minute<right_schedule.end_minute
  where left_schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'
    and right_schedule.metadata->>'source'='port_vervelle_authored_schedule_v3';
  select count(*) into invalid_location_count
  from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'
    and(
      (schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000008'::uuid)
      or(
        schedule.location_id is null
        and schedule.metadata->>'activityKey'<>'sleep'
        and schedule.metadata->>'routineKind' not in('home_morning','home_evening','prep_work')
      )
    );
  select count(*) into missing_variant_count
  from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
    and jsonb_array_length(coalesce(metadata->'activityVariants','[]'::jsonb))<3;
  select count(*) into uncovered_check_count
  from port_vervelle_schedule_characters character
  cross join generate_series(0,6) as days(day_number)
  cross join(values(0),(480),(720),(960),(1200)) probe(minute_of_day)
  where not exists(
    select 1 from public.together_schedule_templates schedule
    where schedule.character_version_id=character.version_id
      and schedule.day_of_week=day_number
      and schedule.start_minute<=probe.minute_of_day and schedule.end_minute>probe.minute_of_day
  );
  select count(distinct character_version_id) into community_character_count
  from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
    and metadata ? 'communityAnchor';

  if schedule_count<>1764 or complete_day_count<>294 or overlap_count<>0 or invalid_location_count<>0
    or missing_variant_count<>0 or uncovered_check_count<>0 or community_character_count<35 then
    raise exception 'Port Vervelle schedule validation failed: schedules %, complete days %, overlaps %, invalid places %, missing variants %, uncovered probes %, community characters %',
      schedule_count,complete_day_count,overlap_count,invalid_location_count,missing_variant_count,uncovered_check_count,community_character_count;
  end if;
end $$;

commit;
