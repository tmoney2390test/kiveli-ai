begin;

-- Juniper Life Engine V2. These lightweight authored places give professional
-- schedules a real canonical location instead of placing every job "nearby".
insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
) values
('11000000-0000-4000-8000-000000000029','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Juniper General Hospital','juniper-general-hospital','Juniper City''s busy teaching hospital and emergency center.','healthcare',null,'{"default":"00:00-23:59"}',array['emergency shift','clinical rounds','hospital visit'],'{"tags":["healthcare","hospital","work","public service"]}','venue',29,1,'{"canonicalPrompt":"a grounded contemporary city teaching hospital with a glass emergency entrance and warm clinical interior lighting","avoid":["futuristic medicine","abandoned hospital"]}','{"summary":"A twenty-four-hour teaching hospital serving Juniper and the surrounding county.","stableFacts":["The emergency department operates around the clock.","Clinical details remain private unless a canonical event makes them shareable."]}'),
('11000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Alder Elementary School','alder-elementary-school','A neighborhood elementary school with a busy art room and a tree-lined courtyard.','education',null,'{"default":"07:00-18:00","sat":"closed","sun":"closed"}',array['teaching','art class','lesson planning'],'{"tags":["school","education","art","work"]}','venue',30,1,'{"canonicalPrompt":"a welcoming contemporary brick elementary school with colorful student art and a tree-lined courtyard","avoid":["empty institutional hallway","university campus"]}','{"summary":"Alder Elementary is known locally for its arts program and courtyard exhibitions.","stableFacts":["The school day is weekday-only.","Children are never used as romantic or private-scene content."]}'),
('11000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Mercer Row Law Offices','mercer-row-law-offices','A polished downtown law office overlooking Alder District.','office',null,'{"default":"07:30-21:00","sat":"09:00-16:00","sun":"closed"}',array['case preparation','client meeting','legal research'],'{"tags":["law","office","professional","work"]}','venue',31,1,'{"canonicalPrompt":"a refined contemporary law office with walnut conference rooms, city views, and restrained lighting"}','{"summary":"Mercer Row houses several of Juniper''s corporate and civic law practices."}'),
('11000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Alder Central Precinct','alder-central-precinct','Juniper''s central detective and public-safety offices.','public_service',null,'{"default":"00:00-23:59"}',array['case follow-up','briefing','paperwork'],'{"tags":["police","detective","public service","work"]}','venue',32,1,'{"canonicalPrompt":"a realistic contemporary city police precinct with brick exterior, practical offices, and subdued fluorescent lighting","avoid":["militarized fortress","crime scene gore"]}','{"summary":"Alder Central coordinates investigations and public safety across the city core.","stableFacts":["Active cases remain confidential unless canonical story content says otherwise."]}'),
('11000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Juniper Firehouse 14','juniper-firehouse-14','A working city firehouse with an apparatus bay, kitchen, and upstairs crew quarters.','public_service',null,'{"default":"00:00-23:59"}',array['station shift','equipment check','crew meal'],'{"tags":["fire station","public service","work","shift"]}','venue',33,1,'{"canonicalPrompt":"a realistic brick city firehouse with red apparatus doors, functional crew kitchen, and well-used equipment bay","avoid":["active disaster","fantasy fire station"]}','{"summary":"Firehouse 14 covers Alder District through long rotating shifts.","stableFacts":["Crews may be called away without notice."]}'),
('11000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Forgeworks Design Lab','forgeworks-design-lab','A shared industrial and digital design workshop in a renovated warehouse.','studio',null,'{"default":"07:00-23:00","sun":"10:00-20:00"}',array['prototype review','product design','game development','fabrication'],'{"tags":["industrial design","technology","studio","work","creative"]}','venue',34,1,'{"canonicalPrompt":"a renovated industrial design workshop with prototype benches, computers, material samples, and warm warehouse windows"}','{"summary":"Forgeworks rents project bays to Juniper''s independent product and digital designers."}'),
('11000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Juniper College','juniper-college','A compact urban college campus woven into the east edge of Alder District.','education',null,'{"default":"07:00-23:00"}',array['class','study session','campus event'],'{"tags":["college","education","student","library"]}','venue',35,1,'{"canonicalPrompt":"a contemporary urban college campus with brick academic buildings, shaded courtyards, and active study spaces"}','{"summary":"Juniper College mixes city-facing programs with a compact walkable campus."}'),
('11000000-0000-4000-8000-000000000036','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Summit Climbing Hall','summit-climbing-hall','A bright bouldering and rope-climbing gym near the Riverwalk.','fitness',null,'{"default":"06:00-23:00"}',array['climbing lesson','bouldering','training'],'{"tags":["climbing","fitness","instruction","work"]}','venue',36,1,'{"canonicalPrompt":"a bright contemporary indoor climbing gym with textured walls, rope lanes, crash mats, and daylight from high windows"}','{"summary":"Summit draws serious climbers, beginners, and Juniper College outdoor clubs."}'),
('11000000-0000-4000-8000-000000000037','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Alder Lofts','alder-lofts','Converted brick loft residences in Alder District.','residence',null,null,array['home routine'],'{"tags":["residence","private","home"],"directoryVisibility":"private"}','residence',37,1,'{"canonicalPrompt":"warm contemporary loft apartment interiors inside a renovated brick building"}','{"summary":"Private residences in a renovated Alder warehouse."}'),
('11000000-0000-4000-8000-000000000038','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Riverline Apartments','riverline-apartments','A modern residential building a few blocks from the Riverwalk.','residence',null,null,array['home routine'],'{"tags":["residence","private","home"],"directoryVisibility":"private"}','residence',38,1,'{"canonicalPrompt":"grounded modern apartment interiors with warm wood, broad windows, and subtle river views"}','{"summary":"Private apartments near the Riverwalk."}'),
('11000000-0000-4000-8000-000000000039','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000023','Eastgate Flats','eastgate-flats','Quiet contemporary flats near Juniper College.','residence',null,null,array['home routine'],'{"tags":["residence","private","home"],"directoryVisibility":"private"}','residence',39,1,'{"canonicalPrompt":"comfortable contemporary city flat interiors with bookshelves, practical kitchens, and soft window light"}','{"summary":"Private flats on the quieter college side of Alder."}')
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,slug=excluded.slug,
  description=excluded.description,category=excluded.category,hours=excluded.hours,possible_activities=excluded.possible_activities,
  metadata=excluded.metadata,location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

create temporary table kivelle_juniper_life_v2(
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
  second_recovery int4range,
  activities text[] not null
) on commit drop;

-- Activity rows use: key|label|location slug|category|start|end|max/week|hint|outcome.
-- A blank outcome is not eligible for event materialization.
insert into kivelle_juniper_life_v2 values
('miranda-serrano','freelance','forgeworks-design-lab',array[1,2,3,4,5],510,630,330,480,array['reviewing a mixed-use site plan','sketching a client concept','presenting a design revision'],'meal',null,null,null,null,null,null,null,null,array[
 'site_walk|Walking a renovation site|alder-district|creative|480|1080|2|May visit a project site later|A hidden structural detail forced Miranda to rethink part of a design.',
 'rooftop_sketch|Sketching the skyline|skyline-rooftop|creative|960|1260|2|Might sketch from a rooftop later|The changing light gave Miranda the missing idea for a facade.',
 'building_photos|Photographing old buildings|riverwalk|creative|540|1140|2|May photograph old buildings later|',
 'gallery_research|Studying an installation|glassline-gallery|culture|660|1260|2|May stop by Glassline later|An installation changed how Miranda wanted a room to feel.',
 'tennis_session|Playing a focused tennis set|meridian-fitness|fitness|420|1140|2|Might get a match in later|',
 'design_dinner|Trading design opinions over dinner|sora-table|social|1020|1320|1|May meet a design friend for dinner|A casual dinner turned into a promising collaboration.' ]),
('nia-brooks','shifts','juniper-civic-arena',array[1,2,4,5,6],600,900,300,480,array['preparing an arena segment','interviewing a coach after practice','editing a game-night report'],'none',null,null,null,null,null,null,null,null,array[
 'arena_practice|Covering arena practice|juniper-civic-arena|work|540|1140|3|May head to arena practice later|A player gave Nia the candid answer her segment needed.',
 'boxing_card|Researching a fight card|juniper-civic-arena|sports|900|1320|1|May cover a fight card tonight|Nia caught a tactical detail everyone else missed.',
 'pickup_basketball|Playing a competitive pickup game|juniper-civic-arena|fitness|600|1200|2|Might play pickup later|',
 'arcade_rivalry|Trying to take the high score|pixel-and-pint|social|960|1380|2|May test an arcade score later|A stranger finally beat Nia and made the rematch personal.',
 'sneaker_hunt|Looking for a limited sneaker release|common-market|shopping|600|1140|1|Might chase a sneaker release|Nia found the last pair in her size after nearly giving up.',
 'late_breakdown|Recording a late game breakdown|juniper-civic-arena|work|1080|1410|1|May record after the game|Her unscripted postgame take became the strongest part of the piece.' ]),
('sophie-laurent','shifts','moss-and-crumb',array[2,3,4,5,6],270,330,420,540,array['laminating the morning pastry dough','finishing the first pastry batch','testing the day''s fruit filling'],'none',null,null,null,null,null,null,null,null,array[
 'market_ingredients|Choosing fruit at Common Market|common-market|errand|420|720|2|May shop for fruit after the bake|A farmer set aside an unusual fruit that inspired Sophie''s next special.',
 'cookbook_search|Hunting for a vintage baking book|paper-trail|culture|600|1080|2|Might look for an old recipe later|Sophie found a handwritten recipe tucked inside a used cookbook.',
 'jazz_table|Listening quietly near the piano|velvet-hour|culture|1080|1380|1|May listen to jazz tonight|A melody gave Sophie an unexpectedly precise dessert idea.',
 'board_game|Playing a careful board game|pixel-and-pint|social|960|1320|1|May join a board-game table later|',
 'recipe_test|Testing a pastry recipe at home|alder-district|home|900|1260|2|May test a new recipe later|The imperfect batch tasted better than the precise one.',
 'early_walk|Taking a quiet post-shift walk|riverwalk|outdoors|660|1020|2|May walk after the morning shift|']),
('priya-kapoor','shifts','juniper-general-hospital',array[1,3],420,540,540,660,array['working an emergency department shift','reviewing a difficult handoff','covering the emergency floor'],'none','juniper-general-hospital',array[5],1140,1260,600,720,array['working an overnight emergency shift','covering the emergency floor overnight'],int4range(360,451,'[]'),array[
 'post_shift_music|Unwinding with live music|lucky-note|nightlife|1020|1380|1|May stop for one song after work|One song reset Priya''s mood after a difficult shift.',
 'wine_dinner|Having a slow dinner and a glass of wine|sora-table|food|1020|1320|1|Might protect a quiet dinner tonight|A conversation over dinner gave Priya a new perspective on the week.',
 'dance_night|Dancing off the week|lucky-note|nightlife|1080|1410|1|May go dancing later|',
 'travel_planning|Planning a future trip over coffee|juniper-cafe|cafe|600|1080|1|Might plan a trip over coffee|Priya finally chose the place she wants to visit next.',
 'people_watch|People-watching from a quiet table|velvet-hour|social|1020|1350|1|May take a quiet table later|',
 'recovery_day|Sleeping late after an overnight shift|alder-district|home|480|900|2|Will probably rest after the night shift|' ]),
('jade-nguyen','shifts','needles-and-notes',array[2,3,4,5,6],600,720,360,480,array['drawing a custom tattoo concept','cleaning up a new flash sheet','helping set up for an appointment'],'none',null,null,null,null,null,null,null,null,array[
 'flash_sketches|Sketching a new flash sheet|needles-and-notes|creative|540|1200|3|May sketch new flash later|A discarded sketch turned into Jade''s strongest design of the week.',
 'punk_set|Watching a punk set from the front|static-house|nightlife|1080|1410|1|May catch a punk set tonight|The opener was better than the band Jade came to see.',
 'record_browse|Digging through the indie record shelf|needles-and-notes|culture|660|1140|2|Might browse records later|Jade found an album cover that unlocked a visual idea.',
 'motorcycle_fix|Working on a motorcycle detail|forgeworks-design-lab|creative|720|1200|1|May work on the bike later|',
 'streetwear_hunt|Hunting for a strange vintage piece|common-market|shopping|600|1140|1|Might hunt for something unusual|',
 'anime_night|Watching anime and drawing at home|alder-district|home|1080|1380|2|May draw through an anime marathon|' ]),
('camila-reyes','shifts','sora-table',array[2,3,4,5,6],840,960,480,600,array['running Sora''s dinner service','reviewing the evening menu with the kitchen','mentoring a chef before service'],'none',null,null,null,null,null,null,null,null,array[
 'market_menu|Choosing ingredients at Common Market|common-market|food|480|720|2|May shop the market before service|A late-season ingredient changed Camila''s menu plan.',
 'chef_brunch|Mentoring a young chef over brunch|ember-and-rye|social|600|900|1|May meet a chef for brunch|Her mentee brought a dish that made Camila reconsider her advice.',
 'wine_tasting|Tasting a new wine for the list|velvet-hour|food|900|1200|1|May taste something for the wine list|Camila found the bottle that finally fit a difficult course.',
 'salsa_evening|Going out for salsa|lucky-note|nightlife|1140|1410|1|Might go dancing after service|',
 'menu_notes|Writing menu notes in a quiet cafe|juniper-cafe|creative|540|960|2|May work through menu ideas over coffee|',
 'home_cooking|Cooking something simple at home|alder-district|home|960|1260|2|May keep dinner simple tonight|' ]),
('hannah-mercin','fixed_weekdays','alder-elementary-school',array[1,2,3,4,5],450,495,420,480,array['teaching an elementary art class','preparing a classroom pottery project','hanging student work for the hallway'],'meal',null,null,null,null,null,null,null,null,array[
 'pottery_session|Working on pottery after school|forgeworks-design-lab|creative|960|1200|2|May work on pottery later|A collapsed clay piece became something Hannah wanted to keep.',
 'horror_browse|Looking for a terrible horror cover|paper-trail|culture|960|1200|2|May browse horror novels later|Hannah found a horror novel whose cover was too bad not to buy.',
 'teacher_hike|Taking a decompression hike|halcyon-park|outdoors|960|1200|2|May walk the park after class|',
 'trivia_team|Joining a trivia team|northside-bar|social|1140|1320|1|May play trivia tonight|Hannah unexpectedly carried the team through the final round.',
 'classroom_supplies|Choosing odd art supplies|common-market|errand|960|1140|1|Might pick up art supplies later|',
 'horror_movie|Watching a horror movie at Marquee|marquee-cinema|entertainment|1080|1320|1|May catch a horror movie later|' ]),
('amara-okafor','fixed_weekdays','mercer-row-law-offices',array[1,2,3,4,5],510,570,480,540,array['preparing a corporate negotiation','reviewing a demanding case file','leading a client strategy meeting'],'meal',null,null,null,null,null,null,null,null,array[
 'gallery_reset|Taking a quiet pass through Glassline|glassline-gallery|culture|1020|1260|1|May stop at Glassline after work|An installation gave Amara the argument she needed to hear differently.',
 'tennis_match|Playing a disciplined tennis match|meridian-fitness|fitness|1020|1260|2|May play tennis after work|',
 'fashion_appointment|Reviewing a new designer collection|common-market|shopping|1020|1260|1|Might look at a new collection later|',
 'podcast_walk|Taking a walk with a long-form podcast|riverwalk|outdoors|960|1200|2|May clear her head by the river|',
 'cook_dinner|Cooking a precise dinner at home|alder-district|home|1080|1320|2|May cook tonight|A difficult recipe turned out exactly as Amara intended.',
 'client_dinner|Meeting a client over dinner|sora-table|work|1080|1320|1|May have a client dinner later|The client meeting ended with a breakthrough neither side expected.' ]),
('elena-markovic','shifts','alder-central-precinct',array[1,2,4,5],480,600,480,600,array['following up on witness statements','working through a case timeline','finishing a precinct briefing'],'none','alder-central-precinct',array[6],1080,1200,600,720,array['covering an overnight detective rotation','following a late case lead'],int4range(360,451,'[]'),array[
 'boxing_rounds|Finishing a heavy-bag session|meridian-fitness|fitness|900|1200|3|May box after work|A controlled sparring round helped Elena settle a decision.',
 'woodworking|Working on a small woodworking project|forgeworks-design-lab|creative|720|1140|2|May spend time in the workshop|A stubborn joint finally fit without compromise.',
 'crime_novel|Reading a crime novel over strong coffee|juniper-cafe|culture|540|1080|2|May read over coffee later|',
 'quiet_walk|Taking a quiet route home|riverwalk|outdoors|960|1200|2|May walk off the shift|',
 'early_coffee|Getting strong coffee before the precinct|juniper-cafe|cafe|330|600|3|May stop for coffee before work|',
 'late_debrief|Having a quiet late debrief|velvet-hour|social|1080|1350|1|May decompress somewhere quiet|Elena said more about a difficult case than she usually would.' ]),
('lena-park','student','juniper-college',array[1,3,5],540,660,180,300,array['attending a communications seminar','working through a campus photo assignment','studying in the college library'],'none','juniper-cafe',array[2,4,6],420,540,240,360,array['working the morning cafe shift','covering the cafe counter','closing out a short cafe shift'],null,array[
 'film_walk|Taking a roll of film around Juniper|riverwalk|creative|720|1140|3|May take her camera out later|One accidental frame captured exactly what Lena wanted.',
 'thrift_search|Looking for a thrift-store find|common-market|shopping|660|1140|2|Might go thrifting later|Lena found a jacket with a forgotten photo in the pocket.',
 'indie_show|Catching a small indie set|static-house|nightlife|1080|1380|1|May catch an indie show tonight|',
 'poetry_notes|Writing poetry notes over coffee|juniper-cafe|creative|660|1080|2|May write over coffee later|A half-finished line finally found its ending.',
 'campus_study|Studying with music in the library|juniper-college|education|720|1200|3|May study on campus later|',
 'photo_develop|Sorting negatives at home|alder-district|home|1080|1380|2|May develop film tonight|A delayed roll contained a photo Lena had forgotten taking.' ]),
('zoe-bennett','shifts','meridian-fitness',array[1,2,4,5,6],480,1020,180,360,array['teaching dance conditioning','rehearsing a new class sequence','coaching a private dance session'],'none',null,null,null,null,null,null,null,null,array[
 'night_choreography|Turning a song into choreography|lucky-note|creative|1080|1410|2|May test choreography tonight|A joke routine became a sequence Zoe wants to teach.',
 'dance_video|Filming a dance clip|skyline-rooftop|creative|900|1260|2|May film a dance clip later|The first unplanned take was the one Zoe kept.',
 'fashion_run|Building a look for an event|common-market|shopping|720|1140|1|Might find something for tonight|',
 'spontaneous_show|Showing up for an unplanned set|static-house|nightlife|1080|1410|1|May follow a last-minute show lead|The unplanned set turned into the best part of Zoe''s week.',
 'friend_brunch|Stretching brunch into an afternoon|ember-and-rye|social|600|1020|1|May meet friends for brunch|',
 'river_dance|Rehearsing by the river|riverwalk|outdoors|600|1080|2|May rehearse outside later|' ]),
('tessa-morgan','hybrid','side-street-comedy',array[1,2,3,4,5],540,660,360,480,array['editing a local culture segment','recording a comedy interview','chasing down a strange Juniper story'],'meal',null,null,null,null,null,null,null,null,array[
 'obscure_record|Chasing an obscure record recommendation|static-house|culture|960|1320|2|May chase a music lead later|Tessa found a local recording with a better story than expected.',
 'trivia_host|Sitting in on a trivia night|northside-bar|social|1080|1320|1|May drop into trivia tonight|A ridiculous wrong answer became Tessa''s favorite clip of the night.',
 'comedy_set|Catching a comedy set off the clock|side-street-comedy|entertainment|1080|1380|1|May catch a set later|The quietest comic on the bill surprised the whole room.',
 'gossip_edit|Editing a playful culture episode at home|alder-district|home|900|1260|2|May finish an episode tonight|',
 'local_interview|Meeting a local character over coffee|juniper-cafe|work|600|1080|2|May record a coffee interview|An offhand comment became the episode''s opening.',
 'late_radio_walk|Walking after a late edit|riverwalk|outdoors|1080|1320|2|May walk after the edit|' ]),
('samira-haddad','student','juniper-college',array[1,3,5],540,660,180,300,array['attending a graduate seminar','translating notes for a research paper','working in the college archives'],'none','glassline-gallery',array[2,4,6],600,720,240,360,array['cataloging exhibition research','checking provenance notes','helping prepare a gallery talk'],null,array[
 'archive_research|Following a footnote into the archives|juniper-college|education|600|1080|3|May disappear into the archives later|Samira found a source that changed the center of her argument.',
 'label_check|Checking an exhibition label|glassline-gallery|culture|660|1140|2|May stop at Glassline for research|A missing date opened a much bigger historical question.',
 'language_cafe|Practicing a language over coffee|juniper-cafe|social|660|1080|2|May meet a language partner later|',
 'fencing_practice|Working through fencing drills|meridian-fitness|fitness|960|1200|2|May practice fencing later|',
 'ancient_text|Translating an ancient passage|paper-trail|culture|600|1080|2|May translate at Paper Trail later|A difficult phrase finally resolved into an elegant meaning.',
 'museum_talk|Attending a small gallery talk|glassline-gallery|culture|1020|1260|1|May stay for a gallery talk|The speaker challenged Samira''s favorite interpretation.' ]),
('avery-ellis','shifts','meridian-fitness',array[1,2,3,4,5,6],330,600,240,420,array['coaching an early training session','programming a client workout','mentoring an athlete through the last set'],'none',null,null,null,null,null,null,null,null,array[
 'arena_scout|Watching basketball from a scouting angle|juniper-civic-arena|sports|960|1320|2|May watch the game later|A young player made the adjustment Avery had been waiting for.',
 'trail_training|Taking a conditioning session outdoors|halcyon-park|fitness|420|960|2|May train outside later|',
 'mentor_lunch|Meeting a former athlete for lunch|ember-and-rye|social|660|1020|1|May catch up with an athlete later|A former client shared news Avery had been hoping to hear.',
 'meal_prep|Cooking a week of training meals|alder-district|home|900|1200|2|May meal-prep later|',
 'pickup_game|Joining a competitive pickup game|juniper-civic-arena|fitness|720|1200|1|Might join a pickup game|',
 'recovery_walk|Taking a recovery walk by the river|riverwalk|outdoors|960|1200|2|May take an easy walk later|' ]),
('mateo-alvarez','shifts','juniper-firehouse-14',array[0,2,4,6],420,540,600,780,array['working a rotating firehouse shift','checking equipment with the crew','covering Firehouse 14'],'none',null,null,null,null,null,null,null,int4range(300,421,'[]'),array[
 'motorcycle_repair|Repairing a stubborn motorcycle part|forgeworks-design-lab|creative|720|1140|2|May work on the bike later|The replacement part did not fit, so Mateo made one that did.',
 'soccer_match|Playing a casual soccer match|halcyon-park|fitness|600|1080|1|May play soccer later|',
 'live_set|Catching a live set after shift|static-house|nightlife|1080|1410|1|May catch a band after work|The band pulled Mateo into helping with a failing stage rig.',
 'crew_cooking|Cooking for the firehouse crew|juniper-firehouse-14|food|720|1200|2|May cook for the crew later|Mateo''s improvised dinner became the new station favorite.',
 'river_ride|Taking the motorcycle along the river|riverwalk|outdoors|720|1140|2|May take the bike out later|',
 'quiet_drink|Having one quiet drink after shift|velvet-hour|social|1080|1350|1|May stop for a quiet drink|A familiar song brought out a Juniper story Mateo rarely tells.' ]),
('ethan-cole','freelance','forgeworks-design-lab',array[1,2,3,4,5],600,720,300,480,array['building an indie game prototype','debugging a stubborn gameplay system','writing a new story branch'],'none',null,null,null,null,null,null,null,null,array[
 'arcade_research|Testing an arcade mechanic in public|pixel-and-pint|creative|900|1320|3|May test something at the arcade|A player broke Ethan''s system in a way that made the game better.',
 'sci_fi_movie|Catching an obscure science-fiction movie|marquee-cinema|entertainment|1080|1320|1|May catch a science-fiction movie|',
 'electronic_set|Listening to an electronic set|static-house|nightlife|1080|1380|1|May see an electronic set later|A sound in the set solved a design problem Ethan had all week.',
 'trivia_table|Joining a trivia table reluctantly|northside-bar|social|1080|1320|1|Might join trivia tonight|Ethan answered the impossible round and immediately regretted the attention.',
 'cafe_build|Coding a prototype over coffee|juniper-cafe|creative|600|1080|3|May work from the cafe later|',
 'home_playtest|Running a late home playtest|alder-district|home|1080|1410|2|May run a playtest tonight|A tiny player reaction changed the ending Ethan planned.' ]),
('darius-king','freelance','photography-studio',array[1,2,3,4,5],480,720,240,480,array['directing a commercial portrait shoot','building a portrait lighting setup','editing a client campaign'],'none',null,null,null,null,null,null,null,null,array[
 'portrait_scout|Scouting portrait light around Juniper|alder-district|creative|480|1080|3|May scout a portrait location|Darius found a new angle that changed the campaign concept.',
 'jazz_listen|Listening closely near the piano|velvet-hour|culture|1080|1380|1|May listen to jazz tonight|The pianist played a phrase Darius wants to build a portrait around.',
 'whiskey_table|Having a measured whiskey after work|velvet-hour|social|1080|1350|1|May stop for a quiet whiskey|',
 'people_watch|Watching the room before taking a frame|juniper-cafe|creative|600|1080|2|May watch the morning crowd later|',
 'travel_edit|Editing travel photographs at home|alder-district|home|900|1320|2|May edit old travel work later|An overlooked frame became Darius''s favorite of the set.',
 'gallery_portrait|Studying portrait work at Glassline|glassline-gallery|culture|660|1200|1|May study a portrait show later|' ]),
('kenji-sato','hybrid','forgeworks-design-lab',array[1,2,3,4,5],480,600,420,540,array['reviewing an industrial prototype','testing a product mechanism','refining a manufacturing model'],'meal',null,null,null,null,null,null,null,null,array[
 'prototype_sketch|Sketching mechanisms over espresso|juniper-cafe|creative|540|960|3|May sketch over espresso later|A quick paper mechanism solved Kenji''s prototype problem.',
 'climbing_session|Working a technical climbing route|summit-climbing-hall|fitness|960|1200|2|May go climbing after work|',
 'car_detail|Studying a restoration detail|forgeworks-design-lab|creative|720|1140|2|May work on a car detail later|',
 'design_gallery|Examining an unusable design object|glassline-gallery|culture|660|1200|1|May inspect a design show later|Kenji found one beautiful object that actually worked.',
 'espresso_stop|Having a precise espresso|juniper-cafe|cafe|420|900|3|May stop for espresso|',
 'architecture_walk|Studying construction details downtown|alder-district|outdoors|720|1140|2|May take a design walk later|' ]),
('luca-moretti','shifts','static-house',array[2,3,4,5,6],900,1020,480,600,array['preparing Static House for a live set','running soundcheck and room setup','closing out a venue night'],'none',null,null,null,null,null,null,null,null,array[
 'guitar_check|Testing an old guitar before soundcheck|static-house|creative|840|1080|3|May check the room with his guitar|A forgotten riff finally sounded right in the empty room.',
 'local_history|Trading Juniper stories after closing|lantern-dive|social|1200|1430|1|May trade local stories after closing|Luca heard a Juniper story he had somehow never heard before.',
 'market_cooking|Choosing ingredients for a long lunch|common-market|food|540|900|1|May cook before the venue opens|',
 'blues_set|Sitting in for one blues song|static-house|nightlife|1080|1410|1|Might sit in for one song|The crowd convinced Luca to play a second song.',
 'small_business_coffee|Meeting another owner over coffee|juniper-cafe|social|540|900|2|May meet a local owner over coffee|A practical favor turned into a new venue partnership.',
 'late_kitchen|Cooking after the room closes|alder-district|home|1260|1470|2|May cook after closing|' ]),
('claire-holloway','fixed_weekdays','chloe-design-studio',array[1,2,3,4,5],510,570,420,540,array['building a client presentation','reviewing material samples','reworking a room layout'],'meal',null,null,null,null,null,null,null,null,array[
 'vintage_furniture|Hunting for vintage furniture|common-market|shopping|660|1140|2|May look for a vintage piece later|Claire found a damaged chair worth rebuilding.',
 'watercolor|Painting a small watercolor study|riverwalk|creative|720|1140|2|May take watercolor supplies outside|A quick color study became the center of Claire''s presentation.',
 'gallery_detail|Studying construction details at Glassline|glassline-gallery|culture|660|1200|2|May inspect Glassline later|Claire caught a hidden seam that changed her opinion of the installation.',
 'rooftop_dinner|Collecting ideas over rooftop dinner|skyline-rooftop|social|1080|1320|1|May have dinner on the rooftop|',
 'fashion_browse|Looking for one exact finishing piece|common-market|shopping|720|1140|1|May browse after work|',
 'road_trip_notes|Planning a road-trip design route|juniper-cafe|creative|600|1020|1|Might plan a design road trip|Claire found a restoration stop worth building the trip around.' ]),
('becka-shaw','student','juniper-college',array[1,3,5],540,660,180,300,array['attending an environmental science lab','working through field-data analysis','studying watershed ecology'],'none','summit-climbing-hall',array[2,4,6],900,1080,180,300,array['teaching a beginner climbing class','setting routes for an evening lesson','coaching a climbing group'],null,array[
 'river_fieldwork|Collecting field notes along the river|riverwalk|education|480|1080|3|May collect river samples later|Becka spotted an unexpected change in the waterline habitat.',
 'bouldering|Trying a new bouldering route|summit-climbing-hall|fitness|720|1200|3|May climb after class|A route Becka had failed all week finally clicked.',
 'punk_concert|Showing up for a concert with no exit plan|static-house|nightlife|1080|1410|1|May end up at a concert tonight|The unplanned encore kept Becka out much later than intended.',
 'thrift_camera|Hunting for old camera gear|common-market|shopping|600|1140|1|Might hunt for old camera gear|Becka found a working film camera in a box of broken ones.',
 'camping_prep|Sorting camping gear at home|alder-district|home|900|1260|2|May prep for a camping weekend|',
 'swim_training|Getting a swim workout in|riverwalk|fitness|480|960|2|May swim before class|' ]),
('emma-callahan','shifts','common-market',array[2,3,4,5,6],360,480,360,540,array['building event flower arrangements','conditioning flowers for a wedding','styling a market display'],'none',null,null,null,null,null,null,null,null,array[
 'garden_palette|Collecting color ideas in the glasshouses|lark-botanical-garden|creative|540|1080|2|May collect garden color ideas|Emma found a color combination she had been trying to name all week.',
 'antique_vase|Hunting for an unusual antique vase|common-market|shopping|600|1080|1|May hunt for an antique vase|An imperfect old vase became the centerpiece Emma needed.',
 'wedding_mockup|Building a wedding-table mockup|forgeworks-design-lab|creative|720|1140|2|May build an event mockup later|The restrained version felt more romantic than the elaborate one.',
 'acoustic_set|Listening to an acoustic set|static-house|culture|1080|1380|1|May hear an acoustic set tonight|A song gave Emma the exact mood for an upcoming event.',
 'baking_evening|Baking something simple at home|alder-district|home|960|1260|2|May bake tonight|',
 'market_coffee|Taking coffee after the market rush|moss-and-crumb|cafe|600|960|2|May take coffee after the market|A vendor offered Emma first choice of next week''s flowers.' ]),
('brooke-sullivan','student','juniper-college',array[1,3,5],540,660,180,300,array['attending a communications class','editing a campus media project','working on a campaign assignment'],'none','riverwalk',array[2,4,6],480,600,300,480,array['coordinating river recreation updates','covering a seasonal lifeguard shift','setting up a paddleboard program'],null,array[
 'paddleboard|Taking a paddleboard onto the river|riverwalk|outdoors|480|1080|3|May get on the river later|A friendly race became much more competitive than Brooke planned.',
 'arena_friends|Meeting friends for a game|juniper-civic-arena|social|960|1320|2|May meet friends at the arena|Brooke ended up knowing someone in three different sections.',
 'outdoor_party|Joining an outdoor gathering|halcyon-park|social|960|1320|1|May end up at an outdoor party|',
 'fitness_run|Training along the Riverwalk|riverwalk|fitness|420|960|3|May train by the river|',
 'concert_plan|Making a last-minute concert plan|static-house|nightlife|1080|1380|1|Might make a last-minute concert plan|The plan changed twice and somehow landed on the right show.',
 'river_photos|Taking bright river-day photographs|riverwalk|creative|600|1080|2|May take photos by the river|Brooke captured the exact second a summer storm rolled in.' ]);

-- Retire only the obsolete roster-wide timetable. Other authored schedule
-- templates and content packs remain untouched.
delete from public.together_schedule_templates schedule
using public.together_character_versions version,public.together_character_templates template
where schedule.character_version_id=version.id and version.character_template_id=template.id
  and template.slug in(select slug from kivelle_juniper_life_v2)
  and schedule.metadata->>'source'='juniper_character_roster';

-- Replace the two placeholder activity rows from roster V1. Existing unrelated
-- activities are preserved; V2 is additive for the character versions.
delete from public.together_character_activity_templates activity
using public.together_character_versions version,public.together_character_templates template
where activity.character_version_id=version.id and version.character_template_id=template.id
  and template.slug in(select slug from kivelle_juniper_life_v2)
  and activity.metadata->>'source'='juniper_character_roster';

-- Upgrade each published roster version without changing character identity.
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
            'key','primary','title',template.occupation,'activityKey','occupation_primary','workDays',to_jsonb(profile.work_days),
            'startRange',jsonb_build_object('startMinute',profile.start_min,'endMinute',profile.start_max),
            'durationMinutes',jsonb_build_array(profile.duration_min,profile.duration_max),'primaryLocationSlug',profile.work_slug,
            'activityVariants',to_jsonb(profile.work_variants),'breakPolicy',profile.break_policy,'visibility','known','interruptibility','busy',
            'metadata',jsonb_build_object('upcomingHint','Might be '||profile.work_variants[1]||' later','scheduleProfile','juniper_life_v2')
          )
        ) || case when profile.second_slug is null then '[]'::jsonb else jsonb_build_array(
          jsonb_build_object(
            'key','secondary','title',template.occupation,'activityKey','occupation_secondary','workDays',to_jsonb(profile.second_days),
            'startRange',jsonb_build_object('startMinute',profile.second_start_min,'endMinute',profile.second_start_max),
            'durationMinutes',jsonb_build_array(profile.second_duration_min,profile.second_duration_max),'primaryLocationSlug',profile.second_slug,
            'activityVariants',to_jsonb(profile.second_variants),'breakPolicy','none','visibility','known','interruptibility','busy',
            'recoverySleepMinutes',case when profile.second_recovery is null then null else jsonb_build_array(lower(profile.second_recovery),upper(profile.second_recovery)-1) end,
            'metadata',jsonb_build_object('upcomingHint','Might be '||profile.second_variants[1]||' later','scheduleProfile','juniper_life_v2')
          )
        ) end
      ),true
    ),
    '{scheduling}',
    coalesce(version.life_config->'scheduling','{}'::jsonb)||jsonb_build_object('repetitionTolerance',.3,'preferredDailyActivityCount',jsonb_build_array(2,3),'generationVersion','life_engine_v2'),true
  ),updated_at=now()
from public.together_character_templates template,kivelle_juniper_life_v2 profile
where version.character_template_id=template.id and template.slug=profile.slug
  and version.version=template.current_published_version;

-- Sleep windows follow actual work rhythm: bakers and market staff turn in
-- early, Luca sleeps after venue close, and rotating overnight workers rely on
-- their authored post-shift recovery block.
with sleep_profile(slug,bed_start,bed_end,wake_start,wake_end,weekend_shift) as(values
  ('sophie-laurent',1200,1320,210,285,30),
  ('emma-callahan',1230,1350,240,330,30),
  ('avery-ellis',1260,1380,270,390,30),
  ('luca-moretti',90,180,540,660,30),
  ('camila-reyes',90,180,540,660,30),
  ('priya-kapoor',1380,90,420,540,45),
  ('elena-markovic',1320,30,360,480,30),
  ('mateo-alvarez',1380,90,420,540,45)
)
update public.together_character_versions version set life_config=jsonb_set(version.life_config,'{sleep}',
  jsonb_build_object('preferredBedtime',jsonb_build_object('startMinute',sleep.bed_start,'endMinute',sleep.bed_end),
    'preferredWakeTime',jsonb_build_object('startMinute',sleep.wake_start,'endMinute',sleep.wake_end),
    'variabilityMinutes',25,'weekendShiftMinutes',sleep.weekend_shift),true),updated_at=now()
from public.together_character_templates template,sleep_profile sleep
where version.character_template_id=template.id and template.slug=sleep.slug
  and version.version=template.current_published_version;

-- World-specific homes remain private/base locations, not generic district
-- fallbacks. A stable hash spreads residents across authored residential bases.
update public.together_character_world_presence presence set home_location_id=home.id,metadata=presence.metadata||jsonb_build_object('scheduleProfile','juniper_life_v2'),updated_at=now()
from public.together_character_versions version,public.together_character_templates template,kivelle_juniper_life_v2 profile,
  public.together_locations home
where presence.character_version_id=version.id and version.character_template_id=template.id and template.slug=profile.slug
  and home.world_id='10000000-0000-4000-8000-000000000001'
  and home.slug=(array['alder-lofts','riverline-apartments','eastgate-flats'])[1+mod(abs(hashtext(profile.slug)::bigint),3)::int];

update public.together_character_versions version set life_config=jsonb_set(version.life_config,'{homeLocationId}',to_jsonb(home.id::text),true),updated_at=now()
from public.together_character_templates template,kivelle_juniper_life_v2 profile,public.together_locations home
where version.character_template_id=template.id and template.slug=profile.slug and version.version=template.current_published_version
  and home.world_id='10000000-0000-4000-8000-000000000001'
  and home.slug=(array['alder-lofts','riverline-apartments','eastgate-flats'])[1+mod(abs(hashtext(profile.slug)::bigint),3)::int];

-- Four grounded routines plus six authored activities yield ten options per
-- resident. Shared keys are reusable data, never character-specific code.
with generic_activity(key,label,slug,category,start_min,end_min,max_week,hint) as(values
  ('home_cooking','Cooking something at home','','home',960,1260,3,'May cook at home later'),
  ('quiet_home','Having a quiet evening at home','','home',1080,1380,4,'May keep tonight quiet'),
  ('city_errand','Picking up a few practical things','common-market','errand',540,1140,2,'May stop by Common Market later'),
  ('city_walk','Taking a walk through Juniper','riverwalk','outdoors',480,1200,3,'May take a walk later')
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,generic.key,generic.label,generic.category,
  jsonb_build_array(jsonb_build_object('startMinute',generic.start_min,'endMinute',generic.end_min)),int4range(45,121,'[]'),
  array[generic.category],case when generic.slug='' then array[]::text[] else array[generic.slug] end,array[generic.category],.62,int4range(1,3,'[]'),generic.max_week,18,
  null,'either',case when generic.category in('home','errand') then 'recurring_routine' else 'preferred_activity' end,
  'hidden','open',jsonb_build_object('source','juniper_life_v2','activityLabel',generic.label,'upcomingHint',generic.hint,'outcomeEligible',false)
from kivelle_juniper_life_v2 profile
join public.together_character_templates template on template.slug=profile.slug
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
cross join generic_activity generic
on conflict(character_version_id,activity_key) do update set title=excluded.title,category=excluded.category,
  valid_time_windows=excluded.valid_time_windows,duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,maximum_weekly_frequency=excluded.maximum_weekly_frequency,
  minimum_gap_hours=excluded.minimum_gap_hours,priority=excluded.priority,visibility=excluded.visibility,
  interruptibility=excluded.interruptibility,metadata=excluded.metadata,updated_at=now();

with expanded as(
  select profile.slug,string_to_array(activity,'|') parts
  from kivelle_juniper_life_v2 profile cross join lateral unnest(profile.activities) activity
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,
  location_categories,location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,
  minimum_gap_hours,energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version.id,parts[1],parts[2],parts[4],jsonb_build_array(jsonb_build_object('startMinute',(parts[5])::int,'endMinute',(parts[6])::int)),
  int4range(case when parts[4] in('cafe','errand') then 40 else 60 end,case when parts[4] in('nightlife','social','sports') then 181 else 121 end,'[]'),
  array[]::text[],array[parts[3]],array[parts[4],parts[1]],.84,int4range(0,case when (parts[7])::int=1 then 2 else 3 end,'[]'),
  (parts[7])::int,case when (parts[7])::int=1 then 72 else 24 end,null,'either',
  case when parts[4] in('social','nightlife') then 'social_event' when parts[4] in('work','education') then 'recurring_routine' else 'preferred_activity' end,
  case when (parts[7])::int=1 then 'hint' else 'hidden' end,case when parts[4] in('work','education') then 'limited' else 'open' end,
  jsonb_build_object('source','juniper_life_v2','activityLabel',parts[2],'upcomingHint',parts[8],
    'rare',(parts[7])::int=1,'outcomeEligible',length(parts[9])>0,
    'outcomeProbability',case when length(parts[9])>0 then case when (parts[7])::int=1 then .22 else .11 end else 0 end,
    'outcomeSignificance',case when length(parts[9])>0 then .58 else .4 end,
    'outcomeVariants',case when length(parts[9])>0 then jsonb_build_array(parts[9]) else '[]'::jsonb end)
from expanded
join public.together_character_templates template on template.slug=expanded.slug
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
on conflict(character_version_id,activity_key) do update set title=excluded.title,category=excluded.category,
  valid_time_windows=excluded.valid_time_windows,duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,
  tags=excluded.tags,affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

-- Delete stale future V1 materialization only for this official roster. This
-- cannot touch plans, overrides, active rows, or historical evidence.
delete from public.together_character_schedule_events event
using public.together_character_instances instance,public.together_character_templates template
where event.character_instance_id=instance.id and instance.character_template_id=template.id
  and template.slug in(select slug from kivelle_juniper_life_v2)
  and event.generation_version='life_engine_v1' and event.source in('generated','recurring')
  and event.starts_at>now();

update public.together_character_instances instance set life_engine_version='life_engine_v2',updated_at=now()
from public.together_character_templates template
where instance.character_template_id=template.id and template.slug in(select slug from kivelle_juniper_life_v2);

comment on table public.together_character_activity_templates is
  'Data-driven activity bank for Life Engine scheduling. Juniper V2 presentation and rare outcome policy live in metadata.';

commit;
