begin;

insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,
  access_type,entitlement_key,timezone,sort_order,featured,visual_context,
  world_role,social_rhythm,dominant_dayparts,relationship_themes,
  activity_families,mobility_style,weather_profile
) values (
  '10000000-0000-4000-8000-000000000008',
  'Port Vervelle',
  'port-vervelle',
  'A slow, sun-warmed coastal town of working docks, steep lanes, old plazas, beaches, and familiar faces.',
  'port-vervelle-hero',
  '{"accent":["warm limestone","sea blue","terracotta"]}'::jsonb,
  '{"releaseWave":7,"early_access":true,"photoStatus":"partial","relationshipFantasy":"Let repeated, unhurried encounters turn a small harbor town into somewhere that feels shared.","nativeDateSeeds":["Coffee by the Harbor","Sunset at Belvedere Garden","Dinner at Luna Terrace","Sail Past the Headland"],"storySeeds":["One More Afternoon","The Harbor Festival","A Table Everyone Knows","Wind off the Capo"],"populationArchetypes":["harbor worker","chef","artist","clinician","hotelier","musician"]}'::jsonb,
  true,
  'subscription',
  'worlds.standard',
  'Europe/Rome',
  70,
  true,
  '{"setting":"compact fictional Mediterranean coastal town built vertically around a working harbor","geography":["blue-green harbor","steep coastal hillside","rocky coves","hazy mountain backdrop"],"architecture":["warm pale stone","sun-faded pastel stucco","terracotta roofs","wrought-iron balconies"],"climate":"warm Mediterranean coast","visualStyle":["grounded romantic realism","golden late-afternoon light","comfortably lived-in streets"],"palette":["warm limestone","terracotta","sea blue","sun-faded peach","bougainvillea pink"],"recurringElements":["small fishing boats","fabric awnings","stone stairs","shuttered windows","climbing flowers"],"avoid":["recognizable real-world landmarks","mega-marinas","cruise ships","generic luxury resort","empty spotless streets"]}'::jsonb,
  'home',
  'relaxed',
  array['morning','evening','late_night']::text[],
  array['proximity','slow romance','familiar routines','escape','community']::text[],
  array['harbor life','cafes','markets','beaches','sailing','dining','arts','nightlife','coastal walks']::text[],
  'walkable',
  '{"climate":"Mediterranean coastal","states":["sunny","hot","breezy","rain","coastal_storm"],"outdoorBias":0.82}'::jsonb
)
on conflict(id) do update set
  name=excluded.name,
  slug=excluded.slug,
  description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,
  theme=excluded.theme,
  metadata=excluded.metadata,
  published=excluded.published,
  access_type=excluded.access_type,
  entitlement_key=excluded.entitlement_key,
  timezone=excluded.timezone,
  sort_order=excluded.sort_order,
  featured=excluded.featured,
  visual_context=excluded.visual_context,
  world_role=excluded.world_role,
  social_rhythm=excluded.social_rhythm,
  dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,
  activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,
  weather_profile=excluded.weather_profile,
  updated_at=now();

create temporary table port_vervelle_location_seed(
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

insert into port_vervelle_location_seed values
  (1,null,'Porto Vecchio','Porto Vecchio','porto-vecchio','The old working harbor and Port Vervelle''s natural arrival point, busiest from before sunrise through the evening return of the boats.','district','district',array['harbor walk','coffee','fishing','local life']::text[],null),
  (2,null,'Piazza Aurelia','Piazza Aurelia','piazza-aurelia','The historic pedestrian center where errands, fountain meetings, markets, music, festivals, and town politics repeatedly cross.','district','district',array['markets','festivals','street music','dates','people watching']::text[],null),
  (3,null,'Marina Solana','Marina Solana','marina-solana','A beachside district that moves from sun and swimming into terraces, music, dancing, and Port Vervelle''s latest nights.','district','district',array['beach','swimming','dining','music','nightlife']::text[],null),
  (4,null,'Bellavista','Bellavista','bellavista','A quiet hillside neighborhood of homes, studios, gardens, steep lanes, and balconies looking back toward the harbor.','district','district',array['views','gardens','fitness','creative work','quiet walks']::text[],null),
  (5,null,'Mercato Vecchio','Mercato Vecchio','mercato-vecchio','The everyday working town: produce stalls, practical errands, clinics, workshops, groceries, and high-frequency morning encounters.','district','district',array['market','shopping','errands','local commerce','morning coffee']::text[],null),
  (6,null,'Capo Vervelle','Capo Vervelle','capo-vervelle','The cliffs and countryside beyond town, where a vineyard, hotel, cove, lighthouse, and olive groves make the day feel farther away.','district','district',array['vineyard','cliff walk','swimming','spa','sunset']::text[],null),

  (7,1,'Porto Vecchio','Café Marelle','cafe-marelle','A waterfront café for strong coffee, casual dates, breakfast, and watching the harbor wake up.','cafe','venue',array['coffee','breakfast','casual date','people watching']::text[],'{"open":"06:30","close":"20:00"}'::jsonb),
  (8,1,'Porto Vecchio','Vervelle Fish Market','vervelle-fish-market','A salt-bright morning market linking fishing crews, cooks, restaurant owners, and half the town''s best gossip.','market','venue',array['market','seafood','shopping','people watching']::text[],'{"open":"05:00","close":"13:00"}'::jsonb),
  (9,1,'Porto Vecchio','The Blue Lantern','blue-lantern','A sailors'' tavern with worn tables, acoustic music, easy gossip, and post-shift drinks near the water.','nightlife','venue',array['drinks','live music','conversation','late dinner']::text[],'{"open":"16:00","close":"01:00"}'::jsonb),
  (10,1,'Porto Vecchio','Porto Marina','porto-marina','The working docks for arrivals, departures, fishing boats, sailing charters, and unhurried waterfront walks.','marina','landmark',array['sailing','boat charter','harbor walk','fishing']::text[],'{"open":"05:00","close":"23:00"}'::jsonb),
  (11,1,'Porto Vecchio','Vervelle Sailing House','vervelle-sailing-house','A practical harbor school for lessons, coastal tours, charter planning, and the town''s sailing community.','entertainment','venue',array['sailing lessons','boat tour','charter planning']::text[],'{"open":"08:00","close":"19:00"}'::jsonb),
  (12,1,'Porto Vecchio','La Casa del Mare','casa-del-mare','A family seafood restaurant known for long harbor dinners, daily catches, and tables that rarely turn quickly.','restaurant','venue',array['seafood dinner','wine','date night','family meal']::text[],'{"open":"12:00","close":"23:00"}'::jsonb),
  (13,1,'Porto Vecchio','Harbor Steps','harbor-steps','Broad stone steps where teenagers, musicians, couples, and off-duty workers linger beside the evening harbor.','outdoor','landmark',array['sit by the water','street music','sunset','conversation']::text[],null),

  (14,2,'Piazza Aurelia','Forno Bellini','forno-bellini','A neighborhood bakery whose bread, pastry, and morning queue make it one of the town''s most reliable encounter points.','bakery','venue',array['coffee','pastry','breakfast','shopping']::text[],'{"open":"06:00","close":"18:00"}'::jsonb),
  (15,2,'Piazza Aurelia','Libreria Vervelle','libreria-vervelle','A bookshop with a shaded reading courtyard for writers, browsers, and quiet daytime conversations.','bookstore','venue',array['books','reading','coffee','quiet conversation']::text[],'{"open":"09:00","close":"19:00"}'::jsonb),
  (16,2,'Piazza Aurelia','Osteria Rosa','osteria-rosa','A warm old-town restaurant for wine, celebrations, recurring neighborhood tables, and dinners that stretch late.','restaurant','venue',array['dinner','wine','celebration','date night']::text[],'{"open":"12:00","close":"23:30"}'::jsonb),
  (17,2,'Piazza Aurelia','Atelier Amélie','atelier-amelie','A tailoring and fashion studio tied into fittings, weddings, performances, and every formal event in town.','studio','venue',array['fashion','tailoring','shopping','creative work']::text[],'{"open":"09:30","close":"18:30"}'::jsonb),
  (18,2,'Piazza Aurelia','Farmacia Vervelle','farmacia-vervelle','The old-town pharmacy: part health errand, part neighborhood information network, and always more social than intended.','pharmacy','venue',array['health errand','shopping','local conversation']::text[],'{"open":"08:00","close":"20:00"}'::jsonb),
  (19,2,'Piazza Aurelia','Palazzo Civico','palazzo-civico','Port Vervelle''s civic hall for weddings, permits, public meetings, planning, and the quiet machinery of small-town politics.','public service','landmark',array['wedding','public meeting','local history','civic errand']::text[],'{"open":"08:30","close":"17:00"}'::jsonb),

  (20,3,'Marina Solana','Spiaggia Solana','spiaggia-solana','The main beach for swimming, volleyball, picnics, flirting, and chance encounters that last into sunset.','outdoor','outdoor',array['swimming','beach','volleyball','picnic','sunset']::text[],null),
  (21,3,'Marina Solana','Lido Vervelle','lido-vervelle','A lived-in beach club with cabanas, food, music, locals on shift, and visitors trying to stay all afternoon.','restaurant','venue',array['beach club','lunch','music','swimming']::text[],'{"open":"09:00","close":"23:00"}'::jsonb),
  (22,3,'Marina Solana','La Sirena','la-sirena','The town''s largest nightclub for dancing, DJs, promotion nights, and choices made after midnight.','nightlife','venue',array['dancing','dj','drinks','nightlife']::text[],'{"open":"22:00","close":"04:00"}'::jsonb),
  (23,3,'Marina Solana','Velours','velours','An intimate cocktail lounge where live singers, piano, and low conversation make the room feel smaller than it is.','lounge','venue',array['cocktails','live music','piano','date night']::text[],'{"open":"18:00","close":"02:00"}'::jsonb),
  (24,3,'Marina Solana','Maison Rouge','maison-rouge','A polished cabaret and jazz room for performances, cocktails, late dinners, and private events.','entertainment','venue',array['cabaret','jazz','cocktails','live performance']::text[],'{"open":"19:00","close":"02:00"}'::jsonb),
  (25,3,'Marina Solana','Solana Beach Rentals','solana-beach-rentals','A beachside rental shack for boards, kayaks, lessons, lifeguard shifts, and practical advice about the water.','outdoor','venue',array['kayak','paddleboard','lesson','beach']::text[],'{"open":"08:00","close":"19:00"}'::jsonb),
  (26,3,'Marina Solana','Luna Terrace','luna-terrace','A rooftop restaurant and wine bar with Port Vervelle''s signature sunset view and an unmistakable date-night mood.','restaurant','venue',array['dinner','wine','sunset','date night']::text[],'{"open":"17:00","close":"00:00"}'::jsonb),

  (27,4,'Bellavista','Bellavista Apartments','bellavista-apartments','A hillside apartment building of balconies, shared stairs, younger residents, and frequent neighbor encounters.','residence','residence',array['visit friends','balcony conversation','local life']::text[],null),
  (28,4,'Bellavista','Villa Mirabelle','villa-mirabelle','An established residential villa with garden apartments, older stonework, and quieter, wealthier routines.','residence','residence',array['garden visit','quiet conversation','local life']::text[],null),
  (29,4,'Bellavista','Studio Lucent','studio-lucent','A photography studio handling portraits, fashion, weddings, and tourism work in rooms full of coastal light.','studio','venue',array['photography','portrait session','creative work']::text[],'{"open":"09:00","close":"19:00"}'::jsonb),
  (30,4,'Bellavista','Fiore & Fig','fiore-and-fig','A florist and gift shop woven into weddings, apologies, celebrations, and the color of Bellavista''s daily streets.','shopping','venue',array['flowers','gifts','shopping']::text[],'{"open":"09:00","close":"19:00"}'::jsonb),
  (31,4,'Bellavista','Bellavista Fitness Club','bellavista-fitness-club','A neighborhood training and wellness club for weights, yoga, Pilates, instructors, and familiar routines.','fitness','venue',array['workout','yoga','pilates','wellness']::text[],'{"open":"06:00","close":"22:00"}'::jsonb),
  (32,4,'Bellavista','Belvedere Garden','belvedere-garden','A quiet overlook garden for picnics, sunset walks, dates, and conversations that need a little distance from town.','park','outdoor',array['garden walk','picnic','sunset','quiet conversation']::text[],null),

  (33,5,'Mercato Vecchio','Vervelle General Clinic','vervelle-general-clinic','The town''s clinic and small hospital, linking medicine, therapy, reception work, night shifts, and everyday care.','healthcare','venue',array['appointment','therapy','visit','work']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (34,5,'Mercato Vecchio','Officina Moretti','officina-moretti','A scooter and automotive workshop where repairs, favors, tools, and working-town conversation share the same floor.','workshop','venue',array['scooter repair','car repair','local conversation']::text[],'{"open":"07:30","close":"18:30"}'::jsonb),
  (35,5,'Mercato Vecchio','Vervelle Design Works','vervelle-design-works','An architecture and interiors office involved in restorations, homes, hospitality projects, and professional town life.','studio','venue',array['architecture','design','creative work']::text[],'{"open":"09:00","close":"18:00"}'::jsonb),
  (36,5,'Mercato Vecchio','Studio Ondine','studio-ondine','A ceramics and painting studio offering classes, exhibitions, commissions, and handmade sales.','gallery','venue',array['ceramics','painting','art class','gallery']::text[],'{"open":"10:00","close":"19:00"}'::jsonb),
  (37,5,'Mercato Vecchio','Piccolo Cinema','piccolo-cinema','A two-screen neighborhood cinema mixing European films, mainstream releases, and occasional midnight shows.','cinema','venue',array['movie','cinema','late show']::text[],'{"open":"14:00","close":"00:30"}'::jsonb),
  (38,5,'Mercato Vecchio','Vervelle Cooperative','vervelle-cooperative','The practical grocery and household cooperative where mundane errands reliably turn into familiar encounters.','shopping','venue',array['groceries','shopping','errands','local conversation']::text[],'{"open":"07:30","close":"21:00"}'::jsonb),

  (39,6,'Capo Vervelle','Domaine Vervelle','domaine-vervelle','A vineyard and estate for tastings, harvest work, weddings, long lunches, and summer events above the coast.','vineyard','venue',array['wine tasting','vineyard tour','wedding','long lunch']::text[],'{"open":"10:00","close":"22:00"}'::jsonb),
  (40,6,'Capo Vervelle','Hôtel Celeste','hotel-celeste','A boutique cliffside hotel with a pool, gardens, visiting guests, hospitality work, and a restaurant locals still use.','hotel','residence',array['stay','pool','garden','dinner']::text[],'{"open":"00:00","close":"23:59"}'::jsonb),
  (41,40,'Capo Vervelle','Celeste Spa','celeste-spa','The hotel''s spa for treatments, sauna, quiet terraces, wellness routines, and locals taking an afternoon away.','spa','venue',array['spa','sauna','massage','relaxation']::text[],'{"open":"09:00","close":"20:00"}'::jsonb),
  (42,6,'Capo Vervelle','Cala Bianca','cala-bianca','A secluded rocky cove for swimming, sun-warmed stone, quiet company, and conversations away from the main beach.','outdoor','outdoor',array['swimming','cove','sunbathing','quiet conversation']::text[],null),
  (43,6,'Capo Vervelle','Faro Vervelle','faro-vervelle','A lighthouse reached by a cliff trail, known for wind, solitude, sunset, and dramatic views back toward town.','landmark','landmark',array['cliff walk','lighthouse','sunset','photography']::text[],null),
  (44,6,'Capo Vervelle','La Pergola','la-pergola','An olive-grove restaurant with communal tables, local wine, live music, and summer dancing under the trees.','restaurant','venue',array['dinner','wine','live music','summer dancing']::text[],'{"open":"12:00","close":"23:30"}'::jsonb);

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  ('27000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid,
  null,
  name,
  slug,
  description,
  category,
  null,
  hours,
  activities,
  jsonb_build_object('tags',to_jsonb(activities),'district',true,'photoStatus','pending'),
  location_type,
  location_index*10,
  0,
  jsonb_build_object(
    'canonicalPrompt',name||', Port Vervelle. '||description,
    'visualAnchors',jsonb_build_array(name,'Port Vervelle'),
    'avoid','["recognizable real-world landmarks","mega-resort styling","cruise ships","futuristic architecture","empty theme-park streets"]'::jsonb
  ),
  jsonb_build_object('summary',description,'stableFacts',jsonb_build_array(name||' is a district of Port Vervelle.'))
from port_vervelle_location_seed
where parent_index is null
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  ('27000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid,
  ('27000000-0000-4000-8000-'||lpad(parent_index::text,12,'0'))::uuid,
  name,
  slug,
  description,
  category,
  case when slug='porto-marina' then 'porto-marina' else null end,
  hours,
  activities,
  jsonb_build_object('tags',to_jsonb(activities),'district',district_name,'photoStatus',case when slug='porto-marina' then 'ready' else 'pending' end),
  location_type,
  location_index*10,
  1,
  jsonb_build_object(
    'canonicalPrompt',name||', '||district_name||', Port Vervelle. '||description,
    'visualAnchors',jsonb_build_array(name,district_name,'Port Vervelle'),
    'avoid','["recognizable real-world landmarks","mega-resort styling","cruise ships","futuristic architecture","empty theme-park streets"]'::jsonb
  ),
  jsonb_build_object('summary',description,'stableFacts',jsonb_build_array(name||' is in '||district_name||'.'))
from port_vervelle_location_seed
where parent_index is not null and parent_index<>40
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  ('27000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid,
  ('27000000-0000-4000-8000-'||lpad(parent_index::text,12,'0'))::uuid,
  name,
  slug,
  description,
  category,
  null,
  hours,
  activities,
  jsonb_build_object('tags',to_jsonb(activities),'district',district_name,'photoStatus','pending'),
  location_type,
  location_index*10,
  2,
  jsonb_build_object(
    'canonicalPrompt',name||', '||district_name||', Port Vervelle. '||description,
    'visualAnchors',jsonb_build_array(name,district_name,'Port Vervelle'),
    'avoid','["recognizable real-world landmarks","mega-resort styling","cruise ships","futuristic architecture","empty theme-park streets"]'::jsonb
  ),
  jsonb_build_object('summary',description,'stableFacts',jsonb_build_array(name||' is inside Hôtel Celeste in '||district_name||'.'))
from port_vervelle_location_seed
where parent_index=40
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

update public.together_worlds
set default_arrival_location_id='27000000-0000-4000-8000-000000000010',updated_at=now()
where id='10000000-0000-4000-8000-000000000008';

commit;
