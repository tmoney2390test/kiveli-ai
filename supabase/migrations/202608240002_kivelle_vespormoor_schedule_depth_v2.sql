begin;

-- Vespormoor's launch schedule covered the full week, but most of its prose and
-- routing came from a handful of shared shift templates. This pack keeps the
-- life-engine contract while giving every resident an authored weekly rhythm,
-- deterministic day-to-day wording, real days off, and social-circle overlap.
create temporary table vespormoor_schedule_flavor(
  slug text primary key,
  work_days smallint[] not null,
  weekday_evening text not null,
  friday_activity text not null,
  saturday_activity text not null,
  sunday_activity text not null,
  community_day smallint not null,
  community_slug text not null,
  community_activity text not null
) on commit drop;

insert into vespormoor_schedule_flavor values
('evelyn-harrow','{1,2,3,4,5}','Closing the shop slowly, then reading somewhere warm','Listening to the late set at Velvet Thorn with a book still in her bag','Hunting for local-history marginalia before tea with Priya or Clara','Keeping Sunday quiet with poetry, tea, and whatever weather reaches the windows',4,'black-lantern','Joining the Old Vesper circle for an unhurried Thursday supper'),
('mirelle-voss','{2,3,4,5,6}','Taking a measured pause before Velvet Thorn becomes everyone else''s night','Hosting the room personally once Friday''s regulars settle in','Reviewing the cellar, the guest list, and one private game of chess before opening','Keeping the doors closed long enough for a private late lunch and old correspondence',3,'the-conservatory','Taking the old-family table at The Conservatory before the night shift'),
('priya-raman','{1,2,3,4,5}','Cooking something fragrant or walking off the apothecary day','Meeting friends at the Black Lantern after finishing Belladonna''s discreet orders','Checking Thornwood plants, then turning the useful finds into dinner','Resetting the greenhouse notes and making a long family-style meal',4,'black-lantern','Trading tea, food, and the week''s least dangerous gossip with Old Vesper friends'),
('clara-whitmore','{1,2,3,4,5,6}','Developing photographs or testing tomorrow''s pastry after the café closes','Letting somebody else pour the drink at Velvet Thorn for once','Photographing Vesper Square after market, then sharing a late table with regulars','Closing early enough for vinyl, baking, and a deliberately unscheduled evening',4,'black-lantern','Claiming a corner table with Adrian, Evelyn, Priya, or Marcus'),
('seraphine-orison','{1,2,3,4,5}','Restoring music or walking the chapel grounds after visitors leave','Watching the lake from Whisper Dock after the last chapel light is checked','Taking the Overlook path with a restoration notebook and no expectation of company','Playing sacred music in the empty chapel before a quiet sunset walk',0,'saint-orison-chapel','Keeping the chapel open for a restrained Sunday music hour'),
('adrian-bell','{2,3,4,5,6}','Cooking for the first regulars and listening more than he talks','Holding the Black Lantern together through its busiest, friendliest night','Taking a late lakeside walk before returning for the Saturday crowd','Cooking for family, watching football, and keeping the pub evening easy',4,'black-lantern','Feeding the Old Vesper table while pretending not to join their conversation'),
('marcus-reed','{1,2,3,4,5}','Binding one last section or following a map into Blackglass Library','Choosing live jazz and a measured drink after a week of close restoration work','Browsing maps and poetry before meeting the bookshop circle for dinner','Working on a personal binding project at home, then taking a quiet walk',4,'black-lantern','Joining the Old Vesper table only after the day''s gloves come off'),

('vivienne-blackwood','{1,2,3,4,5}','Riding before dinner or handling one last foundation obligation','Letting the polished Heights evening loosen at the Crimson Room','Spending the morning with the horses before hosting an expansive late dinner','Protecting a private estate morning and walking the Overlook before family supper',3,'the-conservatory','Holding the Heights table where friendship and family politics remain separate'),
('camille-laurent-vespormoor','{2,3,4,5,6}','Walking Rosegrave Gardens between services before returning to her kitchen','Running a tasting menu, then eating the imperfect plate herself after close','Working the Conservatory''s longest service and taking a late drink in Raven Ward','Cooking slowly for friends instead of guests and refusing to call it work',3,'the-conservatory','Sending one off-menu plate to the Heights table between services'),
('elara-vale','{1,2,4,5}','Cataloguing a room at Vale House that was locked the day before','Watching the Heights from the Overlook after a late Conservatory dinner','Walking Rosegrave''s least-used path before checking the lights near Vesper House','Keeping Vale House private, then leaving only when the roads are nearly empty',3,'the-conservatory','Appearing at the old-family table without explaining who invited her'),
('naomi-okafor','{1,2,3,4,5}','Sketching a repair detail over dinner or taking one honest hour off','Inspecting the evening light on Old Vesper stone before meeting friends','Walking the High Estate with a camera, measuring tape, and no client agenda','Reviewing personal sketches over coffee before a long architecture walk',3,'the-conservatory','Protecting her weekly dinner with Camille from project interruptions'),
('adelaide-hawthorne','{1,2,3,4,5,6}','Cooling down a difficult horse, then eating at The Crooked Oak','Finishing the late stable checks before meeting friends at the Black Lantern','Taking the longest safe Thornwood route on a horse she trusts completely','Giving the horses a lighter morning and herself an equally rare quiet afternoon',3,'the-conservatory','Arriving at the Heights table in riding clothes and refusing to apologize'),
('julian-ashcroft','{1,2,3,4,5}','Closing a file somewhere discreet before the evening begins','Moving from old-family business to a carefully social Crimson Room table','Checking a disputed estate boundary, then dining where nobody asks for details','Keeping Sunday technically free while answering exactly one Covenant call too many',3,'the-conservatory','Turning the Heights dinner into an unofficial legal briefing only when asked'),
('mateo-serrano','{1,2,3,4,5,6}','Finishing stable rounds, then running the lower Thornwood trail','Eating late at the Black Lantern after the last veterinary call','Taking an easy trail with Adelaide before a long Conservatory dinner','Checking only the animals that need him, then keeping the rest of Sunday open',3,'the-conservatory','Comparing the week''s stable stories with Adelaide over dinner'),

('marina-costa','{1,2,3,4,5,6}','Putting the boats to bed, then taking one drink at The Drowned Bell','Running a sunset sail before the Lakeward crowd moves indoors','Leading the early charter, then joining Stillwater Sessions after the boats are secure','Checking weather and rigging, then refusing to turn the rest of the day into work',6,'stillwater-house','Joining the Lakeward circle for Stillwater Sessions after sunset'),
('lyra-vane','{0,3,4,5,6}','Writing by the water after the last pier set has ended','Letting the Friday performance drift later when the fog holds the sound','Playing Stillwater Sessions, then returning to Whisper Dock with unfinished music','Taking the quietest stretch of pier for a private rehearsal near dusk',6,'stillwater-house','Trading songs and competitive glances with Owen during Stillwater Sessions'),
('hannah-mercer','{2,3,4,5,6}','Getting air along the pier before taking over the Drowned Bell bar','Working the bar through the Friday rush without surrendering the good playlist','Finishing the Saturday shift, then catching the last of Stillwater Sessions','Having a late sibling breakfast with Owen before a deliberately lazy afternoon',6,'stillwater-house','Stopping by her brother''s set once the Drowned Bell can spare her'),
('selene-morcant','{1,2,3,4,5,6}','Closing the baths with exacting calm, then dining at Stillwater House','Hosting Moonwake''s private evening appointments before a late Crimson Room drink','Taking an early private bathing hour, then attending Stillwater Sessions','Keeping Moonwake quiet and walking the lake only after the afternoon mist settles',6,'stillwater-house','Taking her regular discreet table while the Lakeward musicians perform'),
('jun-park','{1,2,3,4,5}','Cleaning field equipment, then cross-checking lake data at Blackglass','Running a dusk sampling pass before joining the Drowned Bell table','Taking a longer research transect, then comparing notes during Stillwater Sessions','Writing the weekly field summary and leaving one full afternoon free of data',6,'stillwater-house','Bringing only the harmless version of the week''s lake findings to dinner'),
('tomas-ferreira','{1,2,3,4,5,6}','Putting away rescue gear before an easy Drowned Bell supper','Finishing the last repair, then letting Raven Ward keep him out too late','Running the community rescue drill before joining Stillwater Sessions','Taking one boat out for pleasure and refusing to diagnose its engine by sound',6,'stillwater-house','Arriving late with Marina after every working boat is tied correctly'),
('owen-mercer','{0,3,4,5,6}','Rehearsing alone after Stillwater closes or walking Whisper Dock in silence','Playing the room past the planned final piece when the crowd is listening','Leading Stillwater Sessions and leaving room for Lyra to answer musically','Sharing a late breakfast with Hannah before a private afternoon at the piano',6,'stillwater-house','Anchoring Stillwater Sessions while the Lakeward circle drifts in and out'),

('celeste-moreau','{1,2,3,4,5}','Annotating a disputed source over supper at Rookery House','Following one archival contradiction into the Undercroft before going home','Taking the High Estate history walk with no lecture notes and one trusted colleague','Organizing next week''s seminar, then reading something with no footnotes at all',4,'rookery-house','Holding an informal faculty table where students may ask the difficult question'),
('maya-bennett-vespormoor','{1,2,3,4,5}','Studying at Rookery House until Maeve makes her eat something','Trading Friday''s lab coat for friends, food, and one drink she will nurse all night','Taking a long Mourning Cup study session, then escaping into Vesper Square','Meal-prepping, calling home, and doing only the revision that genuinely cannot wait',4,'rookery-house','Joining the younger university circle for food before the late study shift'),
('astrid-nygaard','{1,2,3,4,5}','Returning to the Observatory after dinner when the sky earns it','Running the late instrument sequence, then decompressing at Rookery House','Cross-checking old star plates with Jun before a long night at the Observatory','Sleeping late, walking the High Gardens, and checking the sky only once',4,'rookery-house','Meeting the research circle before the night''s Observatory work begins'),
('isabella-reyes-vespormoor','{1,2,3,4,5}','Leaving Blackglass through the High Gardens instead of taking work home','Closing the restricted desk before a quiet Mourning Cup drink','Cataloguing one personal research box, then joining friends away from the stacks','Reading for pleasure in the High Gardens and ignoring every unlabeled archive key',4,'rookery-house','Taking the archivists'' end of the faculty table with Celeste and Astrid'),
('maeve-kearney','{1,2,3,4,5,6}','Tending a plant experiment, then taking a Rookery House shift','Finishing the greenhouse notes before the student crowd takes over Rookery House','Walking to Witch''s Falls for specimens, then serving the late campus table','Helping Priya sort cuttings and cooking with Maya before the new week starts',4,'rookery-house','Working the table where the younger campus circle naturally gathers'),
('elodie-marchand','{1,2,3,4,5}','Sketching in the Cloisters before meeting friends at Rookery House','Dressing for Velvet Thorn only after finishing the week''s last visual analysis','Walking Old Vesper for overlooked ornament, then catching a gallery-minded crowd','Editing sketches at Mourning Cup and leaving the evening open to surprise',4,'rookery-house','Turning the campus table into a debate about taste with Dorian'),
('keira-sullivan','{1,2,3,4,5,6}','Recovering from the early coffee shift with friends in the dormitory lounge','Finishing class notes before taking the less responsible Rookery House table','Working the breakfast rush, then studying somewhere nobody orders from her','Sleeping past dawn, taking coffee as a customer, and calling the afternoon restorative',4,'rookery-house','Finally sitting down with the people she served all week'),
('zuri-campbell','{1,2,3,4,5}','Debugging the night''s calculation over dinner before returning upstairs','Running a long Observatory sequence with Rafael, then catching Nocturne late','Sleeping in, checking one calibration, and joining the student crowd after dark','Keeping the telescope covered and letting somebody else choose the evening plan',4,'rookery-house','Meeting Rafael and the campus circle before their night work splits them up'),
('lina-moreno','{1,2,3,4,5}','Redrawing one impossible stair detail at Rookery House','Walking Old Vesper to compare its rooflines with the High Estate','Sketching the castle from three elevations, then letting friends interrupt the fourth','Organizing the studio wall and taking a slow architecture walk with no assignment',4,'rookery-house','Spreading one permitted sketchbook across the younger circle''s table'),
('hana-watanabe','{1,2,3,4,5}','Playing the Grand Hall piano after classes or walking the High Gardens','Rehearsing one piece for herself before joining the Rookery House crowd','Researching chapel music, then performing informally for friends in Grand Hall','Taking a quiet chapel-record walk with Seraphine before an early night',4,'rookery-house','Joining the campus table after the last Grand Hall piece resolves'),
('dorian-bellamy','{2,3,4,5,6}','Writing after the bar closes, usually somewhere he should have left already','Working the Rookery House crowd, then catching Dead Letter''s final set','Sleeping late, reading one chapter, and bartending through the student rush','Taking Afterdark breakfast after close, then protecting a private writing afternoon',4,'rookery-house','Working the younger circle''s table while contributing more than requested'),
('rafael-ortega','{1,2,3,4,5}','Rebuilding a sensor, then eating whatever Rookery House still serves','Running the late Observatory diagnostic with Zuri before going out','Testing an instrument with no deadline, then joining friends at Nocturne','Keeping the equipment powered down and cooking a proper dinner for study partners',4,'rookery-house','Meeting Zuri and friends before the Observatory claims the night'),

('rowan-hale','{1,2,3,4,5,6}','Writing the trail report at The Crooked Oak instead of taking it home','Checking the Standing Stones route before a late Crooked Oak supper','Patrolling the longest public trail, then joining the ranger table after dark','Walking one short boundary with Callum before the Thornwood circle''s late lunch',0,'crooked-oak','Joining the Thornwood circle after the Sunday boundary check'),
('amara-nwosu','{1,2,3,4,5,6}','Closing the last cabin, then eating with Willow at The Crooked Oak','Preparing a small fire and a generous meal for the weekend''s arriving guests','Checking Foxglove cabins, trading herbs with Priya, and joining the ranger supper','Hosting the Thornwood circle for a late meal after everyone finishes their routes',0,'crooked-oak','Bringing cabin bread and the week''s practical news to the Sunday table'),
('freya-lind','{1,2,3,4,5,6}','Editing first-light photographs over dinner at The Crooked Oak','Catching Raven Ward music after a week spent listening to water and wind','Shooting the quarry at dusk, then trading the camera bag for the Crooked Oak table','Taking portraits of the Thornwood circle only after they stop posing for them',0,'crooked-oak','Arriving with prints from the week and no promise to show the flattering ones'),
('willow-thorne','{2,3,4,5,6}','Gathering before the Crooked Oak shift and cooking until the room settles','Serving the late forest crowd, then walking home by the safe route','Foraging early, running the busiest kitchen service, and saving food for friends','Cooking the Thornwood circle''s slow Sunday meal from what the week provided',0,'crooked-oak','Feeding the ranger and retreat circle without turning supper into ceremony'),
('sofia-alvarez','{1,2,3,4,5}','Cleaning quarry dust from her notes over dinner at The Crooked Oak','Finishing the week''s core samples before letting Lakeward distract her','Hiking the quarry perimeter for herself, then joining Raven Ward friends after dark','Comparing field notes with Callum before the Thornwood circle''s long supper',0,'crooked-oak','Bringing one unsettling geological observation to the Sunday table'),
('callum-reid','{1,2,3,4,5,6}','Finishing radio checks before taking the ranger table at The Crooked Oak','Walking the Moonstone road after dark, then eating later than intended','Running the weekend safety briefing and taking the deep patrol himself','Making the short boundary round with Rowan before the circle gathers for supper',0,'crooked-oak','Keeping the ranger table practical until somebody else orders dessert'),

('dahlia-kane','{0,3,4,5,6}','Building a set in private before Nocturne becomes public','Owning the Friday room from sound-check through the last clean transition','Headlining Nocturne, then eating breakfast with the Raven Ward night shift','Sleeping through the afternoon and playing a looser Sunday-night set for regulars',0,'afterdark-diner','Taking the booth where Raven Ward workers decompress after close'),
('katya-morozova','{2,3,4,5,6}','Checking reservations and staff details before the Crimson Room opens','Managing the Friday room without allowing its urgency to become visible','Running the room''s most demanding service, then taking breakfast at Afterdark','Keeping the Crimson Room closed and holding a private supplier dinner instead',0,'afterdark-diner','Joining the ward''s after-hours breakfast once every guest has left safely'),
('nia-holloway','{2,3,4,5,6}','Closing the tattoo station, then catching a Dead Letter rehearsal','Finishing a detailed appointment before meeting friends at Nocturne','Taking walk-ins, drawing between clients, and staying for Lena''s full set','Sketching at Afterdark while the night-shift circle tells the edited version',0,'afterdark-diner','Taking the end booth with Lena after both of their rooms finally close'),
('lena-kovacs','{3,4,5,6}','Rehearsing until the song stops sounding careful','Playing the Friday Dead Letter set, then finding food with Nia','Sound-checking late and staying onstage for the Saturday crowd','Writing at Mourning Cup before the Raven Ward circle''s after-hours breakfast',0,'afterdark-diner','Bringing a half-finished chorus to the booth where nobody demands a performance'),
('roxy-bell','{2,3,4,5,6}','Starting the overnight counter with a fresh pot and a complete read of the room','Working the diner through Raven Ward''s loudest, hungriest after-hours wave','Keeping the counter moving until dawn, then walking the long way home','Serving the familiar Sunday-night crowd and saving the corner booth for family',0,'afterdark-diner','Holding the after-hours table together while pretending it is not her social life'),
('luca-ferraro','{1,2,3,4,5,6}','Managing late arrivals, quiet requests, and the hotel''s least cooperative lift','Keeping Saint Mercy graceful through Friday''s complicated check-ins','Handling the hotel''s longest night, then eating breakfast at Afterdark','Taking a post-shift run, sleeping late, and leaving the evening genuinely unscheduled',0,'afterdark-diner','Joining Roxy and the ward managers only after the night audit balances');

create temporary table vespormoor_schedule_characters on commit drop as
select
  template.id template_id,template.slug,template.name,template.occupation,
  version.id version_id,version.interests,version.default_social_graph,
  version.life_config->'occupation'->>'workPattern' shift_kind,
  version.life_config->'occupation'->>'primaryLocationSlug' work_slug,
  version.life_config->'occupation'->'activityVariants'->>0 work_activity,
  version.life_config->'publicLocationSlugs'->>1 leisure_slug,
  version.life_config->'publicLocationSlugs'->>2 evening_slug,
  version.life_config->'publicLocationSlugs'->>3 weekend_slug,
  version.life_config->'publicScheduleNotes'->>1 leisure_activity,
  flavor.work_days,flavor.weekday_evening,flavor.friday_activity,
  flavor.saturday_activity,flavor.sunday_activity,flavor.community_day,
  flavor.community_slug,flavor.community_activity
from public.together_character_templates template
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version
join vespormoor_schedule_flavor flavor on flavor.slug=template.slug
where template.id::text like '22000000-0000-4000-8010-%';

delete from public.together_schedule_templates schedule
using vespormoor_schedule_characters character
where schedule.character_version_id=character.version_id;

with day_grid as(
  select character.*,day_number::smallint day_of_week,
    day_number=any(character.work_days) is_workday,
    ((day_number+6)%7)=any(character.work_days) previous_day_was_workday,
    case
      when day_number=character.community_day then character.community_slug
      when day_number in(5,6) then character.weekend_slug
      when day_number=0 then character.leisure_slug
      else character.evening_slug
    end day_evening_slug,
    case
      when day_number=character.community_day then character.community_activity
      when day_number=5 then character.friday_activity
      when day_number=6 then character.saturday_activity
      when day_number=0 then character.sunday_activity
      else character.weekday_evening
    end day_focus_activity,
    case
      when day_number=5 then 'Friday variation'
      when day_number=6 then 'Saturday variation'
      when day_number=0 then 'Sunday variation'
      else 'Weekday routine'
    end day_variant,
    case
      when character.shift_kind in('early','academic_early','day','academic','late_day') then 'daylight'
      when character.shift_kind='late_academic' then 'late_academic'
      when character.shift_kind in('evening','evening_academic') then 'evening'
      when character.shift_kind='overnight' then 'overnight'
      else 'night'
    end schedule_family
  from vespormoor_schedule_characters character
  cross join generate_series(0,6) day_number
), timed as(
  select grid.*,segment.* from day_grid grid
  cross join lateral(values
    (1,0,case grid.shift_kind when 'early' then 330 when 'academic_early' then 330 when 'late_day' then 480 else 390 end,'sleep'),
    (2,case grid.shift_kind when 'early' then 330 when 'academic_early' then 330 when 'late_day' then 480 else 390 end,case grid.shift_kind when 'early' then 420 when 'academic_early' then 420 when 'late_day' then 600 else 480 end,'home_morning'),
    (3,case grid.shift_kind when 'early' then 420 when 'academic_early' then 420 when 'late_day' then 600 else 480 end,case grid.shift_kind when 'early' then 780 when 'academic_early' then 780 when 'academic' then 900 when 'late_day' then 1050 else 960 end,'main'),
    (4,case grid.shift_kind when 'early' then 780 when 'academic_early' then 780 when 'academic' then 900 when 'late_day' then 1050 else 960 end,case grid.shift_kind when 'early' then 1020 when 'academic_early' then 960 when 'academic' then 990 when 'late_day' then 1110 else 1050 end,'personal'),
    (5,case grid.shift_kind when 'early' then 1020 when 'academic_early' then 960 when 'academic' then 990 when 'late_day' then 1110 else 1050 end,case grid.shift_kind when 'late_day' then 1410 else 1320 end,'evening'),
    (6,case grid.shift_kind when 'late_day' then 1410 else 1320 end,1440,'sleep')
  ) segment(slot,start_minute,end_minute,role)
  where grid.schedule_family='daylight'

  union all
  select grid.*,segment.* from day_grid grid
  cross join lateral(values
    (1,0,480,'sleep'),(2,480,600,'home_morning'),(3,600,780,'personal'),
    (4,780,1020,'main'),(5,1020,1410,'evening'),(6,1410,1440,'sleep')
  ) segment(slot,start_minute,end_minute,role)
  where grid.schedule_family='late_academic'

  union all
  select grid.*,segment.* from day_grid grid
  cross join lateral(values
    (1,0,120,'after_midnight'),(2,120,540,'sleep'),(3,540,720,'home_morning'),
    (4,720,990,'personal'),(5,990,1320,'prep_work'),(6,1320,1440,'late_work')
  ) segment(slot,start_minute,end_minute,role)
  where grid.schedule_family='evening'

  union all
  select grid.*,segment.* from day_grid grid
  cross join lateral(values
    (1,0,180,'after_midnight'),(2,180,720,'sleep'),(3,720,840,'home_morning'),
    (4,840,1020,'personal'),(5,1020,1320,'prep_work'),(6,1320,1440,'late_work')
  ) segment(slot,start_minute,end_minute,role)
  where grid.schedule_family='night'

  union all
  select grid.*,segment.* from day_grid grid
  cross join lateral(values
    (1,0,360,'after_midnight'),(2,360,780,'sleep'),(3,780,900,'home_morning'),
    (4,900,1080,'personal'),(5,1080,1320,'prep_work'),(6,1320,1440,'late_work')
  ) segment(slot,start_minute,end_minute,role)
  where grid.schedule_family='overnight'
), routed as(
  select timed.*,
    case
      when role in('sleep','home_morning') then null
      when role='after_midnight' then case when previous_day_was_workday then work_slug else null end
      when role='main' then case when is_workday then work_slug when day_of_week=0 then leisure_slug else weekend_slug end
      when role='personal' then leisure_slug
      when role='evening' and shift_kind='late_academic' and is_workday then work_slug
      when role='evening' then day_evening_slug
      when role in('prep_work','late_work') and is_workday then work_slug
      else day_evening_slug
    end location_slug,
    case
      when role='sleep' then 'Sleeping at home'
      when role='after_midnight' and previous_day_was_workday then 'Finishing the night''s work before heading home'
      when role='after_midnight' then 'Sleeping at home'
      when role='home_morning' then case when schedule_family in('night','overnight') then 'Taking a private afternoon at home' else 'Starting the day at home' end
      when role='main' and is_workday then work_activity
      when role='main' then day_focus_activity
      when role='personal' then leisure_activity
      when role='evening' and shift_kind='late_academic' and is_workday then work_activity
      when role='evening' then day_focus_activity
      when role='prep_work' and is_workday then 'Preparing for '||lower(occupation)||' responsibilities before the night begins'
      when role='late_work' and is_workday then work_activity
      else day_focus_activity
    end activity
  from timed
), located as(
  select routed.*,location.id location_id,location.name location_name
  from routed
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000010' and location.slug=routed.location_slug
), final_rows as(
  select located.*,
    case
      when role='sleep' or (role='after_midnight' and not previous_day_was_workday) then 'sleep'
      when role='home_morning' then 'home_reset'
      when role in('main','evening','prep_work','late_work','after_midnight') and
        (is_workday or (role='after_midnight' and previous_day_was_workday)) and
        (role not in('evening') or shift_kind='late_academic') then 'occupation_'||replace(slug,'-','_')
      when role='personal' then 'personal_interest_'||replace(slug,'-','_')
      else 'social_routine_'||replace(slug,'-','_')
    end activity_key,
    case
      when role='sleep' or (role='after_midnight' and not previous_day_was_workday) then 'busy'
      when role='after_midnight' and previous_day_was_workday then 'busy'
      when role in('main','late_work') and is_workday then 'busy'
      when role='evening' and shift_kind='late_academic' and is_workday then 'busy'
      when role='prep_work' and is_workday then 'limited'
      when role='home_morning' then 'limited'
      else 'available'
    end availability,
    case
      when role='sleep' or (role='after_midnight' and not previous_day_was_workday) then 'sleep'
      when role='after_midnight' and previous_day_was_workday then 'focused'
      when role in('main','late_work') and is_workday then 'focused'
      when role='evening' and shift_kind='late_academic' and is_workday then 'intent'
      when role in('personal','evening') then 'engaged'
      else 'easy'
    end mood,
    jsonb_build_array(
      activity,
      case
        when role='sleep' or (role='after_midnight' and not previous_day_was_workday) then 'Getting uninterrupted sleep at home'
        when role='home_morning' then 'Taking time at home with '||coalesce(interests[1],'a familiar private routine')
        when role='personal' then 'Making time for '||coalesce(interests[1],'a personal interest')||' at '||coalesce(location_name,'home')
        when role in('main','late_work') and is_workday then 'Following through on the day''s '||lower(occupation)||' responsibilities at '||coalesce(location_name,'home')
        else 'Taking the '||lower(day_variant)||' at '||coalesce(location_name,'home')||' without forcing the pace'
      end,
      case
        when role='sleep' or (role='after_midnight' and not previous_day_was_workday) then 'Sleeping at home with the phone quiet'
        when role='home_morning' then 'Getting ready at home while leaving room for '||coalesce(interests[2],interests[1],'the day ahead')
        when role='personal' then leisure_activity
        when role in('main','late_work') and is_workday then work_activity
        else day_focus_activity
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
    'source','vespormoor_authored_schedule_v2',
    'scheduleMode','authored',
    'scheduleProfile','vespormoor_rich_weekly_v2',
    'profileVisibility','visible',
    'displayLocation',case when location_id is null then 'Home' else location_name end,
    'activityKey',activity_key,
    'activityVariants',activity_variants,
    'priority',case
      when activity_key like 'occupation_%' then 'hard_obligation'
      when activity_key='sleep' then 'recurring_routine'
      else 'preferred_activity'
    end,
    'dayVariant',day_variant,
    'slot',slot,
    'worldSlug','vespormoor',
    'routineKind',role,
    'potentialCompanionSlugs',default_social_graph,
    'communityAnchor',case when day_of_week=community_day and location_slug=community_slug then community_activity else null end,
    'contextCue','This is an established independent routine, not proof of a shared scene or an invitation.',
    'authoredCoverage','full_day',
    'promptVersion',2
  ))
from final_rows;

update public.together_character_versions version
set life_config=jsonb_set(
  version.life_config,
  '{scheduling}',
  coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object(
    'repetitionTolerance',.12,
    'preferredDailyActivityCount',jsonb_build_array(4,6),
    'generationVersion','vespormoor_authored_weekly_v2',
    'scheduleProfile','vespormoor_rich_weekly_v2',
    'authoredCoverage','full_week',
    'activityVariantCount',3,
    'socialOverlapAware',true,
    'privateTimeAuthored',true
  ),
  true
),updated_at=now()
where version.id::text like '23000000-0000-4000-8010-%';

update public.together_character_world_presence presence
set metadata=presence.metadata||jsonb_build_object(
  'dynamicSchedule',true,
  'scheduleProfile','vespormoor_rich_weekly_v2',
  'scheduleDepth','full_day_character_specific',
  'activityVariants',true,
  'socialOverlapAware',true
),updated_at=now()
where presence.world_id='10000000-0000-4000-8000-000000000010'
  and presence.character_version_id::text like '23000000-0000-4000-8010-%';

-- Future recurring materializations must be rebuilt from the new authored pack.
delete from public.together_character_schedule_events event
using public.together_character_instances instance
where event.character_instance_id=instance.id
  and instance.character_version_id::text like '23000000-0000-4000-8010-%'
  and event.source in('generated','recurring')
  and event.starts_at>=date_trunc('day',now());

-- Main portraits remain the canonical generation references. Additional profile
-- gallery art is packaged by the client, mirroring NEON KYO's carousel pattern.
create temporary table vespormoor_portrait_seed(slug text primary key,storage_path text not null) on commit drop;
insert into vespormoor_portrait_seed values
('adelaide-hawthorne','vespormoor/adelaide-hawthorne/main.jpg'),
('amara-nwosu','vespormoor/amara-nwosu/main.jpg'),
('astrid-nygaard','vespormoor/astrid-nygaard/main.jpg'),
('camille-laurent-vespormoor','vespormoor/camille-laurent-vespormoor/main.jpg'),
('celeste-moreau','vespormoor/celeste-moreau/main.jpg'),
('clara-whitmore','vespormoor/clara-whitmore/main.jpg'),
('dahlia-kane','vespormoor/dahlia-kane/main.jpg'),
('elara-vale','vespormoor/elara-vale/main.jpg'),
('evelyn-harrow','vespormoor/evelyn-harrow/main.jpg'),
('freya-lind','vespormoor/freya-lind/main.jpg'),
('hannah-mercer','vespormoor/hannah-mercer/main.jpg'),
('isabella-reyes-vespormoor','vespormoor/isabella-reyes-vespormoor/main.jpg'),
('jun-park','vespormoor/jun-park/main.jpg'),
('katya-morozova','vespormoor/katya-morozova/main.jpg'),
('lyra-vane','vespormoor/lyra-vane/main.jpg'),
('maeve-kearney','vespormoor/maeve-kearney/main.jpg'),
('maya-bennett-vespormoor','vespormoor/maya-bennett-vespormoor/main.jpg'),
('mirelle-voss','vespormoor/mirelle-voss/main.jpg'),
('naomi-okafor','vespormoor/naomi-okafor/main.jpg'),
('priya-raman','vespormoor/priya-raman/main.jpg'),
('rowan-hale','vespormoor/rowan-hale/main.jpg'),
('selene-morcant','vespormoor/selene-morcant/main.jpg'),
('seraphine-orison','vespormoor/seraphine-orison/main.jpg'),
('sofia-alvarez','vespormoor/sofia-alvarez/main.jpg'),
('vivienne-blackwood','vespormoor/vivienne-blackwood/main.jpg'),
('willow-thorne','vespormoor/willow-thorne/main.jpg');

update public.together_character_versions version
set portrait_asset_key=template.slug,
    visual_identity=jsonb_set(
      coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object('status','reference_ready'),
      '{referenceStoragePaths}',jsonb_build_array(portrait.storage_path),true
    ),
    appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','ready','portraitStatus','reference_ready','referenceStoragePath',portrait.storage_path
    ),
    updated_at=now()
from public.together_character_templates template
join vespormoor_portrait_seed portrait on portrait.slug=template.slug
where version.character_template_id=template.id and version.version=template.current_published_version;

update public.together_character_templates template
set discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
  'portraitStatus','ready','portraitSlotKey','vespormoor-character-'||template.slug
),updated_at=now()
from vespormoor_portrait_seed portrait
where portrait.slug=template.slug;

update public.together_character_world_presence presence
set metadata=presence.metadata||jsonb_build_object('portraitStatus','ready'),updated_at=now()
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
join vespormoor_portrait_seed portrait on portrait.slug=template.slug
where presence.character_version_id=version.id
  and presence.world_id='10000000-0000-4000-8000-000000000010';

do $$
declare
  character_count integer;
  schedule_count integer;
  complete_day_count integer;
  overlap_count integer;
  invalid_location_count integer;
  missing_variant_count integer;
  uncovered_check_count integer;
  portrait_count integer;
begin
  select count(*) into character_count from vespormoor_schedule_characters;
  select count(*) into schedule_count
  from public.together_schedule_templates
  where character_version_id::text like '23000000-0000-4000-8010-%'
    and metadata->>'source'='vespormoor_authored_schedule_v2';
  select count(*) into complete_day_count from(
    select character_version_id,day_of_week
    from public.together_schedule_templates
    where character_version_id::text like '23000000-0000-4000-8010-%'
      and metadata->>'source'='vespormoor_authored_schedule_v2'
    group by character_version_id,day_of_week having count(*)=6
  ) days;
  select count(*) into overlap_count
  from public.together_schedule_templates left_schedule
  join public.together_schedule_templates right_schedule
    on right_schedule.character_version_id=left_schedule.character_version_id
   and right_schedule.day_of_week=left_schedule.day_of_week
   and right_schedule.id>left_schedule.id
   and right_schedule.start_minute<left_schedule.end_minute
   and left_schedule.start_minute<right_schedule.end_minute
  where left_schedule.character_version_id::text like '23000000-0000-4000-8010-%';
  select count(*) into invalid_location_count
  from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and(
      (schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid)
      or(
        schedule.location_id is null
        and schedule.metadata->>'activityKey'<>'sleep'
        and schedule.metadata->>'routineKind'<>'home_morning'
      )
    );
  select count(*) into missing_variant_count
  from public.together_schedule_templates schedule
  where schedule.character_version_id::text like '23000000-0000-4000-8010-%'
    and jsonb_array_length(coalesce(schedule.metadata->'activityVariants','[]'::jsonb))<3;
  select count(*) into uncovered_check_count
  from public.together_character_versions version
  cross join generate_series(0,6) day_number
  cross join(values(0),(480),(720),(960),(1200)) check_time(minute_of_day)
  where version.id::text like '23000000-0000-4000-8010-%'
    and not exists(
      select 1 from public.together_schedule_templates schedule
      where schedule.character_version_id=version.id
        and schedule.day_of_week=day_number
        and schedule.start_minute<=check_time.minute_of_day
        and schedule.end_minute>check_time.minute_of_day
    );
  select count(*) into portrait_count
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  join vespormoor_portrait_seed portrait on portrait.slug=template.slug
  where version.portrait_asset_key=template.slug
    and version.visual_identity->'referenceStoragePaths'->>0=portrait.storage_path;

  if character_count<>45 or schedule_count<>1890 or complete_day_count<>315 or overlap_count<>0
    or invalid_location_count<>0 or missing_variant_count<>0 or uncovered_check_count<>0 or portrait_count<>26 then
    raise exception 'Vespormoor schedule depth validation failed: characters %, schedules %, complete days %, overlaps %, invalid locations %, missing variants %, uncovered checks %, portraits %',
      character_count,schedule_count,complete_day_count,overlap_count,invalid_location_count,missing_variant_count,uncovered_check_count,portrait_count;
  end if;
end $$;

commit;
