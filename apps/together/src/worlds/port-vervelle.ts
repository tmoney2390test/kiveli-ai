import type { Location, LocationLore, LocationType, World } from '../types';
import{locationSeedLore}from'./location-bible';

export const PORT_VERVELLE_WORLD_ID='10000000-0000-4000-8000-000000000008';
export const PORT_VERVELLE_ARRIVAL_ID='27000000-0000-4000-8000-000000000010';
export const PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS=[
  'atelier-amelie','bellavista','bellavista-apartments','bellavista-fitness-club','blue-lantern','cafe-marelle',
  'casa-del-mare','circolo-nove','farmacia-vervelle','fiore-and-fig','forno-bellini','harbor-steps','la-sirena',
  'libreria-vervelle','lido-vervelle','luna-terrace','maison-rouge','marina-solana','osteria-rosa',
  'palazzo-civico','piazza-aurelia','porto-marina','porto-vecchio','solana-beach-rentals','spiaggia-solana',
  'velours','vervelle-fish-market','vervelle-sailing-house','villa-mirabelle',
] as const;

const photographedLocationSlugs=new Set<string>(PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS);

export const portVervelleWorld:World={
  id:PORT_VERVELLE_WORLD_ID,
  slug:'port-vervelle',
  name:'Port Vervelle',
  description:'A slow, sun-warmed coastal town of working docks, steep lanes, old plazas, beaches, and familiar faces.',
  hero_asset_key:'port-vervelle-hero',
  access_type:'subscription',
  entitlement_key:'worlds.standard',
  timezone:'Europe/Rome',
  sort_order:70,
  featured:true,
  published:true,
  visual_context:{
    setting:'compact fictional Mediterranean coastal town built vertically around a working harbor',
    geography:['blue-green harbor','steep coastal hillside','rocky coves','hazy mountain backdrop'],
    architecture:['warm pale stone','sun-faded pastel stucco','terracotta roofs','wrought-iron balconies'],
    climate:'warm Mediterranean coast',
    visualStyle:['grounded romantic realism','golden late-afternoon light','comfortably lived-in streets'],
    palette:['warm limestone','terracotta','sea blue','sun-faded peach','bougainvillea pink'],
    recurringElements:['small fishing boats','fabric awnings','stone stairs','shuttered windows','climbing flowers'],
    avoid:['recognizable real-world landmarks','mega-marinas','cruise ships','generic luxury resort','empty spotless streets'],
  },
  default_arrival_location_id:PORT_VERVELLE_ARRIVAL_ID,
  metadata:{
    releaseWave:7,
    early_access:true,
    photoStatus:'partial',
    mappedLocationPhotoCount:29,
    residentCompanionCount:44,
    residentPortraitStatus:'mixed_ready_and_slots',
    residentRosterVersion:2,
    maleResidentCompanionCount:12,
    maleResidentRosterStatus:'ready',
    residentScheduleStatus:'life_v2_plus_male_authored_v1',
    socialGraphStatus:'expanded_interconnected_v2',
    recurringEventCount:7,
    maleStoryArcCount:12,
    publicPlaceCount:45,
    locationCount:51,
    lodgingCount:5,
    lodgingSlugs:['locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste'],
    relationshipFantasy:'Let repeated, unhurried encounters turn a small harbor town into somewhere that feels shared.',
    nativeDateSeeds:['Coffee by the Harbor','Sunset at Belvedere Garden','Dinner at Luna Terrace','Sail Past the Headland'],
    storySeeds:['One More Afternoon','The Harbor Festival','A Table Everyone Knows','Wind off the Capo'],
    populationArchetypes:['harbor worker','chef','artist','clinician','hotelier','musician'],
  },
  world_role:'home',
  social_rhythm:'relaxed',
  dominant_dayparts:['morning','evening','late_night'],
  relationship_themes:['proximity','slow romance','familiar routines','escape','community'],
  activity_families:['harbor life','cafes','markets','beaches','sailing','dining','arts','nightlife','coastal walks'],
  mobility_style:'walkable',
  weather_profile:{climate:'Mediterranean coastal',states:['sunny','hot','breezy','rain','coastal_storm'],outdoorBias:.82},
};

type SeedInput={
  index:number;
  parent?:number;
  name:string;
  slug:string;
  description:string;
  category:string;
  type:LocationType;
  activities:string[];
  district?:string;
  hours?:Record<string,unknown>;
  sortOrder?:number;
  metadata?:Record<string,unknown>;
  lore?:Partial<LocationLore>;
};

const locationId=(index:number)=>`27000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const avoid=['recognizable real-world landmarks','mega-resort styling','cruise ships','futuristic architecture','empty theme-park streets'];

function seed(input:SeedInput):Location{
  const district=input.district??input.name;
  const districtNode=input.type==='district';
  const baseLore=locationSeedLore({world:'Port Vervelle',district,name:input.name,description:input.description,category:input.category,type:input.type,activities:input.activities,atmosphere:['sun-warmed','coastal','familiar'],sensory:['salt air and warm stone','fabric awnings and harbor sound'],weather:['Wind changes exposed routes and waterfront plans quickly.','Midday heat moves longer conversations beneath shade.']});
  return{
    id:locationId(input.index),
    world_id:PORT_VERVELLE_WORLD_ID,
    parent_location_id:input.parent?locationId(input.parent):null,
    name:input.name,
    slug:input.slug,
    location_type:input.type,
    description:input.description,
    category:input.category,
    hours:input.hours,
    possible_activities:input.activities,
    visual_asset_key:photographedLocationSlugs.has(input.slug)?input.slug:null,
    canonical_visual_context:{
      canonicalPrompt:`${input.name}, ${district}, Port Vervelle. ${input.description}`,
      indoorOutdoor:['outdoor','landmark','transit','district'].includes(input.type)?'outdoor':'mixed',
      visualAnchors:[input.name,district,'Port Vervelle'],
      avoid,
    },
    canonical_lore:{...baseLore,...input.lore},
    sort_order:input.sortOrder??input.index*10,
    metadata:{tags:input.activities,district:districtNode?true:district,photoStatus:photographedLocationSlugs.has(input.slug)?'ready':'pending',...input.metadata},
  };
}

export const portVervelleLocations:Location[]=[
  seed({index:1,name:'Porto Vecchio',slug:'porto-vecchio',description:'The old working harbor and Port Vervelle’s natural arrival point, busiest from before sunrise through the evening return of the boats.',category:'district',type:'district',activities:['harbor walk','coffee','fishing','local life']}),
  seed({index:2,name:'Piazza Aurelia',slug:'piazza-aurelia',description:'The historic pedestrian center where errands, fountain meetings, markets, music, festivals, and town politics repeatedly cross.',category:'district',type:'district',activities:['markets','festivals','street music','dates','people watching']}),
  seed({index:3,name:'Marina Solana',slug:'marina-solana',description:'A beachside district that moves from sun and swimming into terraces, music, dancing, and Port Vervelle’s latest nights.',category:'district',type:'district',activities:['beach','swimming','dining','music','nightlife']}),
  seed({index:4,name:'Bellavista',slug:'bellavista',description:'A quiet hillside neighborhood of homes, studios, gardens, steep lanes, and balconies looking back toward the harbor.',category:'district',type:'district',activities:['views','gardens','fitness','creative work','quiet walks']}),
  seed({index:5,name:'Mercato Vecchio',slug:'mercato-vecchio',description:'The everyday working town: produce stalls, practical errands, clinics, workshops, groceries, and high-frequency morning encounters.',category:'district',type:'district',activities:['market','shopping','errands','local commerce','morning coffee']}),
  seed({index:6,name:'Capo Vervelle',slug:'capo-vervelle',description:'The cliffs and countryside beyond town, where a vineyard, hotel, cove, lighthouse, and olive groves make the day feel farther away.',category:'district',type:'district',activities:['vineyard','cliff walk','swimming','spa','sunset']}),

  seed({index:7,parent:1,district:'Porto Vecchio',name:'Café Marelle',slug:'cafe-marelle',description:'A waterfront café for strong coffee, casual dates, breakfast, and watching the harbor wake up.',category:'cafe',type:'venue',activities:['coffee','breakfast','casual date','people watching'],hours:{open:'06:30',close:'20:00'}}),
  seed({index:8,parent:1,district:'Porto Vecchio',name:'Vervelle Fish Market',slug:'vervelle-fish-market',description:'A salt-bright morning market linking fishing crews, cooks, restaurant owners, and half the town’s best gossip.',category:'market',type:'venue',activities:['market','seafood','shopping','people watching'],hours:{open:'05:00',close:'13:00'}}),
  seed({index:9,parent:1,district:'Porto Vecchio',name:'The Blue Lantern',slug:'blue-lantern',description:'A sailors’ tavern with worn tables, acoustic music, easy gossip, and post-shift drinks near the water.',category:'nightlife',type:'venue',activities:['drinks','live music','conversation','late dinner'],hours:{open:'16:00',close:'01:00'}}),
  seed({index:10,parent:1,district:'Porto Vecchio',name:'Porto Marina',slug:'porto-marina',description:'The working docks for arrivals, departures, fishing boats, sailing charters, and unhurried waterfront walks.',category:'marina',type:'landmark',activities:['sailing','boat charter','harbor walk','fishing'],hours:{open:'05:00',close:'23:00'}}),
  seed({index:11,parent:1,district:'Porto Vecchio',name:'Vervelle Sailing House',slug:'vervelle-sailing-house',description:'A practical harbor school for lessons, coastal tours, charter planning, and the town’s sailing community.',category:'entertainment',type:'venue',activities:['sailing lessons','boat tour','charter planning'],hours:{open:'08:00',close:'19:00'}}),
  seed({index:12,parent:1,district:'Porto Vecchio',name:'La Casa del Mare',slug:'casa-del-mare',description:'A family seafood restaurant known for long harbor dinners, daily catches, and tables that rarely turn quickly.',category:'restaurant',type:'venue',activities:['seafood dinner','wine','date night','family meal'],hours:{open:'12:00',close:'23:00'}}),
  seed({index:49,parent:1,district:'Porto Vecchio',name:'Sotto Sale',slug:'sotto-sale',description:'A chef-owned waterfront restaurant beneath the harbor wall, with a small open kitchen, closely spaced tables, and a nightly menu built around the market catch.',category:'restaurant',type:'venue',activities:['waterfront lunch','intimate dinner','wine','open kitchen','market menu'],hours:{open:'11:30',close:'23:30'},sortOrder:125,metadata:{source:'port_vervelle_male_expansion_v1'},lore:{
    atmosphere:['warm and intimate','busy without feeling rushed','personally run rather than corporate'],
    sensoryDetails:['fish and citrus from the open kitchen','low conversation against old stone','harbor air through open windows'],
    signatureDetails:['a menu rewritten after the fish market','one open pass facing the room','tables close enough for regulars to recognize one another'],
    layout:['an entrance beneath the harbor wall','a compact dining room','an open kitchen and pass','low waterfront windows'],
    stableFacts:['Sotto Sale is in Porto Vecchio.','The restaurant is intentionally small.','Its menu follows the market catch.'],
    localEtiquette:['Dinner service is genuinely busy.','The kitchen is not freely accessible during service.'],
  }}),
  seed({index:13,parent:1,district:'Porto Vecchio',name:'Harbor Steps',slug:'harbor-steps',description:'Broad stone steps where teenagers, musicians, couples, and off-duty workers linger beside the evening harbor.',category:'outdoor',type:'landmark',activities:['sit by the water','street music','sunset','conversation']}),
  seed({index:50,parent:1,district:'Porto Vecchio',name:'Museo Marittimo Vervelle',slug:'museo-marittimo-vervelle',description:'A compact maritime museum inside the restored customs house, holding harbor records, recovered ceramics, old charts, diving finds, and a working research room overlooking Porto Marina.',category:'museum',type:'venue',activities:['museum visit','maritime history','archive research','artifact study','harbor exhibition'],hours:{open:'09:00',close:'18:00'},sortOrder:140,metadata:{source:'port_vervelle_male_expansion_v1'},lore:{
    atmosphere:['quietly scholarly','salt-worn','locally specific'],
    sensoryDetails:['cool stone after the harbor heat','paper and conservation wax','rigging sounds through a cracked research-room window'],
    signatureDetails:['annotated harbor charts','ceramics recovered from local waters','a research table that is rarely clear'],
    layout:['a customs-house entrance gallery','two compact public galleries','an archive and conservation room','a harbor-facing research room'],
    stableFacts:['The museum occupies the restored customs house.','Its collection focuses on Port Vervelle and nearby waters.','The research room is not automatically public.'],
    localEtiquette:['Ask before handling study material.','Uncatalogued finds remain private until verified.'],
  }}),
  seed({index:45,parent:1,district:'Porto Vecchio',name:'Locanda Vela',slug:'locanda-vela',description:'A weathered sixteen-room harbor inn on the narrow street behind Porto Marina, intimate, genuinely local, and often the first place newcomers sleep in Port Vervelle.',category:'hotel',type:'residence',activities:['stay','breakfast','terrace','harbor arrival','secret meeting'],hours:{open:'00:00',close:'23:59'},sortOrder:135,metadata:{lodging:true,lodgingType:'historic harbor inn',roomCount:16,vibe:'weathered, intimate, genuinely local',bestFor:['arrivals','short stays','sailors','visiting artists','secret meetings']},lore:{
    atmosphere:['weathered and intimate','unpolished but deeply welcoming','alive with harbor arrivals and temporary goodbyes'],
    sensoryDetails:['old timber warmed by the afternoon sun','coffee and toasted bread from the tiny breakfast room','salt air climbing the lane behind Porto Marina','soft terrace conversation above the harbor roofs'],
    signatureDetails:['sloped floors that make every room feel slightly individual','mismatched doors retained through generations of repairs','a tiny breakfast room where strangers become familiar','a modest terrace overlooking the harbor roofs'],
    layout:['a narrow entrance just behind Porto Marina','sixteen guest rooms arranged across uneven old floors','a tiny breakfast room beside the family service area','an upper terrace facing the harbor roofs'],
    conversationHooks:['Who has just arrived in town and why.','Which former guest left a story behind.','Whether a short stay is quietly becoming something longer.'],
    stableFacts:['Locanda Vela stands on the narrow street behind Porto Marina.','It has sixteen rooms.','The inn began as Emilia Varo’s late-nineteenth-century boarding house above her family chandlery.','It remains Port Vervelle’s narrative landing point for people between chapters.'],
    publicHistory:['Emilia Varo founded the building as a late-nineteenth-century boarding house above her family chandlery.','The boarding house gradually became a local inn without losing its uneven floors, mismatched doors, or family scale.'],
    recurringPeople:[{label:'the Vela staff',role:'keepers of the old inn and its arriving guests',rhythm:'They remember who came for one night and who quietly extended their stay.'},{label:'harbor arrivals',role:'sailors, artists, and travelers between chapters',rhythm:'They pass through breakfast and the terrace with news from beyond town.'}],
    storySeeds:['A guest who planned to stay one night keeps finding reasons not to leave.','An old name in the register connects two people who thought they were strangers.','A secret meeting on the terrace is overheard only in fragments.'],
  }}),

  seed({index:14,parent:2,district:'Piazza Aurelia',name:'Forno Bellini',slug:'forno-bellini',description:'A neighborhood bakery whose bread, pastry, and morning queue make it one of the town’s most reliable encounter points.',category:'bakery',type:'venue',activities:['coffee','pastry','breakfast','shopping'],hours:{open:'06:00',close:'18:00'}}),
  seed({index:15,parent:2,district:'Piazza Aurelia',name:'Libreria Vervelle',slug:'libreria-vervelle',description:'A bookshop with a shaded reading courtyard for writers, browsers, and quiet daytime conversations.',category:'bookstore',type:'venue',activities:['books','reading','coffee','quiet conversation'],hours:{open:'09:00',close:'19:00'}}),
  seed({index:16,parent:2,district:'Piazza Aurelia',name:'Osteria Rosa',slug:'osteria-rosa',description:'A warm old-town restaurant for wine, celebrations, recurring neighborhood tables, and dinners that stretch late.',category:'restaurant',type:'venue',activities:['dinner','wine','celebration','date night'],hours:{open:'12:00',close:'23:30'}}),
  seed({index:17,parent:2,district:'Piazza Aurelia',name:'Atelier Amélie',slug:'atelier-amelie',description:'A tailoring and fashion studio tied into fittings, weddings, performances, and every formal event in town.',category:'studio',type:'venue',activities:['fashion','tailoring','shopping','creative work'],hours:{open:'09:30',close:'18:30'}}),
  seed({index:18,parent:2,district:'Piazza Aurelia',name:'Farmacia Vervelle',slug:'farmacia-vervelle',description:'The old-town pharmacy: part health errand, part neighborhood information network, and always more social than intended.',category:'pharmacy',type:'venue',activities:['health errand','shopping','local conversation'],hours:{open:'08:00',close:'20:00'}}),
  seed({index:19,parent:2,district:'Piazza Aurelia',name:'Palazzo Civico',slug:'palazzo-civico',description:'Port Vervelle’s civic hall for weddings, permits, public meetings, planning, and the quiet machinery of small-town politics.',category:'public service',type:'landmark',activities:['wedding','public meeting','local history','civic errand'],hours:{open:'08:30',close:'17:00'}}),
  seed({index:46,parent:2,district:'Piazza Aurelia',name:'Palazzo Sereno',slug:'palazzo-sereno',description:'A discreet twenty-four-room historic boutique hotel on a quiet lane off Piazza Aurelia, with old-world rooms for important visits, celebrations, and romances kept out of sight.',category:'hotel',type:'residence',activities:['stay','breakfast','wedding','anniversary','courtyard'],hours:{open:'00:00',close:'23:59'},sortOrder:195,metadata:{lodging:true,lodgingType:'historic boutique hotel',roomCount:24,vibe:'romantic, old-world, discreet',bestFor:['weddings','anniversaries','visiting families','affluent travelers','clandestine romances']},lore:{
    atmosphere:['romantic and old-world','quietly affluent','defined by practiced discretion'],
    sensoryDetails:['lemon leaves and pale stone in the courtyard','muted footsteps along restored corridors','breakfast china in the former ballroom','evening piano drifting from the music salon'],
    signatureDetails:['a former ballroom now used for breakfast','a music salon converted into an intimate lounge','one old lemon tree holding the center of the courtyard','staff who notice everything and repeat almost nothing'],
    layout:['a discreet entrance on a quiet lane off Piazza Aurelia','twenty-four guest rooms inside the restored Sereno residence','a former ballroom opening for breakfast','a music salon lounge and enclosed lemon courtyard'],
    conversationHooks:['Why someone chose the most discreet hotel in town.','Which important local moment is being prepared upstairs.','What the staff know but will not volunteer.'],
    stableFacts:['Palazzo Sereno stands on a quiet lane off Piazza Aurelia.','It has twenty-four rooms.','It was the town residence of the Sereno shipping family before its restoration as a hotel.','The staff are locally known for discretion.'],
    publicHistory:['The Sereno shipping family built the palazzo as its town residence.','Its restoration preserved the ballroom, music salon, and courtyard while turning the private residence into a boutique hotel.','Weddings, reunions, and consequential visits have made it part of Port Vervelle’s private civic history.'],
    recurringPeople:[{label:'the Sereno staff',role:'discreet hosts and custodians of the restored palazzo',rhythm:'They guide important guests through the hotel without making their business public.'},{label:'occasion guests',role:'wedding parties, visiting families, and affluent travelers',rhythm:'They gather in the ballroom and courtyard around events the Piazza will soon discuss.'}],
    storySeeds:['Two guests discover their reservations were arranged by the same person.','A wedding weekend revives an old Sereno family disagreement.','Someone checks in under a familiar but incomplete name.'],
  }}),

  seed({index:20,parent:3,district:'Marina Solana',name:'Spiaggia Solana',slug:'spiaggia-solana',description:'The main beach for swimming, volleyball, picnics, flirting, and chance encounters that last into sunset.',category:'outdoor',type:'outdoor',activities:['swimming','beach','volleyball','picnic','sunset']}),
  seed({index:21,parent:3,district:'Marina Solana',name:'Lido Vervelle',slug:'lido-vervelle',description:'A lived-in beach club with cabanas, food, music, locals on shift, and visitors trying to stay all afternoon.',category:'restaurant',type:'venue',activities:['beach club','lunch','music','swimming'],hours:{open:'09:00',close:'23:00'}}),
  seed({index:22,parent:3,district:'Marina Solana',name:'La Sirena',slug:'la-sirena',description:'The town’s largest nightclub for dancing, DJs, promotion nights, and choices made after midnight.',category:'nightlife',type:'venue',activities:['dancing','dj','drinks','nightlife'],hours:{open:'22:00',close:'04:00'}}),
  seed({index:23,parent:3,district:'Marina Solana',name:'Velours',slug:'velours',description:'An intimate cocktail lounge where live singers, piano, and low conversation make the room feel smaller than it is.',category:'lounge',type:'venue',activities:['cocktails','live music','piano','date night'],hours:{open:'18:00',close:'02:00'}}),
  seed({index:24,parent:3,district:'Marina Solana',name:'Maison Rouge',slug:'maison-rouge',description:'A polished cabaret and jazz room for performances, cocktails, late dinners, and private events.',category:'entertainment',type:'venue',activities:['cabaret','jazz','cocktails','live performance'],hours:{open:'19:00',close:'02:00'}}),
  seed({index:25,parent:3,district:'Marina Solana',name:'Solana Beach Rentals',slug:'solana-beach-rentals',description:'A beachside rental shack for boards, kayaks, lessons, lifeguard shifts, and practical advice about the water.',category:'outdoor',type:'venue',activities:['kayak','paddleboard','lesson','beach'],hours:{open:'08:00',close:'19:00'}}),
  seed({index:26,parent:3,district:'Marina Solana',name:'Luna Terrace',slug:'luna-terrace',description:'A rooftop restaurant and wine bar with Port Vervelle’s signature sunset view and an unmistakable date-night mood.',category:'restaurant',type:'venue',activities:['dinner','wine','sunset','date night'],hours:{open:'17:00',close:'00:00'}}),
  seed({index:51,parent:3,district:'Marina Solana',name:'Circolo Nove',slug:'circolo-nove',description:'A discreet members’ club for late dancing, velvet rooms, and swinging nights that stay off the Piazza. Membership gets you through the door; it does not purchase anyone.',category:'nightlife',type:'venue',activities:['swingers club','late dancing','private rooms','cocktails','membership nightlife'],hours:{open:'22:00',close:'05:00'},sortOrder:268,metadata:{source:'port_vervelle_nightlife_expansion_v1'},lore:{
    atmosphere:['intimate','discreet','late and unhurried'],
    sensoryDetails:['velvet and stone holding the heat','low lamps on marble tables','night air from the courtyard door'],
    signatureDetails:['a small dance floor that never pretends to be La Sirena','velvet banquettes repaired rather than replaced','a courtyard door members use when they want to leave unseen'],
    layout:['a discreet street entrance','a lounge and dance floor','private rooms off a side hall','a courtyard door toward the water'],
    stableFacts:['Circolo Nove is in Marina Solana.','It is a members’ swingers club.','Membership does not purchase a person.'],
    localEtiquette:['Do not advertise who you saw.','The door fee is not a claim on anyone inside.'],
  }}),
  seed({index:47,parent:3,district:'Marina Solana',name:'Hôtel Coralline',slug:'hotel-coralline',description:'A stylish fifty-two-room beachfront hotel at the quieter end of the Marina Solana promenade, mixing sun-faded glamour, poolside energy, and a little summer chaos.',category:'hotel',type:'residence',activities:['stay','pool','rooftop bar','beach','nightlife'],hours:{open:'00:00',close:'23:59'},sortOrder:265,metadata:{lodging:true,lodgingType:'beachfront hotel',roomCount:52,vibe:'social, sun-faded glamour, slightly chaotic',bestFor:['summer visitors','nightlife','pool scenes','flings','visiting performers']},lore:{
    atmosphere:['social and sun-faded glamorous','slightly chaotic in high summer','restless from poolside afternoon into rooftop night'],
    sensoryDetails:['sunlight flashing across terrazzo floors','chlorine, citrus, and sea air around the pool','music carrying down from the rooftop bar','balcony doors clicking open toward the promenade'],
    signatureDetails:['mid-century terrazzo floors','curved balconies facing the coast','a lively pool open to day-pass guests','a rooftop bar favored by performers and summer crowds'],
    layout:['a promenade entrance at Marina Solana’s quieter end','fifty-two rooms stacked behind curved balconies','a central pool deck that functions as the hotel’s social heart','a rooftop bar above the beachfront rooms'],
    conversationHooks:['Which visiting performer has taken over the rooftop.','What really happened after last night’s pool party.','Whether a summer flirtation will survive breakfast.'],
    stableFacts:['Hôtel Coralline stands at the quieter end of the Marina Solana promenade.','It has fifty-two rooms.','It was built during Port Vervelle’s mid-century tourism boom.','Locals can buy pool day passes.','The local saying is: “What happens at Coralline makes it back to the Piazza eventually.”'],
    publicHistory:['Hôtel Coralline opened during the town’s mid-century tourism boom.','Its terrazzo, curved balconies, pool, and rooftop bar survived changing fashions and became part of Marina Solana’s summer identity.','Visiting performers traditionally lodge here, pulling afterparties and morning-after stories into the hotel.'],
    recurringPeople:[{label:'Coralline summer staff',role:'pool attendants, bartenders, and hosts managing the seasonal rush',rhythm:'They keep the hotel moving even when its guests lose track of the hour.'},{label:'visiting performers',role:'musicians and entertainers lodged near Marina Solana nightlife',rhythm:'Their arrivals turn the rooftop and pool into temporary scenes.'}],
    storySeeds:['A rooftop afterparty leaves two different versions of the same story.','A visiting performer asks a local for one unpublicized night in town.','A pool day pass places someone exactly where they claimed they would not be.'],
  }}),

  seed({index:27,parent:4,district:'Bellavista',name:'Bellavista Apartments',slug:'bellavista-apartments',description:'A hillside apartment building of balconies, shared stairs, younger residents, and frequent neighbor encounters.',category:'residence',type:'residence',activities:['visit friends','balcony conversation','local life']}),
  seed({index:28,parent:4,district:'Bellavista',name:'Villa Mirabelle',slug:'villa-mirabelle',description:'An established residential villa with garden apartments, older stonework, and quieter, wealthier routines.',category:'residence',type:'residence',activities:['garden visit','quiet conversation','local life']}),
  seed({index:29,parent:4,district:'Bellavista',name:'Studio Lucent',slug:'studio-lucent',description:'A photography studio handling portraits, fashion, weddings, and tourism work in rooms full of coastal light.',category:'studio',type:'venue',activities:['photography','portrait session','creative work'],hours:{open:'09:00',close:'19:00'}}),
  seed({index:30,parent:4,district:'Bellavista',name:'Fiore & Fig',slug:'fiore-and-fig',description:'A florist and gift shop woven into weddings, apologies, celebrations, and the color of Bellavista’s daily streets.',category:'shopping',type:'venue',activities:['flowers','gifts','shopping'],hours:{open:'09:00',close:'19:00'}}),
  seed({index:31,parent:4,district:'Bellavista',name:'Bellavista Fitness Club',slug:'bellavista-fitness-club',description:'A neighborhood training and wellness club for weights, yoga, Pilates, instructors, and familiar routines.',category:'fitness',type:'venue',activities:['workout','yoga','pilates','wellness'],hours:{open:'06:00',close:'22:00'}}),
  seed({index:32,parent:4,district:'Bellavista',name:'Belvedere Garden',slug:'belvedere-garden',description:'A quiet overlook garden for picnics, sunset walks, dates, and conversations that need a little distance from town.',category:'park',type:'outdoor',activities:['garden walk','picnic','sunset','quiet conversation']}),
  seed({index:48,parent:4,district:'Bellavista',name:'Casa Livia',slug:'casa-livia',description:'A quiet nine-room hillside guesthouse above Belvedere Garden, domestic and beautiful enough for writers, couples, and visitors beginning to live like neighbors.',category:'hotel',type:'residence',activities:['stay','breakfast','writing','terrace','long visit'],hours:{open:'00:00',close:'23:59'},sortOrder:325,metadata:{lodging:true,lodgingType:'hillside guesthouse',roomCount:9,vibe:'quiet, beautiful, domestic',bestFor:['longer stays','writers','photographers','couples','people temporarily living in town']},lore:{
    atmosphere:['quiet and domestic','beautiful without feeling staged','suited to slow routines and longer stays'],
    sensoryDetails:['breakfast baking in the shared kitchen','morning light crossing the hillside terrace','keys placed on the old kitchen table','garden air rising from Belvedere below'],
    signatureDetails:['nine rooms adapted from a teacher’s former home','room keys left at the kitchen table','a baked breakfast served without ceremony','a terrace known for clear morning sunlight'],
    layout:['a hillside entrance above Belvedere Garden','nine guest rooms arranged through the former family home','a shared kitchen table that acts as reception','a sunlit terrace facing down toward town'],
    conversationHooks:['What brought a guest to Port Vervelle for longer than a holiday.','Which local routine has begun to feel like home.','Whether temporary living is becoming a decision.'],
    stableFacts:['Casa Livia stands above Belvedere Garden in Bellavista.','It has nine rooms.','The guesthouse was once the home of schoolteacher Livia Ferretti.','Livia became known for taking in people who needed somewhere temporary.','Her nieces now run the house.'],
    publicHistory:['Schoolteacher Livia Ferretti first opened rooms in her home to people who needed a temporary place to stay.','Her nieces kept that tradition and gradually shaped the house into a small guesthouse without removing its domestic character.'],
    recurringPeople:[{label:'Livia’s nieces',role:'owners and hosts preserving the house’s informal hospitality',rhythm:'They handle arrivals at the kitchen table and notice when a guest starts settling into town.'},{label:'long-stay guests',role:'writers, photographers, couples, and people between homes',rhythm:'Their routines gradually overlap with Bellavista’s neighbors and shops.'}],
    storySeeds:['A guest’s one-week booking becomes a month without anyone naming the reason.','An unfinished manuscript is left on the terrace before rain.','Someone who once stayed with Livia returns looking for the room they remember.'],
  }}),

  seed({index:33,parent:5,district:'Mercato Vecchio',name:'Vervelle General Clinic',slug:'vervelle-general-clinic',description:'The town’s clinic and small hospital, linking medicine, therapy, reception work, night shifts, and everyday care.',category:'healthcare',type:'venue',activities:['appointment','therapy','visit','work'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:34,parent:5,district:'Mercato Vecchio',name:'Officina Moretti',slug:'officina-moretti',description:'A scooter and automotive workshop where repairs, favors, tools, and working-town conversation share the same floor.',category:'workshop',type:'venue',activities:['scooter repair','car repair','local conversation'],hours:{open:'07:30',close:'18:30'}}),
  seed({index:35,parent:5,district:'Mercato Vecchio',name:'Vervelle Design Works',slug:'vervelle-design-works',description:'An architecture and interiors office involved in restorations, homes, hospitality projects, and professional town life.',category:'studio',type:'venue',activities:['architecture','design','creative work'],hours:{open:'09:00',close:'18:00'}}),
  seed({index:36,parent:5,district:'Mercato Vecchio',name:'Studio Ondine',slug:'studio-ondine',description:'A ceramics and painting studio offering classes, exhibitions, commissions, and handmade sales.',category:'gallery',type:'venue',activities:['ceramics','painting','art class','gallery'],hours:{open:'10:00',close:'19:00'}}),
  seed({index:37,parent:5,district:'Mercato Vecchio',name:'Piccolo Cinema',slug:'piccolo-cinema',description:'A two-screen neighborhood cinema mixing European films, mainstream releases, and occasional midnight shows.',category:'cinema',type:'venue',activities:['movie','cinema','late show'],hours:{open:'14:00',close:'00:30'}}),
  seed({index:38,parent:5,district:'Mercato Vecchio',name:'Vervelle Cooperative',slug:'vervelle-cooperative',description:'The practical grocery and household cooperative where mundane errands reliably turn into familiar encounters.',category:'shopping',type:'venue',activities:['groceries','shopping','errands','local conversation'],hours:{open:'07:30',close:'21:00'}}),

  seed({index:39,parent:6,district:'Capo Vervelle',name:'Domaine Vervelle',slug:'domaine-vervelle',description:'A vineyard and estate for tastings, harvest work, weddings, long lunches, and summer events above the coast.',category:'vineyard',type:'venue',activities:['wine tasting','vineyard tour','wedding','long lunch'],hours:{open:'10:00',close:'22:00'}}),
  seed({index:40,parent:6,district:'Capo Vervelle',name:'Hôtel Celeste',slug:'hotel-celeste',description:'Port Vervelle’s flagship boutique cliffside hotel, with gardens, a pool, restaurant, and spa for milestone weekends, private affairs, and guests who want to disappear beautifully.',category:'hotel',type:'residence',activities:['stay','pool','garden','dinner','spa','proposal'],hours:{open:'00:00',close:'23:59'},metadata:{lodging:true,lodgingType:'flagship cliffside hotel',vibe:'luxurious, secluded, quietly consequential',bestFor:['anniversaries','affairs','proposals','special dinners','wedding overflow']},lore:{
    atmosphere:['secluded and romantic','quietly luxurious','charged by the sense that every booking means something'],
    sensoryDetails:['warm cliffside air moving through the gardens','pool water catching the last light','linen, citrus, and polished stone in the guest halls','dinner conversation fading toward the sea'],
    signatureDetails:['terraced gardens descending toward the cliffs','a pool shielded from the public road','a destination restaurant used by locals for important dinners','direct access to Celeste Spa'],
    layout:['a private arrival road above Capo Vervelle','guest rooms and suites oriented toward the coast','terraced gardens linking the pool, restaurant, and overlooks','Celeste Spa nested inside the hotel grounds'],
    conversationHooks:['What a local is announcing simply by booking a room.','Which proposal or anniversary dinner the staff are quietly preparing.','Who has come to the Capo to disappear from town for a while.'],
    stableFacts:['Hôtel Celeste is Port Vervelle’s flagship hotel.','It stands on the cliffs of Capo Vervelle.','Its grounds include gardens, a pool, a restaurant, and Celeste Spa.','It regularly hosts Domaine Vervelle wedding overflow.','For a local, booking Celeste is understood as a statement rather than a practical necessity.'],
    publicHistory:['Hôtel Celeste grew into the town’s flagship retreat by offering privacy without losing its relationship to local life.','Its restaurant, spa, and gardens made it the default setting for anniversaries, proposals, affairs, and expensive reconciliations.','Domaine Vervelle wedding parties use the hotel when the estate needs overflow lodging.'],
    recurringPeople:[{label:'the Celeste staff',role:'hoteliers, spa staff, and restaurant hosts trained in anticipatory discretion',rhythm:'They move important weekends forward without making guests explain themselves twice.'},{label:'occasion guests',role:'couples, wedding parties, and out-of-town money',rhythm:'Their arrivals peak around long weekends, celebrations, and Domaine events.'}],
    storySeeds:['A local books a suite and leaves the second guest name blank.','A proposal dinner is prepared while one partner quietly reconsiders the timing.','Domaine wedding overflow brings two people back together at the pool.'],
  }}),
  seed({index:41,parent:40,district:'Capo Vervelle',name:'Celeste Spa',slug:'celeste-spa',description:'The hotel’s spa for treatments, sauna, quiet terraces, wellness routines, and locals taking an afternoon away.',category:'spa',type:'venue',activities:['spa','sauna','massage','relaxation'],hours:{open:'09:00',close:'20:00'}}),
  seed({index:42,parent:6,district:'Capo Vervelle',name:'Cala Bianca',slug:'cala-bianca',description:'A secluded rocky cove for swimming, sun-warmed stone, quiet company, and conversations away from the main beach.',category:'outdoor',type:'outdoor',activities:['swimming','cove','sunbathing','quiet conversation']}),
  seed({index:43,parent:6,district:'Capo Vervelle',name:'Faro Vervelle',slug:'faro-vervelle',description:'A lighthouse reached by a cliff trail, known for wind, solitude, sunset, and dramatic views back toward town.',category:'landmark',type:'landmark',activities:['cliff walk','lighthouse','sunset','photography']}),
  seed({index:44,parent:6,district:'Capo Vervelle',name:'La Pergola',slug:'la-pergola',description:'An olive-grove restaurant with communal tables, local wine, live music, and summer dancing under the trees.',category:'restaurant',type:'venue',activities:['dinner','wine','live music','summer dancing'],hours:{open:'12:00',close:'23:30'}}),
];
