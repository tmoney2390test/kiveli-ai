begin;

-- Juniper City geography v2 is intentionally additive. Existing location IDs stay
-- canonical while five new districts and eight new destinations use the 2a namespace.
with district_seed as(
  select * from(values
    ('11000000-0000-4000-8000-000000000023'::uuid,10,'Alder District','alder-district',
      'Juniper City''s walkable creative-commercial core, where independent shops, photography, galleries, books, coffee, design culture, intimate dining, and polished evening venues share restored brick blocks.',
      'Alder District, Juniper City''s walkable creative-commercial core of restored brick storefronts, independent galleries, photography studios, books, coffee, intimate dining, and polished evening venues.',
      array['restored brick mixed-use blocks','independent storefronts beneath upper-floor studios','small gallery and courtyard passages']::text[],
      array['warm brick','painted timber','blackened steel','large storefront glass']::text[],
      array['creative','walkable','polished without feeling corporate']::text[],
      array['espresso drifting from corner cafes','bicycle bells and delivery carts on narrow side streets','gallery light glowing through broad windows']::text[],
      array['the gallery-and-bookshop stretch','Juniper wayfinding in dark green enamel','courtyards hidden behind restored brick facades']::text[],
      array['a busy creative main street','quieter studio and residential side streets','small courtyards linking shops and hospitality spaces']::text[],
      array['northside','riverside','marquee-quarter','juniper-cafe','glassline-gallery','alder-house']::text[],
      array['coffee','gallery walk','book browsing','creative work','dinner','cocktails']::text[]),
    ('2a000000-0000-4000-8000-000000000001'::uuid,20,'Northside','northside',
      'Juniper''s music and neighborhood-nightlife district, shaped by old brick storefronts, live rooms, record culture, bars, karaoke, murals, and late-night regulars.',
      'Northside, Juniper City: an old-brick music and neighborhood-nightlife district with live rooms, record shops, murals, modest bars, exterior alleys, and believable late-night street life.',
      array['old brick storefront rows','converted warehouse music rooms','painted party walls and narrow alleys']::text[],
      array['dark red brick','worn timber','painted concrete','aged neon tubing']::text[],
      array['music-driven','unpolished','familiar after dark']::text[],
      array['bass leaking through venue walls','fryer heat and beer near the bars','rain sharpening old neon on the pavement']::text[],
      array['layered music posters','large neighborhood murals','the Northline roadside sign at the district edge']::text[],
      array['a bar-and-music spine through the center','record shops and late food on cross streets','the motor lodge and arterial road at the outer edge']::text[],
      array['alder-district','marquee-quarter','northside-bar','static-house','needles-and-notes','northline-motor-lodge']::text[],
      array['live music','records','karaoke','drinks','late food','night walk']::text[]),
    ('2a000000-0000-4000-8000-000000000002'::uuid,30,'Marquee Quarter','marquee-quarter',
      'Juniper''s entertainment district, gathering cinema, games, comedy, rooftop events, casual food, and high-energy social dates within a bright, compact evening circuit.',
      'Marquee Quarter, Juniper City''s compact entertainment district of a restored cinema, comedy basement, barcade, rooftop gatherings, casual food, theater signs, and energetic evening crowds.',
      array['restored theater facades','mixed-use entertainment blocks','accessible rooftops above compact venues']::text[],
      array['brick','marquee bulbs','painted steel','glass block']::text[],
      array['playful','social','cinematic after dark']::text[],
      array['popcorn and street food around showtime','laughter rising from basement stairs','marquee bulbs reflecting in passing traffic']::text[],
      array['the restored Marquee Cinema sign','a rooftop screen above the quarter','small illuminated venue blades along the sidewalks']::text[],
      array['a theater-centered main block','basement and street-level entertainment venues','roof access and food clustered along side streets']::text[],
      array['alder-district','civic-commons','northside','marquee-cinema','skyline-rooftop','juniper-civic-arena']::text[],
      array['movie','comedy','arcade games','rooftop event','casual dinner','date night']::text[]),
    ('2a000000-0000-4000-8000-000000000003'::uuid,40,'Halcyon Green','halcyon-green',
      'Juniper''s green, wellness-oriented daytime neighborhood around its major park and gardens, where brunch, exercise, bakeries, walks, and quieter routines set the pace.',
      'Halcyon Green, Juniper City: a leafy daytime neighborhood wrapped around a large park and botanical garden, with low-rise brick homes, bakeries, brunch rooms, fitness spaces, and shaded walking routes.',
      array['low-rise neighborhood blocks','park-edge storefronts','glasshouse and garden structures']::text[],
      array['pale brick','green-painted metal','glass','weathered stone']::text[],
      array['restorative','daylight-oriented','quietly social']::text[],
      array['bread and coffee near the park entrances','leaves moving above broad sidewalks','damp earth and glasshouse humidity after rain']::text[],
      array['Halcyon Park''s pond loop','the Lark glasshouse roof','green enamel neighborhood signs']::text[],
      array['park and garden at the center','brunch and routine venues along the north edge','quieter residential streets toward Riverside and Civic Commons']::text[],
      array['riverside','civic-commons','halcyon-park','lark-botanical-garden','moss-and-crumb','ember-and-rye']::text[],
      array['park walk','garden visit','brunch','bakery stop','workout','quiet morning']::text[]),
    ('2a000000-0000-4000-8000-000000000004'::uuid,50,'Riverside','riverside',
      'Juniper''s residential waterfront, where apartments, river views, quiet restaurants, dusk walks, visiting guests, and intimate spaces share a calm edge of the city.',
      'Riverside, Juniper City''s residential waterfront: contemporary apartments, mature trees, broad river paths, quiet restaurants, public landings, and restrained hospitality facing the water.',
      array['contemporary riverfront apartments','adapted brick residential buildings','low public pavilions along the water']::text[],
      array['warm brick','pale concrete','weathered timber','river-facing glass']::text[],
      array['residential','intimate','best at dusk']::text[],
      array['water moving below the promenade','bicycle tires on the riverside path','restaurant light carrying across the dark river']::text[],
      array['the continuous Riverwalk','balconies stepping toward the water','Riverside Landing''s broad public steps']::text[],
      array['apartments and restaurants set one block inland','a continuous tree-lined river path','public landing and hotel frontage at the water']::text[],
      array['alder-district','halcyon-green','civic-commons','riverwalk','riverside-landing','rivermark-hotel']::text[],
      array['river walk','quiet dinner','visit resident','meet by the water','weekend stay','photography']::text[]),
    ('2a000000-0000-4000-8000-000000000005'::uuid,60,'Civic Commons','civic-commons',
      'Juniper''s public and institutional center, bringing arena events, transit, healthcare, civic life, practical errands, and large city gatherings into one connected district.',
      'Civic Commons, Juniper City''s public center of contemporary civic buildings, a major rail station, hospital complex, market, arena, broad plazas, transit signs, and large city gatherings.',
      array['contemporary civic masonry buildings','glass-and-steel station hall','large arena and hospital complexes']::text[],
      array['light stone','red brick','dark steel','broad glass curtain walls']::text[],
      array['public','purposeful','busy across the day']::text[],
      array['station announcements and rolling luggage','crowd noise gathering around arena nights','buses braking beside broad civic pavements']::text[],
      array['Juniper Central''s high clock wall','City Hall''s public steps and plaza','the Civic Arena''s curved roofline']::text[],
      array['station and transit approaches on the east','City Hall and the central public plaza','arena, medical campus, and market across connected blocks']::text[],
      array['marquee-quarter','riverside','halcyon-green','juniper-central-station','juniper-city-hall','juniper-civic-arena']::text[],
      array['commute','civic errand','arena event','appointment','market run','public gathering']::text[])
  ) as seed(id,sort_order,name,slug,description,visual_prompt,architecture,materials,atmosphere,sensory,signature_details,layout,nearby_slugs,activities)
), prepared_districts as(
  select seed.*,
    jsonb_build_object(
      'canonicalPrompt',visual_prompt,'indoorOutdoor','mixed','architecture',to_jsonb(architecture),
      'materials',to_jsonb(materials),'lighting',jsonb_build_array('grounded contemporary daylight','warm occupied windows after dark','believable practical street lighting'),
      'atmosphere',to_jsonb(atmosphere),'visualAnchors',to_jsonb(signature_details),
      'avoid',jsonb_build_array('recognizable real-world landmarks','futuristic megacity styling','empty generic streets','European old-town scenery'),
      'viewpoints',jsonb_build_array('street-level district arrival','human-height view along the main pedestrian route','threshold view connecting the district to an adjacent area')
    ) as visual_context,
    jsonb_build_object(
      'version',2,'authored',true,'summary',description,'atmosphere',to_jsonb(atmosphere),
      'sensoryDetails',to_jsonb(sensory),'signatureDetails',to_jsonb(signature_details),'layout',to_jsonb(layout),
      'crowdRhythm',jsonb_build_object(
        'morning','Workers, residents, deliveries, and routine stops establish the district before leisure crowds arrive.',
        'afternoon','Everyday errands and destination visits overlap across the district.',
        'evening','Dining, events, and social plans make the district''s identity most visible.',
        'late_night','Activity concentrates around the places that are genuinely open while residential streets quiet down.',
        'overnight','Only overnight work, travel, lodging, and established private scenes should be assumed active.'),
      'conversationHooks',jsonb_build_array('What brings someone across this district today.','Which route into the neighboring districts fits the current plan.','The local place that best represents this part of Juniper.'),
      'stableFacts',jsonb_build_array(name||' is one of Juniper City''s six primary districts.',description),
      'localEtiquette',jsonb_build_array('District familiarity does not grant access to private homes, guest rooms, staff areas, or closed venues.','Walking between places takes believable time even within the same district.'),
      'nearbyLocationSlugs',to_jsonb(nearby_slugs),
      'publicHistory',jsonb_build_array('The district grew through Juniper''s repeated reuse of older blocks alongside restrained contemporary development.','Its present identity is reinforced by the daily routines of residents as much as its destinations.'),
      'recurringPeople',jsonb_build_array(jsonb_build_object('label',name||' regulars','role','residents, workers, and familiar visitors who give the district continuity','rhythm','Their routines change by daypart rather than appearing everywhere at once.')),
      'activityNotes',(select jsonb_object_agg(activity,initcap(activity)||' should follow real venue hours, travel time, access, and current scene state.') from unnest(activities) activity),
      'accessNotes',jsonb_build_array('Public streets and plazas remain distinct from ticketed, private, residential, medical, and staff-only interiors.'),
      'weatherNotes',jsonb_build_array('Rain, heat, and winter weather change walking routes and outdoor crowd levels without erasing the district''s identity.'),
      'storySeeds',jsonb_build_array('A routine crossing into a neighboring district becomes unexpectedly important.','A familiar local route is interrupted by a public event.','A visiting guest sees the district differently from a resident.')
    ) as lore
  from district_seed seed
)
insert into public.together_locations as target(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,hours,
  possible_activities,metadata,location_type,sort_order,depth,canonical_visual_context,canonical_lore
)
select id,'10000000-0000-4000-8000-000000000001'::uuid,null,name,slug,description,'district',slug,null,
  activities,jsonb_build_object('tags',to_jsonb(activities),'photoStatus',case when slug='alder-district' then 'mapped' else 'world_fallback' end,'directoryDetailMode','lazy','geographyVersion',2),
  'district',sort_order,0,visual_context,lore
from prepared_districts
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=null,name=excluded.name,slug=excluded.slug,
  description=excluded.description,category=excluded.category,
  visual_asset_key=coalesce(target.visual_asset_key,excluded.visual_asset_key),hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=coalesce(target.metadata,'{}'::jsonb)||excluded.metadata,
  location_type='district',sort_order=excluded.sort_order,depth=0,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

with place_seed as(
  select * from(values
    ('2a000000-0000-4000-8000-000000000101'::uuid,'11000000-0000-4000-8000-000000000023'::uuid,160,'The Alder House','alder-house',
      'A 54-room boutique hotel occupying a carefully restored brick building in Juniper''s creative core. Visiting artists, photographers, designers, wedding guests, and business travelers mix in a warm library lounge, understated lobby bar, and enclosed courtyard. Upscale without feeling corporate.',
      'hotel','residence','{"open":"00:00","close":"23:59"}'::jsonb,array['stay','lobby drinks','courtyard','breakfast','reading','date','visiting guest']::text[],
      'The Alder House in Alder District, Juniper City: a carefully restored 54-room brick boutique hotel with an understated lobby bar, warm library lounge, enclosed courtyard, creative guests, and grounded contemporary hospitality.',
      array['restored five-story brick hotel','large original storefront windows','enclosed interior courtyard']::text[],array['warm brick','walnut','aged brass','linen']::text[],array['creative','warm','upscale without feeling corporate']::text[],
      array['old paper and coffee in the library lounge','quiet glassware at the lobby bar','courtyard air moving through an open inner door']::text[],array['54 individually detailed rooms','a library lounge used by visiting creatives','an enclosed brick courtyard']::text[],array['street lobby and understated bar','library lounge beyond reception','guest floors around an enclosed courtyard']::text[],
      array['juniper-cafe','glassline-gallery','paper-trail','photography-studio','velvet-hour']::text[],array['A visiting photographer mistakes a local for another hotel guest.','A wedding party and a gallery opening collide in the courtyard.','A long-stay designer begins treating the library lounge like a studio.']::text[]),
    ('2a000000-0000-4000-8000-000000000102'::uuid,'2a000000-0000-4000-8000-000000000001'::uuid,160,'Northline Motor Lodge','northline-motor-lodge',
      'A revived mid-century motor lodge at the outer edge of Northside. Its glowing roadside sign, exterior walkways, and compact courtyard pool have become fashionable again without erasing the building''s slightly rough history. Touring musicians, road-trippers, temporary residents, and people between apartments all plausibly stay here.',
      'hotel','residence','{"open":"00:00","close":"23:59"}'::jsonb,array['stay','pool','late-night arrival','road trip','music weekend','temporary lodging']::text[],
      'Northline Motor Lodge at the outer edge of Northside, Juniper City: a revived but still slightly rough mid-century motor lodge with a glowing roadside sign, exterior room corridors, parking court, and compact courtyard pool.',
      array['two-story mid-century motor lodge','exterior room walkways','road-facing porte cochere and sign']::text[],array['painted concrete block','aged steel railings','terrazzo','neon tubing']::text[],array['revived','unpretentious','slightly rough around the edges']::text[],
      array['pool chlorine in the small courtyard','car doors and rolling cases after midnight','the roadside sign buzzing faintly in wet weather']::text[],array['glowing NORTHLINE roadside sign','exterior corridors facing the parking court','compact courtyard pool behind a low screen wall']::text[],array['roadside check-in office','two exterior-corridor guest wings','parking court opening toward a compact pool courtyard']::text[],
      array['static-house','northside-bar','needles-and-notes','lantern-dive','alder-district']::text[],array['A touring band arrives after the last set with one room missing.','A temporary resident knows more about Northside than the new manager expects.','A road-trip stop becomes an unplanned week.']::text[]),
    ('2a000000-0000-4000-8000-000000000103'::uuid,'2a000000-0000-4000-8000-000000000004'::uuid,130,'Riverhouse Apartments','riverhouse-apartments',
      'A contemporary residential building near the river with balconies, a shared roof terrace, secure lobby, and a mixture of younger professionals, creatives, and long-term residents.',
      'apartment','residence',null,array['visit resident','rooftop','home life','balcony conversation']::text[],
      'Riverhouse Apartments in Riverside, Juniper City: a contemporary lived-in riverfront apartment building with warm brick and glass, staggered balconies, a secure residential lobby, and shared roof terrace.',
      array['contemporary eight-story apartment building','staggered river-facing balconies','setback shared roof terrace']::text[],array['warm brick','pale concrete','clear glass','weathered balcony timber']::text[],array['residential','private','lived-in']::text[],
      array['elevator doors and quiet lobby conversations','wind around the upper balconies','bicycles moving through the secure side entrance']::text[],array['staggered balconies facing the river','secure lobby with resident mail wall','shared roof terrace above the seventh floor']::text[],array['secure street lobby','residential floors around a central lift','shared roof terrace with river views']::text[],
      array['riverwalk','riverside-landing','sora-table','rivermark-hotel']::text[],array['A rooftop gathering makes two neighbors reconsider what they know about each other.','A long-term resident remembers the block before Riverhouse was built.','A guest reaches the secure lobby without knowing which apartment to call.']::text[]),
    ('2a000000-0000-4000-8000-000000000104'::uuid,'2a000000-0000-4000-8000-000000000004'::uuid,140,'Riverside Landing','riverside-landing',
      'A small public riverfront plaza and landing where broad steps reach the water beside a sheltered pavilion. Walkers, cyclists, small events, and occasional river transport make it one of Riverside''s natural meeting points.',
      'plaza','outdoor',null,array['river view','walk','sit by water','meeting point','photography','small event']::text[],
      'Riverside Landing, Juniper City: a modest public riverfront plaza where broad pale-stone steps descend toward the water beside a timber-and-steel pavilion, cycle path, and occasional small river vessel.',
      array['broad public river steps','low sheltered pavilion','small practical landing stage']::text[],array['pale stone','weathered timber','dark steel','concrete']::text[],array['open','communal','calm between events']::text[],
      array['river water against the lower steps','bicycle bells on the path behind the plaza','voices carrying beneath the pavilion roof']::text[],array['broad steps reaching the water','a low shelter with integrated benches','a small landing used by occasional river transport']::text[],array['cycle and walking path at street level','open plaza and pavilion','broad lower steps and landing at the river']::text[],
      array['riverwalk','riverhouse-apartments','rivermark-hotel','sora-table','civic-commons']::text[],array['A small public event changes an ordinary meeting point.','Someone arrives by river when everyone expected the train.','A photographer notices a detail below the waterline.']::text[]),
    ('2a000000-0000-4000-8000-000000000105'::uuid,'2a000000-0000-4000-8000-000000000004'::uuid,150,'The Rivermark','rivermark-hotel',
      'A polished contemporary riverfront hotel with balcony rooms, a quiet lobby, river-facing suites, and a breakfast terrace overlooking the water. It is popular for visiting professionals, weekend stays, and couples wanting a night away without leaving Juniper.',
      'hotel','residence','{"open":"00:00","close":"23:59"}'::jsonb,array['stay','breakfast terrace','river view','romantic weekend','lobby drinks','visiting guest']::text[],
      'The Rivermark in Riverside, Juniper City: a polished contemporary riverfront hotel with restrained stone and glass, balcony rooms, a quiet residential-scale lobby, river-facing suites, and a breakfast terrace above the water.',
      array['contemporary riverfront hotel','recessed balcony facade','low terrace facing the water']::text[],array['pale stone','warm oak','bronzed metal','river-facing glass']::text[],array['polished','quiet','romantic without being theatrical']::text[],
      array['coffee and warm bread on the breakfast terrace','soft luggage wheels across the quiet lobby','river air moving through open balcony doors']::text[],array['river-facing balcony rooms','a quiet lobby bar recessed from reception','breakfast terrace overlooking the Riverwalk']::text[],array['street arrival and quiet lobby','guest floors oriented toward the river','breakfast terrace above the public waterfront']::text[],
      array['riverwalk','riverside-landing','sora-table','riverhouse-apartments','civic-commons']::text[],array['A local books a night away but avoids explaining why.','A visiting professional recognizes someone in the lobby.','Two guests independently request the same river-facing table.']::text[]),
    ('2a000000-0000-4000-8000-000000000106'::uuid,'2a000000-0000-4000-8000-000000000005'::uuid,130,'Juniper Central Station','juniper-central-station',
      'Juniper''s central rail and regional transit station, connecting downtown districts with the larger metro area. Commuters, visitors, late arrivals, and people leaving town make it a natural story-transition location.',
      'transit','transit','{"open":"04:30","close":"01:00"}'::jsonb,array['train','commute','arrival','departure','meet someone','travel']::text[],
      'Juniper Central Station in Civic Commons: a grounded contemporary American rail and regional transit hall with a restored brick clock wall, high steel-and-glass train shed, practical platforms, rolling luggage, and Juniper green wayfinding.',
      array['high steel-and-glass train shed','restored brick clock wall','broad practical concourse']::text[],array['red brick','dark steel','terrazzo','ribbed glass']::text[],array['transitional','busy','emotionally charged at arrivals and departures']::text[],
      array['platform announcements under the high roof','train brakes and rolling cases','coffee near the early concourse kiosks']::text[],array['high clock wall above the concourse','Juniper green platform signs','east and west meeting boards']::text[],array['street and bus plaza entrances','central ticket and meeting concourse','controlled passages to rail platforms']::text[],
      array['juniper-city-hall','common-market','juniper-medical-center','juniper-civic-arena','marquee-quarter']::text[],array['A late arrival misses the person meant to meet them.','A departure announcement forces a conversation to become specific.','A commuter sees someone returning to Juniper unexpectedly.']::text[]),
    ('2a000000-0000-4000-8000-000000000107'::uuid,'2a000000-0000-4000-8000-000000000005'::uuid,140,'Juniper Medical Center','juniper-medical-center',
      'A major urban hospital and outpatient complex serving Juniper City, with emergency care, clinics, staff shifts, visitors, and the constant rhythm of a real working hospital.',
      'healthcare','venue','{"open":"00:00","close":"23:59"}'::jsonb,array['appointment','visit','work shift','healthcare']::text[],
      'Juniper Medical Center in Civic Commons: a major working urban hospital and outpatient campus with restrained brick and glass wings, a clearly signed emergency entrance, public clinic atrium, staff circulation, and realistic healthcare operations.',
      array['brick-and-glass hospital wings','covered emergency arrival','daylit outpatient atrium']::text[],array['warm brick','clear glass','pale acoustic panels','dark steel']::text[],array['focused','compassionate','continuously operational']::text[],
      array['quiet public announcements','rubber-soled footsteps across clinic floors','ambulance doors and traffic at the emergency approach']::text[],array['clearly separated emergency and public entrances','central outpatient atrium','staff bridges linking clinical wings']::text[],array['public outpatient entrance and atrium','controlled clinical wings','separate emergency arrival and service circulation']::text[],
      array['juniper-central-station','juniper-city-hall','common-market','halcyon-green','riverside']::text[],array['A visitor waits for news without knowing who else has arrived.','Two staff shifts overlap during an unusual city event.','A routine appointment changes the shape of someone''s week.']::text[]),
    ('2a000000-0000-4000-8000-000000000108'::uuid,'2a000000-0000-4000-8000-000000000005'::uuid,150,'Juniper City Hall','juniper-city-hall',
      'Juniper''s civic hall and public plaza, home to municipal offices, ceremonies, public meetings, permits, and seasonal civic events.',
      'civic','venue','{"open":"08:00","close":"18:00"}'::jsonb,array['civic errand','ceremony','public meeting','plaza event']::text[],
      'Juniper City Hall in Civic Commons: a dignified but accessible contemporary civic building of light stone, warm brick, and broad public windows facing a practical plaza used for ceremonies, meetings, permits, and seasonal events.',
      array['contemporary civic hall','broad public steps','transparent ground-floor public offices']::text[],array['light regional stone','warm brick','dark bronze','clear glass']::text[],array['civic','accessible','ceremonial when required']::text[],
      array['footsteps across the broad public steps','meeting-room voices behind glass','temporary event equipment moving across the plaza']::text[],array['broad steps doubling as public seating','a civic clock and Juniper seal rendered without real-world insignia','public plaza with seasonal utility connections']::text[],array['public plaza and broad steps','permit and service hall at ground level','meeting and ceremony rooms above']::text[],
      array['juniper-central-station','common-market','juniper-civic-arena','juniper-medical-center','riverside-landing']::text[],array['A routine permit reveals an unexpected shared address.','A public meeting draws people from every district.','A small plaza ceremony becomes personally consequential.']::text[])
  ) as seed(id,parent_id,sort_order,name,slug,description,category,location_type,hours,activities,visual_prompt,architecture,materials,atmosphere,sensory,signature_details,layout,nearby_slugs,story_seeds)
), prepared_places as(
  select seed.*,
    jsonb_build_object(
      'canonicalPrompt',visual_prompt,'indoorOutdoor',case when location_type='outdoor' then 'outdoor' when location_type in('residence','transit') then 'mixed' else 'indoor' end,
      'architecture',to_jsonb(architecture),'materials',to_jsonb(materials),
      'lighting',jsonb_build_array('believable natural daylight','warm practical occupied light','restrained Juniper street lighting after dark'),
      'atmosphere',to_jsonb(atmosphere),'visualAnchors',to_jsonb(signature_details),
      'avoid',jsonb_build_array('recognizable real-world branding','futuristic megacity styling','generic luxury showroom','empty unoccupied architecture'),
      'viewpoints',jsonb_build_array('arrival view with the property identity visible','human-height view from an appropriate public or shared space','threshold view connecting the place to its district')
    ) as visual_context,
    jsonb_build_object(
      'version',2,'authored',true,'summary',description,'atmosphere',to_jsonb(atmosphere),
      'sensoryDetails',to_jsonb(sensory),'signatureDetails',to_jsonb(signature_details),'layout',to_jsonb(layout),
      'crowdRhythm',jsonb_build_object(
        'morning','Morning activity follows the place''s actual purpose, opening hours, residents, guests, staff, and scheduled services.',
        'afternoon','Routine visits and practical work create the place''s clearest everyday rhythm.',
        'evening','The place shifts toward arrivals, departures, hospitality, events, or quieter residential use as appropriate.',
        'late_night','Only open services, registered guests, residents, staff, and established shared scenes should be assumed present.',
        'overnight','Privacy, security, and true twenty-four-hour operations govern access.'),
      'conversationHooks',jsonb_build_array('Why someone chose this exact place today.','What regular staff or residents notice about the current arrival.','How the place connects to the wider district without erasing travel time.'),
      'stableFacts',jsonb_build_array(name||' is in Juniper City.',description),
      'localEtiquette',jsonb_build_array('Public familiarity never grants access to guest rooms, homes, clinical areas, staff zones, platforms, or closed spaces.','Current hours, bookings, invitations, tickets, and scene state remain authoritative.'),
      'nearbyLocationSlugs',to_jsonb(nearby_slugs),
      'publicHistory',jsonb_build_array('The place reflects Juniper''s preference for adapting useful city fabric rather than creating a placeless attraction.','Its public reputation has grown from repeated everyday use rather than invented celebrity.'),
      'recurringPeople',jsonb_build_array(jsonb_build_object('label',name||' regulars','role','staff, residents, guests, commuters, patients, or visitors appropriate to this exact place','rhythm','They appear according to real access, schedules, and daypart rather than as permanent scenery.')),
      'activityNotes',(select jsonb_object_agg(activity,initcap(activity)||' must follow the place''s real access, hours, privacy, and current scene state.') from unnest(activities) activity),
      'accessNotes',jsonb_build_array('Use only public and legitimately shared areas unless a booking, invitation, role, or canonical scene grants more access.','Being nearby or familiar with the district does not place anyone inside automatically.'),
      'weatherNotes',jsonb_build_array('Weather changes outdoor approaches, courtyards, terraces, balconies, platforms, and river conditions in believable ways.'),
      'storySeeds',to_jsonb(story_seeds)
    ) as lore
  from place_seed seed
)
insert into public.together_locations as target(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,hours,
  possible_activities,metadata,location_type,sort_order,depth,canonical_visual_context,canonical_lore
)
select id,'10000000-0000-4000-8000-000000000001'::uuid,parent_id,name,slug,description,category,slug,hours,
  activities,jsonb_strip_nulls(jsonb_build_object(
    'tags',to_jsonb(activities),'photoStatus','district_fallback','directoryDetailMode','lazy','geographyVersion',2,'geographyRole','destination',
    'lodging',case when category='hotel' then true else null end,
    'lodgingType',case slug when 'alder-house' then 'creative-core boutique hotel' when 'northline-motor-lodge' then 'revived mid-century motor lodge' when 'rivermark-hotel' then 'contemporary riverfront hotel' else null end,
    'roomCount',case when slug='alder-house' then 54 else null end,
    'private',case when slug='riverhouse-apartments' then false else null end)),
  location_type,sort_order,1,visual_context,lore
from prepared_places
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,slug=excluded.slug,
  description=excluded.description,category=excluded.category,
  visual_asset_key=coalesce(target.visual_asset_key,excluded.visual_asset_key),hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=coalesce(target.metadata,'{}'::jsonb)||excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=1,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

-- Reparent in place. These updates deliberately do not touch any UUID referenced by
-- schedules, plans, dates, moments, media, events, or character state.
with placement(slug,parent_id,sort_order,location_type,depth) as(values
  ('juniper-cafe','11000000-0000-4000-8000-000000000023'::uuid,110,'venue',1),
  ('photography-studio','11000000-0000-4000-8000-000000000023'::uuid,120,'venue',1),
  ('glassline-gallery','11000000-0000-4000-8000-000000000023'::uuid,130,'venue',1),
  ('paper-trail','11000000-0000-4000-8000-000000000023'::uuid,140,'venue',1),
  ('velvet-hour','11000000-0000-4000-8000-000000000023'::uuid,150,'venue',1),
  ('northside-bar','2a000000-0000-4000-8000-000000000001'::uuid,110,'venue',1),
  ('static-house','2a000000-0000-4000-8000-000000000001'::uuid,120,'venue',1),
  ('lucky-note','2a000000-0000-4000-8000-000000000001'::uuid,130,'venue',1),
  ('lantern-dive','2a000000-0000-4000-8000-000000000001'::uuid,140,'venue',1),
  ('needles-and-notes','2a000000-0000-4000-8000-000000000001'::uuid,150,'venue',1),
  ('marquee-cinema','2a000000-0000-4000-8000-000000000002'::uuid,110,'venue',1),
  ('side-street-comedy','2a000000-0000-4000-8000-000000000002'::uuid,120,'venue',1),
  ('pixel-and-pint','2a000000-0000-4000-8000-000000000002'::uuid,130,'venue',1),
  ('skyline-rooftop','2a000000-0000-4000-8000-000000000002'::uuid,140,'venue',1),
  ('taqueria-lumen','2a000000-0000-4000-8000-000000000002'::uuid,150,'venue',1),
  ('halcyon-park','2a000000-0000-4000-8000-000000000003'::uuid,110,'outdoor',1),
  ('lark-botanical-garden','2a000000-0000-4000-8000-000000000003'::uuid,120,'outdoor',1),
  ('moss-and-crumb','2a000000-0000-4000-8000-000000000003'::uuid,130,'venue',1),
  ('meridian-fitness','2a000000-0000-4000-8000-000000000003'::uuid,140,'venue',1),
  ('ember-and-rye','2a000000-0000-4000-8000-000000000003'::uuid,150,'venue',1),
  ('riverwalk','2a000000-0000-4000-8000-000000000004'::uuid,110,'outdoor',1),
  ('sora-table','2a000000-0000-4000-8000-000000000004'::uuid,120,'venue',1),
  ('maya-apartment','2a000000-0000-4000-8000-000000000103'::uuid,110,'residence',2),
  ('common-market','2a000000-0000-4000-8000-000000000005'::uuid,110,'venue',1),
  ('juniper-civic-arena','2a000000-0000-4000-8000-000000000005'::uuid,120,'venue',1)
)
update public.together_locations location
set parent_location_id=placement.parent_id,sort_order=placement.sort_order,
    location_type=placement.location_type,depth=placement.depth,
    metadata=(coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object('geographyRole','destination','geographyVersion',2))
      ||case when location.slug='photography-studio' then '{"directoryVisibility":"public"}'::jsonb else '{}'::jsonb end,
    updated_at=now()
from placement
where location.world_id='10000000-0000-4000-8000-000000000001'::uuid
  and location.slug=placement.slug;

-- Later life-engine migrations added schedule, occupation, and private-home anchors
-- that are not part of the 33-place public geography brief. Preserve every UUID and
-- historical reference, give each a real district, and keep these supporting records
-- out of the primary place directory. Juniper General remains the authored clinical
-- work anchor nested inside the broader Juniper Medical Center campus.
with supporting_placement(slug,parent_id,sort_order,depth) as(values
  ('chloe-loft','11000000-0000-4000-8000-000000000023'::uuid,210,1),
  ('chloe-design-studio','11000000-0000-4000-8000-000000000023'::uuid,220,1),
  ('juniper-general-hospital','2a000000-0000-4000-8000-000000000107'::uuid,110,2),
  ('alder-elementary-school','2a000000-0000-4000-8000-000000000005'::uuid,210,1),
  ('mercer-row-law-offices','11000000-0000-4000-8000-000000000023'::uuid,230,1),
  ('alder-central-precinct','2a000000-0000-4000-8000-000000000005'::uuid,220,1),
  ('juniper-firehouse-14','2a000000-0000-4000-8000-000000000005'::uuid,230,1),
  ('forgeworks-design-lab','11000000-0000-4000-8000-000000000023'::uuid,240,1),
  ('juniper-college','2a000000-0000-4000-8000-000000000005'::uuid,240,1),
  ('summit-climbing-hall','2a000000-0000-4000-8000-000000000003'::uuid,210,1),
  ('alder-lofts','11000000-0000-4000-8000-000000000023'::uuid,250,1),
  ('riverline-apartments','2a000000-0000-4000-8000-000000000004'::uuid,210,1),
  ('eastgate-flats','2a000000-0000-4000-8000-000000000005'::uuid,250,1)
)
update public.together_locations location
set parent_location_id=supporting_placement.parent_id,sort_order=supporting_placement.sort_order,
    depth=supporting_placement.depth,
    metadata=coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
      'geographyRole','supporting','geographyVersion',2,'directoryVisibility','private'
    ),updated_at=now()
from supporting_placement
where location.world_id='10000000-0000-4000-8000-000000000001'::uuid
  and location.slug=supporting_placement.slug;

-- Preserve existing valid nearby lore in its current order, then append authored
-- cross-district additions. Invalid legacy references are removed rather than leaked.
with additions(slug,nearby_slugs) as(values
  ('alder-district',array['northside','riverside','marquee-quarter','juniper-cafe','glassline-gallery','alder-house']::text[]),
  ('northside',array['alder-district','marquee-quarter','northside-bar','static-house','needles-and-notes','northline-motor-lodge']::text[]),
  ('marquee-quarter',array['alder-district','northside','civic-commons','marquee-cinema','skyline-rooftop']::text[]),
  ('halcyon-green',array['riverside','civic-commons','halcyon-park','lark-botanical-garden','ember-and-rye']::text[]),
  ('riverside',array['alder-district','halcyon-green','civic-commons','riverwalk','riverside-landing','rivermark-hotel']::text[]),
  ('civic-commons',array['marquee-quarter','riverside','halcyon-green','juniper-central-station','juniper-city-hall','juniper-civic-arena']::text[]),
  ('juniper-cafe',array['paper-trail','photography-studio','glassline-gallery','alder-house','riverwalk']::text[]),
  ('photography-studio',array['juniper-cafe','glassline-gallery','alder-house','riverwalk']::text[]),
  ('glassline-gallery',array['photography-studio','paper-trail','velvet-hour','alder-house','marquee-quarter']::text[]),
  ('paper-trail',array['juniper-cafe','glassline-gallery','velvet-hour','alder-house']::text[]),
  ('velvet-hour',array['paper-trail','glassline-gallery','alder-house','sora-table']::text[]),
  ('alder-house',array['juniper-cafe','glassline-gallery','paper-trail','photography-studio','velvet-hour']::text[]),
  ('northside-bar',array['static-house','lucky-note','lantern-dive','needles-and-notes','northline-motor-lodge']::text[]),
  ('static-house',array['northside-bar','needles-and-notes','lucky-note','northline-motor-lodge','marquee-quarter']::text[]),
  ('lucky-note',array['static-house','northside-bar','lantern-dive','northline-motor-lodge']::text[]),
  ('lantern-dive',array['northside-bar','lucky-note','needles-and-notes','taqueria-lumen']::text[]),
  ('needles-and-notes',array['static-house','northside-bar','northline-motor-lodge','juniper-cafe']::text[]),
  ('northline-motor-lodge',array['static-house','northside-bar','needles-and-notes','lantern-dive','alder-district']::text[]),
  ('marquee-cinema',array['side-street-comedy','pixel-and-pint','skyline-rooftop','taqueria-lumen','juniper-civic-arena']::text[]),
  ('side-street-comedy',array['marquee-cinema','pixel-and-pint','taqueria-lumen','juniper-civic-arena']::text[]),
  ('pixel-and-pint',array['marquee-cinema','side-street-comedy','taqueria-lumen','juniper-civic-arena']::text[]),
  ('skyline-rooftop',array['marquee-cinema','pixel-and-pint','juniper-civic-arena','alder-district']::text[]),
  ('taqueria-lumen',array['pixel-and-pint','side-street-comedy','lantern-dive','common-market']::text[]),
  ('halcyon-park',array['lark-botanical-garden','moss-and-crumb','meridian-fitness','riverwalk','civic-commons']::text[]),
  ('lark-botanical-garden',array['halcyon-park','moss-and-crumb','riverwalk','riverside-landing']::text[]),
  ('moss-and-crumb',array['halcyon-park','lark-botanical-garden','ember-and-rye','riverwalk']::text[]),
  ('meridian-fitness',array['halcyon-park','ember-and-rye','common-market','juniper-medical-center']::text[]),
  ('ember-and-rye',array['moss-and-crumb','halcyon-park','meridian-fitness','common-market']::text[]),
  ('riverwalk',array['riverhouse-apartments','riverside-landing','sora-table','rivermark-hotel','halcyon-park','juniper-cafe']::text[]),
  ('sora-table',array['riverwalk','riverside-landing','rivermark-hotel','velvet-hour']::text[]),
  ('riverhouse-apartments',array['riverwalk','riverside-landing','sora-table','rivermark-hotel']::text[]),
  ('maya-apartment',array['riverhouse-apartments','riverwalk','riverside-landing','sora-table','common-market']::text[]),
  ('riverside-landing',array['riverwalk','riverhouse-apartments','rivermark-hotel','sora-table','civic-commons']::text[]),
  ('rivermark-hotel',array['riverwalk','riverside-landing','sora-table','riverhouse-apartments','civic-commons']::text[]),
  ('common-market',array['juniper-central-station','juniper-city-hall','juniper-civic-arena','meridian-fitness','taqueria-lumen']::text[]),
  ('juniper-civic-arena',array['marquee-cinema','pixel-and-pint','juniper-central-station','juniper-city-hall','common-market']::text[]),
  ('juniper-central-station',array['juniper-city-hall','common-market','juniper-medical-center','juniper-civic-arena','marquee-quarter']::text[]),
  ('juniper-medical-center',array['juniper-central-station','juniper-city-hall','common-market','halcyon-green','riverside']::text[]),
  ('juniper-city-hall',array['juniper-central-station','common-market','juniper-civic-arena','juniper-medical-center','riverside-landing']::text[])
), merged as(
  select location.id,
    coalesce((
      select jsonb_agg(candidate.slug order by candidate.first_position)
      from(
        select proposed.slug,min(proposed.position) as first_position
        from(
          select existing.slug,existing.ordinality::integer as position
          from jsonb_array_elements_text(coalesce(location.canonical_lore->'nearbyLocationSlugs','[]'::jsonb)) with ordinality existing(slug,ordinality)
          union all
          select added.slug,100+added.ordinality::integer
          from unnest(additions.nearby_slugs) with ordinality added(slug,ordinality)
        ) proposed
        join public.together_locations valid on valid.world_id=location.world_id and valid.slug=proposed.slug and valid.id<>location.id
        group by proposed.slug
      ) candidate
    ),'[]'::jsonb) as nearby
  from additions
  join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000001'::uuid and location.slug=additions.slug
)
update public.together_locations location
set canonical_lore=jsonb_set(coalesce(location.canonical_lore,'{}'::jsonb),'{nearbyLocationSlugs}',merged.nearby,true),updated_at=now()
from merged where location.id=merged.id;

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'geographyVersion',2,
  'districtCount',6,
  'districtSlugs',jsonb_build_array('alder-district','northside','marquee-quarter','halcyon-green','riverside','civic-commons'),
  'locationDestinationCount',33
),updated_at=now()
where id='10000000-0000-4000-8000-000000000001'::uuid;

-- Production guardrails: fail the migration rather than publish a partial city map.
do $$
declare root_count integer; location_count integer; destination_count integer; supporting_count integer;
begin
  select count(*) into root_count from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null and location_type='district';
  select count(*) into location_count from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid;
  select count(*) into destination_count from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid and metadata->>'geographyRole'='destination';
  select count(*) into supporting_count from public.together_locations
  where world_id='10000000-0000-4000-8000-000000000001'::uuid and metadata->>'geographyRole'='supporting';
  if root_count<>6 then raise exception 'Juniper geography v2 expected 6 root districts, found %',root_count;end if;
  if location_count<>52 then raise exception 'Juniper geography v2 expected 52 preserved total location rows, found %',location_count;end if;
  if destination_count<>33 then raise exception 'Juniper geography v2 expected 33 canonical destinations, found %',destination_count;end if;
  if supporting_count<>13 then raise exception 'Juniper geography v2 expected 13 preserved supporting records, found %',supporting_count;end if;
  if exists(select 1 from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null and location_type<>'district') then
    raise exception 'Juniper geography v2 left a non-district at world root';
  end if;
  if exists(
    select 1 from public.together_locations child
    join public.together_locations parent on parent.id=child.parent_location_id
    where child.world_id='10000000-0000-4000-8000-000000000001'::uuid and parent.world_id<>child.world_id
  ) then raise exception 'Juniper geography v2 crosses world boundaries';end if;
  if exists(
    with recursive hierarchy as(
      select id,parent_location_id,array[id] path,false cycle from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid
      union all
      select hierarchy.id,parent.parent_location_id,hierarchy.path||parent.id,parent.id=any(hierarchy.path)
      from hierarchy join public.together_locations parent on parent.id=hierarchy.parent_location_id where not hierarchy.cycle
    ) select 1 from hierarchy where cycle
  ) then raise exception 'Juniper geography v2 contains a hierarchy cycle';end if;
  if exists(
    with recursive expected as(
      select id,0::smallint expected_depth from public.together_locations where world_id='10000000-0000-4000-8000-000000000001'::uuid and parent_location_id is null
      union all
      select child.id,(expected.expected_depth+1)::smallint from expected join public.together_locations child on child.parent_location_id=expected.id
    ) select 1 from public.together_locations location left join expected on expected.id=location.id
      where location.world_id='10000000-0000-4000-8000-000000000001'::uuid and expected.expected_depth is distinct from location.depth
  ) then raise exception 'Juniper geography v2 contains incorrect depth values';end if;
  if exists(
    select 1 from public.together_locations location
    cross join lateral jsonb_array_elements_text(coalesce(location.canonical_lore->'nearbyLocationSlugs','[]'::jsonb)) nearby(slug)
    left join public.together_locations target on target.world_id=location.world_id and target.slug=nearby.slug
    where location.world_id='10000000-0000-4000-8000-000000000001'::uuid and target.id is null
  ) then raise exception 'Juniper geography v2 contains an unresolved nearby location slug';end if;
  if exists(
    select 1 from(values
      ('11000000-0000-4000-8000-000000000001'::uuid,'juniper-cafe'),('11000000-0000-4000-8000-000000000002'::uuid,'maya-apartment'),
      ('11000000-0000-4000-8000-000000000003'::uuid,'skyline-rooftop'),('11000000-0000-4000-8000-000000000004'::uuid,'northside-bar'),
      ('11000000-0000-4000-8000-000000000005'::uuid,'riverwalk'),('11000000-0000-4000-8000-000000000006'::uuid,'photography-studio'),
      ('11000000-0000-4000-8000-000000000007'::uuid,'ember-and-rye'),('11000000-0000-4000-8000-000000000008'::uuid,'sora-table'),
      ('11000000-0000-4000-8000-000000000009'::uuid,'taqueria-lumen'),('11000000-0000-4000-8000-000000000010'::uuid,'velvet-hour'),
      ('11000000-0000-4000-8000-000000000011'::uuid,'lantern-dive'),('11000000-0000-4000-8000-000000000012'::uuid,'moss-and-crumb'),
      ('11000000-0000-4000-8000-000000000013'::uuid,'marquee-cinema'),('11000000-0000-4000-8000-000000000014'::uuid,'static-house'),
      ('11000000-0000-4000-8000-000000000015'::uuid,'lucky-note'),('11000000-0000-4000-8000-000000000016'::uuid,'side-street-comedy'),
      ('11000000-0000-4000-8000-000000000017'::uuid,'pixel-and-pint'),('11000000-0000-4000-8000-000000000018'::uuid,'glassline-gallery'),
      ('11000000-0000-4000-8000-000000000019'::uuid,'paper-trail'),('11000000-0000-4000-8000-000000000020'::uuid,'needles-and-notes'),
      ('11000000-0000-4000-8000-000000000021'::uuid,'meridian-fitness'),('11000000-0000-4000-8000-000000000022'::uuid,'common-market'),
      ('11000000-0000-4000-8000-000000000023'::uuid,'alder-district'),('11000000-0000-4000-8000-000000000024'::uuid,'halcyon-park'),
      ('11000000-0000-4000-8000-000000000025'::uuid,'lark-botanical-garden'),
      ('11000000-0000-4000-8000-000000000026'::uuid,'chloe-loft'),('11000000-0000-4000-8000-000000000027'::uuid,'chloe-design-studio'),
      ('11000000-0000-4000-8000-000000000028'::uuid,'juniper-civic-arena'),('11000000-0000-4000-8000-000000000029'::uuid,'juniper-general-hospital'),
      ('11000000-0000-4000-8000-000000000030'::uuid,'alder-elementary-school'),('11000000-0000-4000-8000-000000000031'::uuid,'mercer-row-law-offices'),
      ('11000000-0000-4000-8000-000000000032'::uuid,'alder-central-precinct'),('11000000-0000-4000-8000-000000000033'::uuid,'juniper-firehouse-14'),
      ('11000000-0000-4000-8000-000000000034'::uuid,'forgeworks-design-lab'),('11000000-0000-4000-8000-000000000035'::uuid,'juniper-college'),
      ('11000000-0000-4000-8000-000000000036'::uuid,'summit-climbing-hall'),('11000000-0000-4000-8000-000000000037'::uuid,'alder-lofts'),
      ('11000000-0000-4000-8000-000000000038'::uuid,'riverline-apartments'),('11000000-0000-4000-8000-000000000039'::uuid,'eastgate-flats')
    ) expected(id,slug)
    left join public.together_locations actual on actual.id=expected.id and actual.slug=expected.slug and actual.world_id='10000000-0000-4000-8000-000000000001'::uuid
    where actual.id is null
  ) then raise exception 'Juniper geography v2 changed or lost an existing canonical UUID/slug';end if;
  if (select default_arrival_location_id from public.together_worlds where id='10000000-0000-4000-8000-000000000001'::uuid)<>'11000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Juniper geography v2 must retain Juniper Cafe as the default arrival';
  end if;
end $$;

comment on column public.together_locations.parent_location_id is
  'Canonical physical hierarchy: world -> district -> location -> optional sublocation. Nearby lore is adjacency, not parentage.';

commit;
