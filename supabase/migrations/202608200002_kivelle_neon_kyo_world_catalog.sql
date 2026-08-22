begin;

-- Keep immutable authored history, but remove retired worlds from every active
-- catalog, entitlement, simulation, and content path.
create temporary table retired_kivelle_worlds(
  world_id uuid primary key,
  slug text not null unique
) on commit drop;

insert into retired_kivelle_worlds values
  ('10000000-0000-4000-8000-000000000002','vesper-city'),
  ('10000000-0000-4000-8000-000000000003','solara-coast'),
  ('10000000-0000-4000-8000-000000000004','kairo'),
  ('10000000-0000-4000-8000-000000000005','alder-ridge'),
  ('10000000-0000-4000-8000-000000000006','aurelia'),
  ('10000000-0000-4000-8000-000000000007','isla-maren');

update public.together_worlds world set
  published=false,
  featured=false,
  default_arrival_location_id=null,
  metadata=world.metadata||jsonb_build_object(
    'retired',true,
    'retiredAt','2026-08-20',
    'retiredReason','catalog_consolidation'
  ),
  updated_at=now()
from retired_kivelle_worlds retired
where world.id=retired.world_id;

update public.together_event_templates content set active=false,updated_at=now()
from retired_kivelle_worlds retired where content.world_id=retired.world_id;
update public.together_story_arc_templates content set active=false,updated_at=now()
from retired_kivelle_worlds retired where content.specific_world_id=retired.world_id;
update public.together_date_templates content set active=false,updated_at=now()
from retired_kivelle_worlds retired where content.world_id=retired.world_id;
update public.together_trip_templates content set active=false,updated_at=now()
from retired_kivelle_worlds retired where content.world_id=retired.world_id;

update public.together_location_reference_assets asset set active=false
from retired_kivelle_worlds retired where asset.world_id=retired.world_id;
update public.together_world_reference_assets asset set active=false
from retired_kivelle_worlds retired where asset.world_id=retired.world_id;
update public.together_media_reference_assets asset set active=false,updated_at=now()
from retired_kivelle_worlds retired where asset.world_id=retired.world_id;

update public.together_shared_plans plan set
  status='cancelled',
  cancelled_at=coalesce(plan.cancelled_at,now()),
  metadata=plan.metadata||'{"worldRetired":true}'::jsonb,
  updated_at=now()
from retired_kivelle_worlds retired
where plan.world_id=retired.world_id and plan.status in('proposed','scheduled','active');

update public.together_trips trip set
  status='cancelled',
  metadata=trip.metadata||'{"worldRetired":true}'::jsonb,
  updated_at=now()
from retired_kivelle_worlds retired
where trip.world_id=retired.world_id and trip.status in('planning','upcoming','traveling','visiting','returning');

update public.together_date_sessions session set
  status='deferred',
  state=session.state||'{"worldRetired":true}'::jsonb,
  updated_at=now()
from public.together_date_templates template,retired_kivelle_worlds retired
where session.date_template_id=template.id
  and template.world_id=retired.world_id
  and session.status in('locked','unlocked','upcoming','active');

update public.together_story_arc_instances instance set status='cancelled',updated_at=now()
from public.together_story_arc_templates template,retired_kivelle_worlds retired
where instance.template_slug=template.slug
  and template.specific_world_id=retired.world_id
  and instance.status in('active','paused');

update public.together_scene_sessions scene set
  ended_at=greatest(scene.started_at,now()),
  state=scene.state||'{"worldRetired":true}'::jsonb,
  updated_at=now()
from retired_kivelle_worlds retired
where scene.world_id=retired.world_id and scene.ended_at is null;

update public.together_life_events event set
  ends_at=greatest(event.starts_at,now()),
  metadata=event.metadata||'{"worldRetired":true}'::jsonb
from public.together_locations location,retired_kivelle_worlds retired
where event.location_id=location.id
  and location.world_id=retired.world_id
  and (event.ends_at is null or event.ends_at>now());

update public.together_character_instances instance set
  current_location_id='11000000-0000-4000-8000-000000000001',
  current_activity='settling back into Juniper City',
  last_simulated_at=now(),
  metadata=instance.metadata||'{"relocatedFromRetiredWorld":true}'::jsonb,
  updated_at=now()
from public.together_locations location,retired_kivelle_worlds retired
where instance.current_location_id=location.id and location.world_id=retired.world_id;

delete from public.together_character_world_presence presence
using retired_kivelle_worlds retired where presence.world_id=retired.world_id;
delete from public.together_user_worlds access
using retired_kivelle_worlds retired where access.world_id=retired.world_id;

insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,
  access_type,entitlement_key,timezone,sort_order,featured,visual_context,
  world_role,social_rhythm,dominant_dayparts,relationship_themes,
  activity_families,mobility_style,weather_profile
) values (
  '10000000-0000-4000-8000-000000000009',
  'NEON KYO',
  'neon-kyo',
  'One of the richest and loneliest cities on Earth: hyperconnected, heavily watched, and always selling a more perfect version of desire.',
  'neon-kyo-hero',
  '{"accent":["electric cyan","deep indigo","restrained magenta","warm amber"]}'::jsonb,
  '{"releaseWave":8,"early_access":false,"photoStatus":"hero_ready","tagline":"Everybody is connected. Everybody is watched. Everybody has something they hide.","civicRating":true,"relationshipFantasy":"Find something genuine in a city that can manufacture almost everything else.","nativeDateSeeds":["Rain at Kissaten 88","Above the City at Halo","No Filters in Koi Garden","A Night Completely Offline"],"storySeeds":["The Rating Changed","Someone Is Watching","What the Implant Recorded","Disappear Into the Shade"],"populationArchetypes":["corporate professional","club worker","hacker","augmented artist","medical specialist","tower resident"]}'::jsonb,
  true,
  'subscription',
  'worlds.standard',
  'Asia/Tokyo',
  80,
  true,
  '{"setting":"seductive near-future East Asian megacity where corporate luxury, dense residential life, experimental technology, and historic blind zones overlap","geography":["vertical corporate core","stacked residential towers","subterranean transit and markets","historic canal district"],"architecture":["glass megatowers","layered mixed-use blocks","transparent skybridges","compact old timber buildings"],"climate":"humid temperate city with frequent rain","visualStyle":["grounded speculative realism","wet neon reflections","warm private interiors against cool public surveillance"],"palette":["electric cyan","deep indigo","restrained magenta","warning red","warm amber"],"recurringElements":["biometric cameras","reactive advertisements","elevated walkways","rain-slicked streets","old lanterns at the city edge"],"signageStyle":["dense responsive displays","minimal luxury wayfinding","handmade signs inside surveillance blind zones"],"avoid":["recognizable real-world landmarks","Blade Runner imitation","Times Square imitation","empty streets","flying-car spectacle"]}'::jsonb,
  'home',
  'always_on',
  array['evening','late_night','morning']::text[],
  array['surveillance','authenticity','privacy','manufactured desire','class divide','chosen vulnerability']::text[],
  array['nightlife','fashion','technology','gaming','luxury dining','body modification','residential life','historic retreats']::text[],
  'transit',
  '{"climate":"humid temperate megacity","states":["rain","overcast","humid","clear","storm"],"outdoorBias":0.46}'::jsonb
)
on conflict(id) do update set
  name=excluded.name,slug=excluded.slug,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,
  published=excluded.published,access_type=excluded.access_type,
  entitlement_key=excluded.entitlement_key,timezone=excluded.timezone,
  sort_order=excluded.sort_order,featured=excluded.featured,
  visual_context=excluded.visual_context,world_role=excluded.world_role,
  social_rhythm=excluded.social_rhythm,dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,weather_profile=excluded.weather_profile,updated_at=now();

create temporary table neon_kyo_location_seed(
  location_index integer primary key,
  parent_index integer,
  district_name text not null,
  name text not null,
  slug text not null,
  description text not null,
  category text not null,
  location_type text not null,
  activities text[] not null,
  hours jsonb
) on commit drop;

insert into neon_kyo_location_seed values
  (1,null,'Hikari Core','Hikari Core','hikari-core','NEON KYO''s brilliant public face: aspirational, crowded, and continuously analyzed by biometric and private security systems.','district','district',array['shopping','fashion','cafes','gaming','people watching','nightlife']::text[],null),
  (2,null,'Shinjira','Shinjira','shinjira','The vertical nightlife district respectable residents deny visiting, where hidden floors and unlisted doors make almost everything feel permitted.','district','district',array['nightlife','cocktails','dancing','private clubs','late food']::text[],null),
  (3,null,'Aoyama-9','Aoyama-9','aoyama-nine','An immaculate high-altitude enclave for the people who own NEON KYO, where beauty, privacy, and convenience are purchasable services.','district','district',array['luxury dining','fashion','art','wellness','rooftop drinks']::text[],null),
  (4,null,'Akiba Undergrid','Akiba Undergrid','akiba-undergrid','The experimental district beneath the tourist streets, where engineers, hackers, gamers, and artists modify technology without asking permission.','district','district',array['technology','gaming','nightlife','body modification','digital art']::text[],null),
  (5,null,'Tsuki Blocks','Tsuki Blocks','tsuki-blocks','Dense residential towers where young adults share amenities, endure constant advertising, and make scarce private space meaningful.','district','district',array['residential life','late errands','fitness','rooftops','neighborhood drinks']::text[],null),
  (6,null,'Old Kyo / The Shade','Old Kyo / The Shade','old-kyo-the-shade','Historic streets and canals where surveillance fails unpredictably, drawing lovers, dissidents, celebrities, and anyone who needs to disappear.','district','district',array['shrines','gardens','quiet dining','canal walks','underground music']::text[],null),

  (7,1,'Hikari Core','Hikari Crossing','hikari-crossing','The city''s legendary pedestrian crossing, where enormous reactive advertisements watch tens of thousands of people disappear into the crowd.','landmark','landmark',array['people watching','meet up','street photography','disappear into the crowd']::text[],null),
  (8,1,'Hikari Core','Maison Vice','maison-vice','A six-story fashion complex for provocative cybercouture, designer lingerie, augmented fabrics, and luxury body accessories.','shopping','venue',array['fashion','shopping','virtual fitting','styling']::text[],'{"open":"10:00","close":"23:00"}'::jsonb),
  (9,1,'Hikari Core','Kissaten 88','kissaten-88','A tiny low-lit cafe beneath a cosmetics hologram, with leather booths and rainy windows that become notably private after midnight.','cafe','venue',array['coffee','late-night conversation','casual date','people watching']::text[],'{"open":"07:00","close":"03:00"}'::jsonb),
  (10,1,'Hikari Core','Hikari Capsule Club','hikari-capsule-club','A futuristic capsule hotel with soundproof rooms, environmental controls, and anonymous payments, popular with locals who need privacy.','hotel','residence',array['stay','rest','private conversation']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (11,1,'Hikari Core','Mirror','mirror-hikari','An exclusive fashion lounge where guests can alter their projected hair, clothing, and faces throughout the evening.','lounge','venue',array['cocktails','fashion','dancing','augmented reality']::text[],'{"open":"18:00","close":"03:00"}'::jsonb),
  (12,1,'Hikari Core','Pulse Arcade','pulse-arcade','A huge gaming tower of competitive neural-response games whose upper floors become darker and less legal after midnight.','entertainment','venue',array['arcade games','neural games','competition','betting']::text[],'{"open":"10:00","close":"04:00"}'::jsonb),
  (13,1,'Hikari Core','Hikari Skybridge','hikari-skybridge','A transparent walkway sixty floors above Hikari, where drifting advertisements below the glass make public space feel strangely private.','landmark','landmark',array['skyline view','walk','date','late-night conversation']::text[],null),

  (14,2,'Shinjira','Velvet Static','velvet-static','Shinjira''s defining nightclub: dark concrete, red light, bass, perfume, and neural audio that responds to the crowd''s emotional state.','nightlife','venue',array['dancing','music','drinks','nightlife']::text[],'{"open":"21:00","close":"05:00"}'::jsonb),
  (15,2,'Shinjira','Room 13','room-thirteen','A private cocktail lounge behind an unmarked steel door where recording is disabled and bartenders never ask for surnames.','lounge','venue',array['cocktails','private conversation','people watching']::text[],'{"open":"19:00","close":"04:00"}'::jsonb),
  (16,2,'Shinjira','Hotel Nocturne','hotel-nocturne','A luxury privacy hotel with automated check-in, anonymous elevators, soundproof rooms, and a fashionable penthouse bar.','hotel','residence',array['stay','penthouse drinks','private dinner','skyline view']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (17,2,'Shinjira','Scarlet Garden','scarlet-garden','A seductive rooftop bar of faintly glowing crimson foliage and semi-private alcoves overlooking the city''s lower levels.','bar','venue',array['cocktails','rooftop date','conversation','skyline view']::text[],'{"open":"17:00","close":"03:00"}'::jsonb),
  (18,2,'Shinjira','Ghost Line','ghost-line','An abandoned subway platform turned illegal market for black-market implants, synthetic stimulants, forged Civic IDs, fashion mods, and cheap alcohol.','market','venue',array['underground market','implant shopping','street food','people watching']::text[],'{"open":"20:00","close":"05:00"}'::jsonb),
  (19,2,'Shinjira','Red Lantern Alley','red-lantern-alley','A rain-bright entertainment street of tiny bars, private lounges, noodle counters, and hidden entrances beneath suspended red holographic lanterns.','nightlife','landmark',array['bar hopping','late food','walking','nightlife']::text[],null),
  (20,2,'Shinjira','Eden','eden-shinjira','A members-only immersive club combining augmented reality, fragrance, temperature, and neural audio into custom environments.','entertainment','venue',array['immersive experience','dancing','cocktails','fantasy date']::text[],'{"open":"20:00","close":"05:00"}'::jsonb),

  (21,3,'Aoyama-9','The Glass House','glass-house','A prestigious residential tower with private elevators, immense windows, total visitor records, and expensive ways to erase them.','residence','residence',array['visit','private dinner','skyline view','stay']::text[],null),
  (22,3,'Aoyama-9','Halo','halo-aoyama','An exclusive rooftop lounge centered on an infinity pool suspended above the city, eveningwear, cocktails, and reflected skyline light.','lounge','venue',array['cocktails','pool','rooftop date','skyline view']::text[],'{"open":"16:00","close":"02:00"}'::jsonb),
  (23,3,'Aoyama-9','Maison IX','maison-nine','A fine-dining restaurant of private glass alcoves whose kitchen already knows each guest''s preferences from public biometric profiles.','restaurant','venue',array['fine dining','wine','date night','skyline view']::text[],'{"open":"17:00","close":"00:00"}'::jsonb),
  (24,3,'Aoyama-9','Aoyama Modification Institute','aoyama-modification-institute','An elite clinic for skin reconstruction, body sculpting, sensory implants, longevity treatments, and neural upgrades.','healthcare','venue',array['consultation','augmentation','recovery','wellness']::text[],'{"open":"08:00","close":"20:00"}'::jsonb),
  (25,3,'Aoyama-9','Gallery Null','gallery-null','A private gallery of neural art and synthetic performers where the distinction between exhibition and manipulation is deliberately unclear.','gallery','venue',array['art','exhibition','neural art','conversation']::text[],'{"open":"11:00","close":"23:00"}'::jsonb),
  (26,3,'Aoyama-9','Saint','saint-aoyama','A severe, luxurious members club for celebrities, executives, and old-money families, with staff who see more than guests realize.','lounge','venue',array['cocktails','networking','private dinner','people watching']::text[],'{"open":"18:00","close":"03:00"}'::jsonb),
  (27,3,'Aoyama-9','The Atrium','the-atrium','A private shopping arcade of designer fashion, jewelry, body-modification boutiques, and champagne bars where prices are rarely displayed.','shopping','venue',array['luxury shopping','fashion','champagne','body modification']::text[],'{"open":"10:00","close":"22:00"}'::jsonb),

  (28,4,'Akiba Undergrid','ZeroDay','zeroday','A basement hacker bar without cameras, facial recognition, or corporate networks, frequented by researchers, whistleblowers, and erased people.','bar','venue',array['drinks','hacking','private conversation','networking']::text[],'{"open":"18:00","close":"04:00"}'::jsonb),
  (29,4,'Akiba Undergrid','SYN','syn-club','An experimental nightclub where consenting guests synchronize music, light, and physical sensation through neural interfaces.','nightlife','venue',array['dancing','neural sync','music','nightlife']::text[],'{"open":"21:00","close":"05:00"}'::jsonb),
  (30,4,'Akiba Undergrid','Dollhouse Robotics','dollhouse-robotics','A boutique robotics company building extraordinarily lifelike synthetic companions, publicly sold as assistants despite an uneasy two-year waitlist.','technology','venue',array['robotics','tour','research','work']::text[],'{"open":"09:00","close":"19:00"}'::jsonb),
  (31,4,'Akiba Undergrid','Dreamscape','dreamscape','A neural VR lounge for shared simulations that can feel nearly physical, used for fantasy dates and escapes from difficult reality.','entertainment','venue',array['virtual reality','shared simulation','fantasy date','games']::text[],'{"open":"12:00","close":"04:00"}'::jsonb),
  (32,4,'Akiba Undergrid','Chrome Kiss','chrome-kiss','A body-modification studio known for subdermal illumination, metallic tattoos, sensory piercings, and cosmetic implants.','studio','venue',array['body modification','tattoo','consultation','fashion']::text[],'{"open":"12:00","close":"23:00"}'::jsonb),
  (33,4,'Akiba Undergrid','The Backroom','the-backroom','An illegal repair shop beneath an electronics market that fixes implants corporate clinics refuse to touch.','workshop','venue',array['implant repair','electronics','private consultation']::text[],'{"open":"14:00","close":"02:00"}'::jsonb),
  (34,4,'Akiba Undergrid','Nova Arena','nova-arena','A massive esports stadium where professional gamers are celebrities and every major match spills into an uncontrolled district party.','arena','venue',array['esports','competition','spectating','party']::text[],'{"open":"10:00","close":"01:00"}'::jsonb),

  (35,5,'Tsuki Blocks','Tsuki Tower 17','tsuki-tower-17','The player''s residential building: tiny apartments, thin walls, shared balconies, and late elevators where neighbors appear without public polish.','residence','residence',array['home','visit neighbors','shared balcony','late-night conversation']::text[],null),
  (36,5,'Tsuki Blocks','TwentyFour','twentyfour','The fluorescent neighborhood convenience store where residents cross paths at 3 AM in office clothes, club outfits, and whatever they threw on.','shopping','venue',array['late shopping','instant meal','cheap drinks','chance encounter']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (37,5,'Tsuki Blocks','Laundry 9','laundry-nine','A nearly automated laundromat with a vending cafe whose after-midnight quiet makes ordinary waiting unexpectedly intimate.','laundry','venue',array['laundry','coffee','late-night conversation','waiting']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (38,5,'Tsuki Blocks','Moonpool','moonpool','A rooftop swimming pool shared by several towers, surrounded by the city and frequently almost empty after 1 AM.','fitness','outdoor',array['swimming','rooftop view','relaxation','late-night date']::text[],'{"open":"05:00","close":"03:00"}'::jsonb),
  (39,5,'Tsuki Blocks','The Balcony','the-balcony','An informal rooftop where residents bring drinks, smoke, flirt, and complain about work without anyone officially organizing it.','outdoor','outdoor',array['rooftop drinks','conversation','flirting','city view']::text[],null),
  (40,5,'Tsuki Blocks','Kumo Gym','kumo-gym','A premium twenty-four-hour residential fitness club with biometric smart mirrors and a notably social late-night crowd.','fitness','venue',array['workout','class','recovery','socializing']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (41,5,'Tsuki Blocks','Quiet Hours','quiet-hours','A warm basement bar without advertising or corporate payment systems, where regulars keep monthly tabs and the bartender keeps their secrets.','bar','venue',array['drinks','conversation','neighborhood gossip','late food']::text[],'{"open":"18:00","close":"03:00"}'::jsonb),

  (42,6,'Old Kyo / The Shade','Tsukimi Shrine','tsukimi-shrine','A cedar-shaded shrine where neural signals weaken near the stone-lantern courtyard and people come specifically to become unreachable.','shrine','landmark',array['quiet visit','reflection','walk','disconnect']::text[],null),
  (43,6,'Old Kyo / The Shade','Whisper Bridge','whisper-bridge','A narrow wooden canal bridge where lantern reflections sit beneath distant towers and local folklore demands honest questions.','landmark','landmark',array['canal walk','conversation','date','night view']::text[],null),
  (44,6,'Old Kyo / The Shade','Ryokan Kaze','ryokan-kaze','A traditional inn of tatami rooms, private baths, paper screens, and mandatory disconnection from neural devices and advertising.','hotel','residence',array['stay','private bath','dinner','disconnect']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (45,6,'Old Kyo / The Shade','Velvet Shrine','velvet-shrine','A hidden invitation-only lounge inside a historic townhouse, candlelit and warm behind a shoes-off entrance.','lounge','venue',array['drinks','private conversation','date','live music']::text[],'{"open":"19:00","close":"02:00"}'::jsonb),
  (46,6,'Old Kyo / The Shade','Koi Garden','koi-garden','An old garden where augmented reality is jammed, leaving every visitor without filters, projected clothing, or synthetic makeup overlays.','garden','outdoor',array['garden walk','quiet conversation','date','disconnect']::text[],null),
  (47,6,'Old Kyo / The Shade','Soba Miyako','soba-miyako','A fifteen-seat family restaurant without biometric ordering, valued by famous and ordinary guests because nobody photographs anyone inside.','restaurant','venue',array['soba','dinner','conversation','quiet meal']::text[],'{"open":"11:00","close":"22:00"}'::jsonb),
  (48,6,'Old Kyo / The Shade','Below Kyo','below-kyo','An unmapped network of abandoned pedestrian tunnels occupied by street artists, musicians, underground clubs, and unauthorized markets.','underground','venue',array['street art','live music','underground club','market','exploration']::text[],null);

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  ('28000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000009'::uuid,
  case when parent_index is null then null else ('28000000-0000-4000-8000-'||lpad(parent_index::text,12,'0'))::uuid end,
  name,slug,description,category,null,hours,activities,
  jsonb_build_object('tags',to_jsonb(activities),'district',case when parent_index is null then to_jsonb(true) else to_jsonb(district_name) end,'photoStatus','pending'),
  location_type,location_index*10,case when parent_index is null then 0 else 1 end,
  jsonb_build_object(
    'canonicalPrompt',name||', '||district_name||', NEON KYO. '||description,
    'indoorOutdoor',case when location_type in('outdoor','landmark','transit','district') then 'outdoor' else 'mixed' end,
    'visualAnchors',jsonb_build_array(name,district_name,'NEON KYO'),
    'avoid','["recognizable real-world landmarks","generic cyberpunk slum","flying cars","empty streets","illegible text walls","cartoon futurism"]'::jsonb
  ),
  jsonb_build_object('summary',description,'stableFacts',jsonb_build_array(name||' is in '||district_name||'.'))
from neon_kyo_location_seed
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

update public.together_worlds set
  default_arrival_location_id='28000000-0000-4000-8000-000000000007',
  updated_at=now()
where id='10000000-0000-4000-8000-000000000009';

insert into public.together_character_world_presence(
  character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata
)
select version.id,'10000000-0000-4000-8000-000000000009','visitor',null,0,0,
  '{"travelReady":true,"worldSlug":"neon-kyo","affinity":"curious"}'::jsonb
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
where template.published=true
on conflict(character_version_id,world_id) do update set metadata=excluded.metadata,updated_at=now();

-- Re-run the entitlement sync trigger so existing paid users receive NEON KYO.
update public.together_entitlements
set tier=tier
where tier in('kivelle_plus','kivelle_max');

do $$
begin
  if (select count(*) from public.together_worlds where published)<>3 then
    raise exception 'Expected exactly three published Kivelle worlds';
  end if;
  if exists(
    select 1 from public.together_worlds
    where published and slug not in('juniper-city','port-vervelle','neon-kyo')
  ) then
    raise exception 'Unexpected published world remains in the Kivelle catalog';
  end if;
  if (select count(*) from public.together_locations where world_id='10000000-0000-4000-8000-000000000009')<>48 then
    raise exception 'NEON KYO must contain six districts and forty-two public places';
  end if;
end $$;

commit;
