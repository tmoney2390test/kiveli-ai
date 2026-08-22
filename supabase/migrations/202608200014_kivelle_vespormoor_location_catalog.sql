begin;

create temporary table vespormoor_location_seed(
  location_index integer primary key,
  parent_index integer,
  district_name text not null,
  name text not null,
  slug text not null,
  description text not null,
  category text not null,
  location_type text not null,
  activities text[] not null
) on commit drop;

insert into vespormoor_location_seed values
  (1,null,'Old Vesper','Old Vesper','old-vesper','The oldest part of town: narrow cobblestone streets, gothic storefronts, gas lamps, hidden courtyards, and centuries-old businesses.','district','district',array['cobblestone walks','markets','cafes','historic sites','nightlife']::text[]),
  (2,null,'Vesper Heights','Vesper Heights','vesper-heights','Wooded hills filled with enormous homes belonging to Vespormoor''s wealthiest and oldest families.','district','district',array['estate visits','gardens','horseback riding','fine dining','overlooks']::text[]),
  (3,null,'Lakeward','Lakeward','lakeward','Restaurants, docks, old cottages, walking paths, and fog-covered water give Lakeward some of Vespormoor''s most romantic scenery.','district','district',array['lake walks','boating','waterfront dining','spa visits','quiet dates']::text[]),
  (4,null,'Vespormoor University','Vespormoor University','vespormoor-university','A colossal gothic castle-estate occupying the ridge above Vespormoor, with towers, bridges, gardens, courtyards, dormitories, and academic wings visible from almost anywhere in town.','district','district',array['classes','study','library research','garden walks','campus events']::text[]),
  (5,null,'Thornwood','Thornwood','thornwood','Beyond the populated valley lie enormous forests, isolated cabins, waterfalls, ruins, and places that existed long before Vespormoor.','district','district',array['hiking','waterfalls','cabin stays','wilderness exploration','ritual sites']::text[]),
  (6,null,'Raven Ward','Raven Ward','raven-ward','The younger and more dangerous side of Vespormoor, filled with clubs, converted warehouses, underground venues, tattoo studios, and businesses that thrive after midnight.','district','district',array['nightclubs','live music','tattoos','late dining','night markets']::text[]),

  (7,1,'Old Vesper','Vesper Square','vesper-square','Central town plaza with an old fountain, markets, festivals, and outdoor gathering spaces.','plaza','landmark',array['market browsing','festivals','meetups','people watching']::text[]),
  (8,1,'Old Vesper','The Black Lantern','the-black-lantern','A candlelit pub inside a former coaching inn and one of Vespormoor''s oldest social institutions.','pub','venue',array['drinks','dinner','local stories','late conversation']::text[]),
  (9,1,'Old Vesper','Morrow & Quill','morrow-and-quill','A huge independent bookstore filled with fireplaces, ladders, forgotten rooms, and rare books.','bookstore','venue',array['book browsing','reading','rare-book research','fireside conversation']::text[]),
  (10,1,'Old Vesper','Belladonna Apothecary','belladonna-apothecary','An herbalist and apothecary serving humans as well as customers with more unusual medical needs.','apothecary','venue',array['herbal remedies','consultation','ingredient shopping','quiet conversation']::text[]),
  (11,1,'Old Vesper','The Mourning Cup','the-mourning-cup','A cozy café famous for pastries, dark coffee, rain-covered windows, and lingering conversations.','cafe','venue',array['coffee','pastries','reading','lingering conversation']::text[]),
  (12,1,'Old Vesper','Saint Orison Chapel','saint-orison-chapel','A small gothic church with an ancient crypt beneath it.','chapel','landmark',array['quiet reflection','history','crypt visit','candle lighting']::text[]),
  (13,1,'Old Vesper','Velvet Thorn','velvet-thorn','An intimate late-night cocktail lounge hidden behind an unmarked entrance.','lounge','venue',array['cocktails','late-night date','private conversation','live music']::text[]),

  (14,2,'Vesper Heights','Vesper House','vesper-house','The supposedly abandoned ancestral home of Lucien and Isolde Vesper, where lights have recently appeared inside again.','estate','residence',array['estate visit','investigation','history','grounds walk']::text[]),
  (15,2,'Vesper Heights','Blackwood Estate','blackwood-estate','An immaculate mansion belonging to one of the Covenant''s most influential families.','estate','residence',array['formal visit','private dinner','Covenant business','garden walk']::text[]),
  (16,2,'Vesper Heights','Rosegrave Gardens','rosegrave-gardens','A public botanical estate famous for strange black roses and secluded paths.','garden','outdoor',array['garden walk','botany','quiet date','photography']::text[]),
  (17,2,'Vesper Heights','The Conservatory','the-conservatory','An elegant glasshouse restaurant overlooking the lights of Vespormoor.','restaurant','venue',array['fine dining','cocktails','romantic dinner','town views']::text[]),
  (18,2,'Vesper Heights','Hawthorne Riding Club','hawthorne-riding-club','A historic equestrian estate with stables, riding trails, and a wealthy social scene.','equestrian','venue',array['horseback riding','lessons','trail rides','social events']::text[]),
  (19,2,'Vesper Heights','Vesper Heights Overlook','vesper-heights-overlook','A stone lookout providing one of the best views over the town and lake.','overlook','outdoor',array['town views','lake views','sunset','private conversation']::text[]),
  (20,2,'Vesper Heights','Vale House','vale-house','A long-abandoned mansion recently occupied again under mysterious circumstances.','estate','residence',array['mysterious visit','investigation','grounds walk','private meeting']::text[]),

  (21,3,'Lakeward','Glasswater Pier','glasswater-pier','A long public pier extending into Lake Vesper.','pier','landmark',array['pier walk','lake views','fishing','quiet conversation']::text[]),
  (22,3,'Lakeward','Stillwater House','stillwater-house','An upscale restaurant with enormous windows looking directly across the lake.','restaurant','venue',array['fine dining','wine','lake views','romantic dinner']::text[]),
  (23,3,'Lakeward','The Drowned Bell','the-drowned-bell','An old waterfront tavern popular with fishermen, students, locals, and supernatural regulars.','tavern','venue',array['drinks','seafood','local stories','live music']::text[]),
  (24,3,'Lakeward','Vesper Boatworks','vesper-boatworks','A historic marina offering rowboats, sailboats, and lake excursions.','marina','venue',array['rowboating','sailing','lake excursion','boat repair']::text[]),
  (25,3,'Lakeward','Moonwake Baths','moonwake-baths','A restored Victorian bathhouse turned luxurious lakeside spa.','spa','venue',array['spa treatment','bathing','massage','lakeside relaxation']::text[]),
  (26,3,'Lakeward','Whisper Dock','whisper-dock','A remote wooden dock traditionally used by couples to confess things they cannot say elsewhere.','dock','outdoor',array['private conversation','confession','lake watching','romantic date']::text[]),
  (27,3,'Lakeward','The Sunken Chapel','the-sunken-chapel','A ruined stone structure beneath the lake that becomes partially visible when water levels fall.','ruin','landmark',array['ruin viewing','local history','investigation','lake mystery']::text[]),

  (28,4,'Vespormoor University','The Grand Hall','the-grand-hall','An enormous vaulted gathering hall used for ceremonies, dinners, dances, and major university events.','hall','venue',array['ceremonies','formal dinners','dances','university events']::text[]),
  (29,4,'Vespormoor University','Blackglass Library','blackglass-library','A towering multi-level library containing one of the world''s greatest collections of historical and supernatural material.','library','venue',array['study','research','rare collections','quiet conversation']::text[]),
  (30,4,'Vespormoor University','Vesper Tower','vesper-tower','The highest tower on campus, providing a panoramic view of Vespormoor and Lake Vesper.','tower','landmark',array['panoramic views','tower climb','photography','private conversation']::text[]),
  (31,4,'Vespormoor University','The Cloisters','the-cloisters','Covered gothic walkways surrounding a beautiful secluded courtyard garden.','cloister','landmark',array['covered walk','courtyard rest','study','quiet date']::text[]),
  (32,4,'Vespormoor University','Blackwood Dormitories','blackwood-dormitories','Atmospheric student residences occupying former guest and servant wings of the castle.','dormitory','residence',array['student life','study','visit friends','late conversation']::text[]),
  (33,4,'Vespormoor University','Anatomy Hall','anatomy-hall','A prestigious medical school containing old surgical theaters and some very unusual specimens.','academic','venue',array['medical study','lecture','anatomy research','specimen viewing']::text[]),
  (34,4,'Vespormoor University','The Observatory','the-observatory','A remote domed observatory above the estate, popular for astronomy classes and late-night dates.','observatory','venue',array['stargazing','astronomy','late-night date','research']::text[]),
  (35,4,'Vespormoor University','The Undercroft','the-undercroft','Ancient tunnels, crypts, forgotten rooms, and sealed passages beneath the castle.','underground','zone',array['exploration','archive search','crypt visit','investigation']::text[]),
  (36,4,'Vespormoor University','Rookery House','rookery-house','A busy student café and pub inside an old gatehouse.','cafe','venue',array['coffee','pub food','student socializing','study']::text[]),
  (37,4,'Vespormoor University','The High Gardens','the-high-gardens','Vast terraced gardens with fountains, hedge mazes, glasshouses, secluded benches, and cliffside overlooks.','garden','outdoor',array['garden walk','hedge maze','cliff views','quiet date']::text[]),

  (38,5,'Thornwood','Thornwood Trailhead','thornwood-trailhead','The main entrance to the extensive network of mountain and forest trails.','trailhead','outdoor',array['hiking','trail planning','meetup','wildlife watching']::text[]),
  (39,5,'Thornwood','Witch''s Falls','witchs-falls','A dramatic waterfall cascading into a deep natural swimming hole.','waterfall','outdoor',array['waterfall hike','swimming','picnic','photography']::text[]),
  (40,5,'Thornwood','Foxglove Cabin Retreats','foxglove-cabin-retreats','Beautiful secluded cabins scattered through the forest.','cabins','residence',array['cabin stay','fireside evening','forest walk','private retreat']::text[]),
  (41,5,'Thornwood','The Crooked Oak','the-crooked-oak','A rustic tavern and restaurant frequented by locals, hikers, hunters, and shapeshifters.','tavern','venue',array['rustic dinner','drinks','trail stories','local gathering']::text[]),
  (42,5,'Thornwood','Moonstone Quarry','moonstone-quarry','An abandoned quarry containing flooded tunnels and unusual pale stone.','quarry','zone',array['exploration','geology','flooded tunnels','investigation']::text[]),
  (43,5,'Thornwood','The Standing Stones','the-standing-stones','An ancient stone circle still used for supernatural rituals.','ritual site','landmark',array['ritual observance','history','night visit','quiet reflection']::text[]),
  (44,5,'Thornwood','Morrow Vale Ranger Station','morrow-vale-ranger-station','A remote ranger outpost responsible for incidents officials usually describe as wildlife encounters.','ranger station','venue',array['trail information','ranger work','incident report','wilderness rescue']::text[]),

  (45,6,'Raven Ward','Nocturne','nocturne','Vespormoor''s premier nightclub inside a converted nineteenth-century performance hall.','nightclub','venue',array['dancing','cocktails','music','nightlife']::text[]),
  (46,6,'Raven Ward','The Crimson Room','the-crimson-room','An exclusive members-only lounge popular with wealthy supernatural residents.','lounge','venue',array['cocktails','private conversation','networking','people watching']::text[]),
  (47,6,'Raven Ward','Black Veil Tattoo','black-veil-tattoo','A tattoo and piercing studio specializing in unusual inks, sigils, and occult designs.','tattoo studio','venue',array['tattoo','piercing','sigil design','consultation']::text[]),
  (48,6,'Raven Ward','Dead Letter','dead-letter','An underground live-music venue for alternative, metal, electronic, and experimental acts.','music venue','venue',array['live music','dancing','drinks','underground shows']::text[]),
  (49,6,'Raven Ward','Afterdark Diner','afterdark-diner','A twenty-four-hour diner where almost every social circle in Vespormoor eventually crosses paths.','diner','venue',array['late meal','coffee','people watching','chance encounter']::text[]),
  (50,6,'Raven Ward','The Red Market','the-red-market','A hidden nighttime marketplace for supernatural goods, rare ingredients, information, and illicit services.','night market','venue',array['night market','rare ingredients','information trading','supernatural goods']::text[]),
  (51,6,'Raven Ward','Saint Mercy Hotel','saint-mercy-hotel','A decadent old boutique hotel with a cocktail bar downstairs and a reputation for absolute discretion.','hotel','residence',array['stay','cocktails','private meeting','late-night date']::text[]);

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  ('29000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000010'::uuid,
  case when parent_index is null then null else ('29000000-0000-4000-8000-'||lpad(parent_index::text,12,'0'))::uuid end,
  name,slug,description,category,null,null,activities,
  jsonb_build_object(
    'tags',to_jsonb(activities),
    'district',case when parent_index is null then to_jsonb(true) else to_jsonb(district_name) end,
    'photoStatus','world_fallback',
    'source','author_catalog_2026-08-20'
  ),
  location_type,location_index*10,case when parent_index is null then 0 else 1 end,
  jsonb_build_object(
    'canonicalPrompt',name||', '||district_name||', Vespormoor. '||description||' Grounded Gothic romantic realism in a secluded mountain valley: cool blue-gray mist, rain-dark textures, aged brass, warm candlelight, restrained supernatural tension, and believable lived-in detail.',
    'indoorOutdoor',case when location_type in('outdoor','landmark','district') then 'outdoor' else 'mixed' end,
    'visualAnchors',jsonb_build_array(name,district_name,'Vespormoor','low mist','warm candlelight'),
    'avoid','["overt high-fantasy spectacle","visible monsters in ordinary public scenes","graphic horror or gore","modern glass skyline","cyberpunk neon","theme-park Gothic"]'::jsonb
  ),
  jsonb_build_object('summary',description,'stableFacts',jsonb_build_array(name||' is in '||district_name||'.'))
from vespormoor_location_seed
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

update public.together_worlds
set
  default_arrival_location_id='29000000-0000-4000-8000-000000000007',
  published=true,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'releaseStatus','preview',
    'contentStatus','location_catalog_preview',
    'locationCatalogStatus','ready',
    'locationPhotoStatus','world_fallback',
    'mappedLocationPhotoCount',0,
    'districtCount',6,
    'locationCount',51,
    'publicPlaceCount',45,
    'emptyPreview',false
  ),
  updated_at=now()
where id='10000000-0000-4000-8000-000000000010';

commit;
