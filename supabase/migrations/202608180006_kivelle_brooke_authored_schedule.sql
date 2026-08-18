begin;

-- Brooke's timetable is authored character canon: every user sees the same
-- weekly structure. Date-seeded activity variants keep the wording fresh
-- without making the schedule user- or conversation-specific.
delete from public.together_schedule_templates schedule
where schedule.character_version_id='13000000-0000-4000-8000-000000000123'::uuid
  and schedule.metadata->>'source' in('juniper_character_roster','brooke_authored_schedule_v1');

with schedule_rows(
  id,day_of_week,start_minute,end_minute,location_slug,activity_key,activity,
  availability,energy_delta,mood_influence,priority,day_shape,display_location,activity_variants
) as (values
  ('18000000-0000-4000-8100-000000000001'::uuid,0,540,630,null,'slow_morning','Starting the day at home','available',1,'bright','recurring_routine','open_day','Home',array['Sleeping in a little at home','Starting the day slowly at home','Making an optimistic plan for the day']::text[]),
  ('18000000-0000-4000-8100-000000000002'::uuid,0,660,780,'riverwalk','river_photos','Taking bright river-day photographs','available',0,'curious','preferred_activity','open_day',null,array['Taking bright river-day photographs','Walking the river with her camera','Hunting for the best light along the river']::text[]),
  ('18000000-0000-4000-8100-000000000003'::uuid,0,810,990,null,'home_reset','Taking an easy afternoon at home','available',0,'easy','recurring_routine','open_day','Home',array['Editing river photos at home','Recharging at home between plans','Catching up with friends from home']::text[]),
  ('18000000-0000-4000-8100-000000000004'::uuid,0,1020,1200,'halcyon-park','outdoor_gathering','Joining an outdoor gathering','available',1,'social','social_event','open_day',null,array['Joining an outdoor gathering','Meeting friends for a park hangout','Turning a casual park plan into a group event']::text[]),
  ('18000000-0000-4000-8100-000000000005'::uuid,0,1260,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine','open_day','Home',array['Winding down at home','Putting her phone down for the night','Getting ready for the week at home']::text[]),

  ('18000000-0000-4000-8100-000000000006'::uuid,1,450,510,null,'college_morning','Getting ready for campus','limited',0,'bright','recurring_routine','college_day','Home',array['Getting ready for campus','Starting fast after one alarm too many','Packing for class and the river']::text[]),
  ('18000000-0000-4000-8100-000000000007'::uuid,1,540,750,'juniper-college','communications_class','Attending communications class','busy',-1,'focused','hard_obligation','college_day',null,array['Attending a communications class','Editing a campus media project','Working through a campaign assignment']::text[]),
  ('18000000-0000-4000-8100-000000000008'::uuid,1,780,900,'juniper-college','campus_project','Working on a campus project','limited',-1,'focused','hard_obligation','college_day',null,array['Meeting her campus project group','Polishing a campaign presentation','Finishing a campus media edit']::text[]),
  ('18000000-0000-4000-8100-000000000009'::uuid,1,960,1050,'riverwalk','fitness_run','Training along the Riverwalk','limited',1,'energized','preferred_activity','college_day',null,array['Training along the Riverwalk','Getting a fast run in by the river','Turning a river run into an unofficial race']::text[]),
  ('18000000-0000-4000-8100-000000000010'::uuid,1,1110,1320,null,'home_evening','Having a quiet evening at home','available',-1,'easy','recurring_routine','college_day','Home',array['Having a quiet evening at home','Recovering from an overbooked Monday','Half-studying and half-texting friends at home']::text[]),

  ('18000000-0000-4000-8100-000000000011'::uuid,2,450,510,null,'river_shift_morning','Getting ready for the river shift','limited',0,'bright','recurring_routine','river_shift','Home',array['Getting ready for the river shift','Packing sunscreen and an unreasonable number of snacks','Starting early for a day on the river']::text[]),
  ('18000000-0000-4000-8100-000000000012'::uuid,2,540,900,'riverwalk','river_recreation_shift','Working a river recreation shift','busy',-2,'focused','hard_obligation','river_shift',null,array['Coordinating river recreation updates','Covering a seasonal lifeguard shift','Setting up a paddleboard program']::text[]),
  ('18000000-0000-4000-8100-000000000013'::uuid,2,930,1020,null,'post_shift_reset','Resetting at home after the shift','available',-1,'easy','recurring_routine','river_shift','Home',array['Resetting at home after the shift','Taking a quick post-river shower at home','Recharging at home before the next plan']::text[]),
  ('18000000-0000-4000-8100-000000000014'::uuid,2,1080,1260,'juniper-civic-arena','arena_friends','Meeting friends for a game','available',1,'social','social_event','river_shift',null,array['Meeting friends for a game','Catching an arena event with friends','Knowing someone in three different arena sections']::text[]),
  ('18000000-0000-4000-8100-000000000015'::uuid,2,1290,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine','river_shift','Home',array['Winding down at home','Answering the messages she missed all day','Falling asleep halfway through a playlist']::text[]),

  ('18000000-0000-4000-8100-000000000016'::uuid,3,480,540,null,'college_morning','Starting the day at home','limited',0,'bright','recurring_routine','college_day','Home',array['Starting the day at home','Getting ready for a later campus start','Making coffee and checking the group chat']::text[]),
  ('18000000-0000-4000-8100-000000000017'::uuid,3,600,780,'juniper-college','campus_media','Working on campus media','busy',-1,'focused','hard_obligation','college_day',null,array['Editing a campus media project','Attending a communications seminar','Recording material for a class campaign']::text[]),
  ('18000000-0000-4000-8100-000000000018'::uuid,3,810,900,'juniper-college','campaign_assignment','Finishing a campaign assignment','limited',-1,'focused','hard_obligation','college_day',null,array['Finishing a campaign assignment','Meeting a project partner on campus','Reworking a presentation she thought was finished']::text[]),
  ('18000000-0000-4000-8100-000000000019'::uuid,3,1020,1140,'riverwalk','paddleboard','Taking a paddleboard onto the river','available',1,'competitive','preferred_activity','college_day',null,array['Taking a paddleboard onto the river','Starting a friendly paddleboard race','Getting an evening paddle in before dark']::text[]),
  ('18000000-0000-4000-8100-000000000020'::uuid,3,1230,1410,null,'home_evening','Having a late evening at home','available',-1,'warm','recurring_routine','college_day','Home',array['Having a late evening at home','Drying river gear and winding down','Watching something easy at home']::text[]),

  ('18000000-0000-4000-8100-000000000021'::uuid,4,450,510,null,'river_shift_morning','Starting the day at home','limited',0,'bright','recurring_routine','river_shift','Home',array['Starting the day at home','Getting ready for another river shift','Checking the weather before leaving home']::text[]),
  ('18000000-0000-4000-8100-000000000022'::uuid,4,570,960,'riverwalk','river_recreation_shift','Working a river recreation shift','busy',-2,'focused','hard_obligation','river_shift',null,array['Covering a seasonal lifeguard shift','Coordinating river recreation updates','Running a paddleboard safety program']::text[]),
  ('18000000-0000-4000-8100-000000000023'::uuid,4,990,1080,null,'post_shift_reset','Taking a break at home','available',-1,'easy','recurring_routine','river_shift','Home',array['Taking a break at home','Recharging at home after the river','Trying not to make another plan from the couch']::text[]),
  ('18000000-0000-4000-8100-000000000024'::uuid,4,1140,1290,'juniper-civic-arena','arena_friends','Meeting friends at the arena','available',1,'social','social_event','river_shift',null,array['Meeting friends at the arena','Watching a game with an overly competitive group','Making the arena concourse feel like a reunion']::text[]),
  ('18000000-0000-4000-8100-000000000025'::uuid,4,1320,1410,null,'home_evening','Ending the night at home','available',-1,'warm','recurring_routine','river_shift','Home',array['Ending the night at home','Finally calling it a night','Checking tomorrow’s calendar much too late']::text[]),

  ('18000000-0000-4000-8100-000000000026'::uuid,5,480,540,null,'college_morning','Getting ready for campus','limited',0,'bright','recurring_routine','college_social','Home',array['Getting ready for campus','Starting Friday at home','Packing for class and whatever happens after']::text[]),
  ('18000000-0000-4000-8100-000000000027'::uuid,5,600,780,'juniper-college','communications_class','Working on a communications project','busy',-1,'focused','hard_obligation','college_social',null,array['Working on a communications project','Presenting a campaign assignment','Editing the campus media project before the deadline']::text[]),
  ('18000000-0000-4000-8100-000000000028'::uuid,5,840,930,'riverwalk','river_photos','Taking photos along the river','available',0,'curious','preferred_activity','college_social',null,array['Taking photos along the river','Walking off the school week with her camera','Catching the bright afternoon light by the water']::text[]),
  ('18000000-0000-4000-8100-000000000029'::uuid,5,1020,1110,null,'home_reset','Resetting at home before going out','available',0,'anticipating','recurring_routine','college_social','Home',array['Resetting at home before going out','Changing plans twice from home','Getting ready for a night out']::text[]),
  ('18000000-0000-4000-8100-000000000030'::uuid,5,1170,1380,'static-house','concert_plan','Going to a live show','available',1,'excited','social_event','college_social',null,array['Going to a live show','Following a last-minute concert plan','Meeting friends for a set at Static House']::text[]),

  ('18000000-0000-4000-8100-000000000031'::uuid,6,480,540,null,'river_shift_morning','Starting Saturday at home','limited',0,'bright','recurring_routine','river_social','Home',array['Starting Saturday at home','Getting ready for a busy river day','Packing for the river and at least one extra plan']::text[]),
  ('18000000-0000-4000-8100-000000000032'::uuid,6,570,840,'riverwalk','river_recreation_shift','Working a river recreation shift','busy',-2,'focused','hard_obligation','river_social',null,array['Setting up a paddleboard program','Covering a seasonal lifeguard shift','Running a busy morning of river recreation']::text[]),
  ('18000000-0000-4000-8100-000000000033'::uuid,6,900,1020,null,'post_shift_reset','Recovering at home after the shift','available',-1,'easy','recurring_routine','river_social','Home',array['Recovering at home after the shift','Taking a well-earned break at home','Cleaning up and checking the night’s plans']::text[]),
  ('18000000-0000-4000-8100-000000000034'::uuid,6,1080,1260,'halcyon-park','outdoor_gathering','Joining an outdoor gathering','available',1,'social','social_event','river_social',null,array['Joining an outdoor gathering','Meeting a crowd of friends at the park','Turning a small outdoor plan into a party']::text[]),
  ('18000000-0000-4000-8100-000000000035'::uuid,6,1305,1410,null,'home_evening','Winding down at home','available',-1,'warm','recurring_routine','river_social','Home',array['Winding down at home','Replying to everyone she met today','Ending an overbooked Saturday at home']::text[])
), located_rows as (
  select row_data.*,location.id as location_id
  from schedule_rows row_data
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000001'::uuid
   and location.slug=row_data.location_slug
)
insert into public.together_schedule_templates(
  id,character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select
  id,'13000000-0000-4000-8000-000000000123'::uuid,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,1,
  jsonb_strip_nulls(jsonb_build_object(
    'source','brooke_authored_schedule_v1',
    'scheduleMode','authored',
    'profileVisibility','visible',
    'displayLocation',display_location,
    'activityKey',activity_key,
    'activityVariants',to_jsonb(activity_variants),
    'priority',priority,
    'dayShape',day_shape
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

-- Clear only system-generated present/future rows so Brooke's next schedule
-- materialization adopts the shared authored timetable. Plans and overrides
-- remain untouched.
delete from public.together_character_schedule_events event
using public.together_character_instances instance
where event.character_instance_id=instance.id
  and instance.character_version_id='13000000-0000-4000-8000-000000000123'::uuid
  and event.source in('generated','recurring')
  and event.starts_at>=date_trunc('day',now());

commit;
