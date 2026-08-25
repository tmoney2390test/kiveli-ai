import type{Location,LocationType,World}from'../types';
import{locationSeedLore}from'./location-bible';

export const VESPORMOOR_WORLD_ID='10000000-0000-4000-8000-000000000010';
export const VESPORMOOR_ARRIVAL_ID='29000000-0000-4000-8000-000000000007';

export const VESPORMOOR_CANONICAL_LORE={
  origin:'Vespormoor began as a settlement hidden deep within a mountain valley where the forests grow unnaturally dense and Lake Vesper lies black and still beneath the surrounding peaks. Travelers long avoided the valley after stories of voices in the woods, missing time, strange lights beneath the lake, and people emerging from the fog days later believing only minutes had passed.',
  founding:'In 1712, the mysterious physician and aristocrat Lucien Vesper arrived with his sister Isolde, purchased much of the valley, and built Vesper House overlooking the lake. They created a sanctuary for ordinary people and the Veiled: human-presenting people with unusual bloodlines, subtle gifts, witchcraft, or unexplained longevity.',
  covenant:'The Vesper Covenant binds the oldest families to secrecy, mutual protection, and restraint in the use of unusual abilities. No resident may expose the Veiled to the outside world, coerce or prey upon an unwilling person, or bring an old supernatural conflict into the valley.',
  burningWinter:'During the Burning Winter of 1846, a faction attempted to seize Vespormoor and much of the oldest district burned. Lucien disappeared soon afterward. Isolde remained for another half-century before vanishing. Vesper House has officially stood empty ever since, though lights still move behind its windows.',
  lakeWarning:'Nothing beneath the water shall be awakened.',
  modernDay:'To outsiders, Vespormoor is an exceptionally preserved mountain town of roughly twenty thousand people: rain-darkened cobblestones, candlelit restaurants, Victorian homes, old bookstores, secluded estates, an ancient university, wooded trails, and Lake Vesper beneath nearly perpetual mist. Locals know the fog hides places, cameras fail at convenient moments, and roads change after midnight.',
  presentThreat:'The protections surrounding Vespormoor are weakening. Lights move beneath the lake, animals avoid parts of the shore, old families are returning, and Vesper House glows more frequently at night. What the town has hidden for three centuries may no longer intend to remain hidden.',
}as const;

export const vespormoorWorld:World={
  id:VESPORMOOR_WORLD_ID,
  slug:'vespormoor',
  name:'Vespormoor',
  description:'A secluded gothic mountain university town where modern life, old families, and human-presenting Veiled residents meet around the dark waters of Lake Vesper.',
  hero_asset_key:'vespormoor-hero',
  access_type:'subscription',
  entitlement_key:'worlds.standard',
  timezone:'America/New_York',
  sort_order:90,
  featured:true,
  published:true,
  visual_context:{
    setting:'modern secluded Gothic mountain university town surrounding black Lake Vesper, hidden by dense forest, steep peaks, and persistent mist',
    geography:['deep mountain valley','black still lake','dense old-growth forest','steep mist-covered peaks','isolated estates and wooded trails'],
    architecture:['Victorian Gothic townhouses','rain-dark stone civic buildings','warm contemporary cafes inside old buildings','connected castle-estate university','secluded manor estates','Vesper House above the lake'],
    climate:'cool wet mountain climate with frequent fog, rain, and long winters',
    visualStyle:['photorealistic contemporary Gothic romance','blue-gray mist against warm candlelight','wet cobblestone reflections','quiet supernatural tension'],
    palette:['midnight blue','charcoal','wet slate','forest black-green','aged brass','candle amber'],
    recurringElements:['gas-style streetlamps','low lake fog','wrought iron','dark water','old family crests','warm windows in the rain'],
    signageStyle:['carved serif lettering','aged brass plaques','hand-painted shop signs','unobtrusive university wayfinding'],
    avoid:['overt high-fantasy spectacle','visible monsters in ordinary public scenes','transformations or grotesque anatomy','historical costume by default','graphic horror or gore','modern glass skyline','cyberpunk neon','theme-park Gothic'],
  },
  metadata:{
    releaseWave:9,
    early_access:true,
    releaseStatus:'playable',
    contentStatus:'complete_world_v1',
    locationCatalogStatus:'ready',
    residentRosterStatus:'ready',
    photoStatus:'hero_ready',
    locationPhotoStatus:'ready',
    mappedLocationPhotoCount:51,
    locationCount:51,
    districtCount:6,
    publicPlaceCount:45,
    residentCompanionCount:45,
    residentRosterVersion:1,
    residentScheduleStatus:'authored_weekly_v1',
    socialGraphStatus:'authored_v1',
    residentPortraitStatus:'individual_slots_ready',
    locationImageSlotCount:51,
    recurringEventCount:6,
    storyArcCount:7,
    genreTags:['gothic romance','mystery','university','light supernatural'],
    tagline:'Every family keeps a secret. The lake keeps all of them.',
    relationshipFantasy:'Fall for someone whose secrets may be older—and more dangerous—than the town itself.',
    originYear:1712,
    approximatePopulation:20000,
    foundingFigures:['Lucien Vesper','Isolde Vesper'],
    governingPact:'The Vesper Covenant',
    supernaturalResidents:['witches','long-lived Veiled','Lake-Touched Veiled','empaths','intuitives','people with subtle inherited affinities'],
    supernaturalRules:['All Veiled remain essentially human in appearance.','No transformations, monster bodies, public creature population, or grotesque anatomy.','Abilities stay subtle, personal, and deniable to outsiders.'],
    covenantRules:['Keep the Veiled secret from the outside world.','Never coerce or prey upon an unwilling person.','Use unusual abilities with restraint.','Do not bring old supernatural conflicts into the valley.'],
    historicCrises:['The Burning Winter of 1846'],
    centralWarning:VESPORMOOR_CANONICAL_LORE.lakeWarning,
    nativeDateSeeds:['Candlelight at Closing Time','Fog on the Lake Path','The Restricted Stacks','A Storm at Vesper House'],
    storySeeds:['The Lights Beneath the Water','An Old Family Returns','The Road Changed After Midnight','A Clause in the Covenant'],
    populationArchetypes:['university scholar','old-book dealer','physician','innkeeper','estate caretaker','local historian','Veiled liaison','covenant family heir'],
    canonicalLore:VESPORMOOR_CANONICAL_LORE,
  },
  default_arrival_location_id:VESPORMOOR_ARRIVAL_ID,
  world_role:'home',
  social_rhythm:'quiet',
  dominant_dayparts:['evening','late_night','morning'],
  relationship_themes:['secrecy','trust','forbidden intimacy','mortality and immortality','family legacy','mutual protection','awakening danger'],
  activity_families:['old bookstores','university life','candlelit dining','lakeshore walks','wooded trails','estate visits','town traditions','supernatural mysteries'],
  mobility_style:'walkable',
  weather_profile:{climate:'cool wet mountain valley',states:['fog','rain','overcast','snow','clear_cold'],outdoorBias:.44},
};

type VespormoorLocationSeed={index:number;parent?:number;district?:string;name:string;slug:string;description:string;category:string;type:LocationType;activities:string[]};
const vespormoorLocationId=(index:number)=>`29000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const vespormoorVisualAvoid=['overt high-fantasy spectacle','visible monsters in ordinary public scenes','graphic horror or gore','modern glass skyline','cyberpunk neon','theme-park Gothic'];

function location(input:VespormoorLocationSeed):Location{
  const district=input.district??input.name;
  const districtNode=input.type==='district';
  return{
    id:vespormoorLocationId(input.index),world_id:VESPORMOOR_WORLD_ID,parent_location_id:input.parent?vespormoorLocationId(input.parent):null,
    name:input.name,slug:input.slug,description:input.description,category:input.category,location_type:input.type,
    possible_activities:input.activities,visual_asset_key:`vespormoor-location-${input.slug}`,sort_order:input.index*10,
    canonical_visual_context:{
      canonicalPrompt:`${input.name}, ${district}, Vespormoor. ${input.description} Grounded Gothic romantic realism in a secluded mountain valley: cool blue-gray mist, rain-dark textures, aged brass, warm candlelight, restrained supernatural tension, and believable lived-in detail.`,
      indoorOutdoor:['outdoor','landmark','district'].includes(input.type)?'outdoor':'mixed',
      visualAnchors:[input.name,district,'Vespormoor','low mist','warm candlelight'],
      avoid:vespormoorVisualAvoid,
    },
    canonical_lore:locationSeedLore({world:'Vespormoor',district,name:input.name,description:input.description,category:input.category,type:input.type,activities:input.activities,atmosphere:['mist-bound','historic','quietly supernatural'],sensory:['rain on old stone and dark wood','warm lamps diffused through cool mist'],weather:['Fog shortens familiar sightlines and changes how routes feel.','Rain and snow make shelter, access, and travel part of the scene.']}),
    metadata:{tags:input.activities,district:districtNode?true:district,photoStatus:'ready',source:'vespormoor_world_v1'},
  };
}

export const vespormoorLocations:Location[]=[
  location({index:1,name:'Old Vesper',slug:'old-vesper',description:'The oldest part of town: narrow cobblestone streets, gothic storefronts, gas lamps, hidden courtyards, and centuries-old businesses.',category:'district',type:'district',activities:['cobblestone walks','markets','cafes','historic sites','nightlife']}),
  location({index:2,name:'Vesper Heights',slug:'vesper-heights',description:'Wooded hills filled with enormous homes belonging to Vespormoor’s wealthiest and oldest families.',category:'district',type:'district',activities:['estate visits','gardens','horseback riding','fine dining','overlooks']}),
  location({index:3,name:'Lakeward',slug:'lakeward',description:'Restaurants, docks, old cottages, walking paths, and fog-covered water give Lakeward some of Vespormoor’s most romantic scenery.',category:'district',type:'district',activities:['lake walks','boating','waterfront dining','spa visits','quiet dates']}),
  location({index:4,name:'Vespormoor University',slug:'vespormoor-university',description:'A colossal gothic castle-estate occupying the ridge above Vespormoor, with towers, bridges, gardens, courtyards, dormitories, and academic wings visible from almost anywhere in town.',category:'district',type:'district',activities:['classes','study','library research','garden walks','campus events']}),
  location({index:5,name:'Thornwood',slug:'thornwood',description:'Beyond the populated valley lie enormous forests, isolated cabins, waterfalls, ruins, and places that existed long before Vespormoor.',category:'district',type:'district',activities:['hiking','waterfalls','cabin stays','wilderness exploration','ritual sites']}),
  location({index:6,name:'Raven Ward',slug:'raven-ward',description:'The younger and more dangerous side of Vespormoor, filled with clubs, converted warehouses, underground venues, tattoo studios, and businesses that thrive after midnight.',category:'district',type:'district',activities:['nightclubs','live music','tattoos','late dining','night markets']}),

  location({index:7,parent:1,district:'Old Vesper',name:'Vesper Square',slug:'vesper-square',description:'Central town plaza with an old fountain, markets, festivals, and outdoor gathering spaces.',category:'plaza',type:'landmark',activities:['market browsing','festivals','meetups','people watching']}),
  location({index:8,parent:1,district:'Old Vesper',name:'The Black Lantern',slug:'black-lantern',description:'A candlelit pub inside a former coaching inn and one of Vespormoor’s oldest social institutions.',category:'pub',type:'venue',activities:['drinks','dinner','local stories','late conversation']}),
  location({index:9,parent:1,district:'Old Vesper',name:'Morrow & Quill',slug:'morrow-and-quill',description:'A huge independent bookstore filled with fireplaces, ladders, forgotten rooms, and rare books.',category:'bookstore',type:'venue',activities:['book browsing','reading','rare-book research','fireside conversation']}),
  location({index:10,parent:1,district:'Old Vesper',name:'Belladonna Apothecary',slug:'belladonna-apothecary',description:'An herbalist and apothecary serving humans as well as customers with more unusual medical needs.',category:'apothecary',type:'venue',activities:['herbal remedies','consultation','ingredient shopping','quiet conversation']}),
  location({index:11,parent:1,district:'Old Vesper',name:'The Mourning Cup',slug:'mourning-cup',description:'A cozy café famous for pastries, dark coffee, rain-covered windows, and lingering conversations.',category:'cafe',type:'venue',activities:['coffee','pastries','reading','lingering conversation']}),
  location({index:12,parent:1,district:'Old Vesper',name:'Saint Orison Chapel',slug:'saint-orison-chapel',description:'A small gothic church with an ancient crypt beneath it.',category:'chapel',type:'landmark',activities:['quiet reflection','history','crypt visit','candle lighting']}),
  location({index:13,parent:1,district:'Old Vesper',name:'Velvet Thorn',slug:'velvet-thorn',description:'An intimate late-night cocktail lounge hidden behind an unmarked entrance.',category:'lounge',type:'venue',activities:['cocktails','late-night date','private conversation','live music']}),

  location({index:14,parent:2,district:'Vesper Heights',name:'Vesper House',slug:'vesper-house',description:'The supposedly abandoned ancestral home of Lucien and Isolde Vesper, where lights have recently appeared inside again.',category:'estate',type:'residence',activities:['estate visit','investigation','history','grounds walk']}),
  location({index:15,parent:2,district:'Vesper Heights',name:'Blackwood Estate',slug:'blackwood-estate',description:'An immaculate mansion belonging to one of the Covenant’s most influential families.',category:'estate',type:'residence',activities:['formal visit','private dinner','Covenant business','garden walk']}),
  location({index:16,parent:2,district:'Vesper Heights',name:'Rosegrave Gardens',slug:'rosegrave-gardens',description:'A public botanical estate famous for strange black roses and secluded paths.',category:'garden',type:'outdoor',activities:['garden walk','botany','quiet date','photography']}),
  location({index:17,parent:2,district:'Vesper Heights',name:'The Conservatory',slug:'the-conservatory',description:'An elegant glasshouse restaurant overlooking the lights of Vespormoor.',category:'restaurant',type:'venue',activities:['fine dining','cocktails','romantic dinner','town views']}),
  location({index:18,parent:2,district:'Vesper Heights',name:'Hawthorne Riding Club',slug:'hawthorne-riding-club',description:'A historic equestrian estate with stables, riding trails, and a wealthy social scene.',category:'equestrian',type:'venue',activities:['horseback riding','lessons','trail rides','social events']}),
  location({index:19,parent:2,district:'Vesper Heights',name:'Vesper Heights Overlook',slug:'vesper-heights-overlook',description:'A stone lookout providing one of the best views over the town and lake.',category:'overlook',type:'outdoor',activities:['town views','lake views','sunset','private conversation']}),
  location({index:20,parent:2,district:'Vesper Heights',name:'Vale House',slug:'vale-house',description:'A long-abandoned mansion recently occupied again under mysterious circumstances.',category:'estate',type:'residence',activities:['mysterious visit','investigation','grounds walk','private meeting']}),

  location({index:21,parent:3,district:'Lakeward',name:'Glasswater Pier',slug:'glasswater-pier',description:'A long public pier extending into Lake Vesper.',category:'pier',type:'landmark',activities:['pier walk','lake views','fishing','quiet conversation']}),
  location({index:22,parent:3,district:'Lakeward',name:'Stillwater House',slug:'stillwater-house',description:'An upscale restaurant with enormous windows looking directly across the lake.',category:'restaurant',type:'venue',activities:['fine dining','wine','lake views','romantic dinner']}),
  location({index:23,parent:3,district:'Lakeward',name:'The Drowned Bell',slug:'drowned-bell',description:'An old waterfront tavern popular with boat crews, students, locals, and discreet Veiled regulars.',category:'tavern',type:'venue',activities:['drinks','seafood','local stories','live music']}),
  location({index:24,parent:3,district:'Lakeward',name:'Vesper Boatworks',slug:'vesper-boatworks',description:'A historic marina offering rowboats, sailboats, and lake excursions.',category:'marina',type:'venue',activities:['rowboating','sailing','lake excursion','boat repair']}),
  location({index:25,parent:3,district:'Lakeward',name:'Moonwake Baths',slug:'moonwake-baths',description:'A restored Victorian bathhouse turned luxurious lakeside spa.',category:'spa',type:'venue',activities:['spa treatment','bathing','massage','lakeside relaxation']}),
  location({index:26,parent:3,district:'Lakeward',name:'Whisper Dock',slug:'whisper-dock',description:'A remote wooden dock traditionally used by couples to confess things they cannot say elsewhere.',category:'dock',type:'outdoor',activities:['private conversation','confession','lake watching','romantic date']}),
  location({index:27,parent:3,district:'Lakeward',name:'The Sunken Chapel',slug:'sunken-chapel',description:'A ruined stone structure beneath the lake that becomes partially visible when water levels fall.',category:'ruin',type:'landmark',activities:['ruin viewing','local history','investigation','lake mystery']}),

  location({index:28,parent:4,district:'Vespormoor University',name:'The Grand Hall',slug:'grand-hall',description:'An enormous vaulted gathering hall used for ceremonies, dinners, dances, and major university events.',category:'hall',type:'venue',activities:['ceremonies','formal dinners','dances','university events']}),
  location({index:29,parent:4,district:'Vespormoor University',name:'Blackglass Library',slug:'blackglass-library',description:'A towering multi-level library containing one of the world’s greatest collections of historical and supernatural material.',category:'library',type:'venue',activities:['study','research','rare collections','quiet conversation']}),
  location({index:30,parent:4,district:'Vespormoor University',name:'Vesper Tower',slug:'vesper-tower',description:'The highest tower on campus, providing a panoramic view of Vespormoor and Lake Vesper.',category:'tower',type:'landmark',activities:['panoramic views','tower climb','photography','private conversation']}),
  location({index:31,parent:4,district:'Vespormoor University',name:'The Cloisters',slug:'the-cloisters',description:'Covered gothic walkways surrounding a beautiful secluded courtyard garden.',category:'cloister',type:'landmark',activities:['covered walk','courtyard rest','study','quiet date']}),
  location({index:32,parent:4,district:'Vespormoor University',name:'Blackwood Dormitories',slug:'blackwood-dormitories',description:'Atmospheric student residences occupying former guest and servant wings of the castle.',category:'dormitory',type:'residence',activities:['student life','study','visit friends','late conversation']}),
  location({index:33,parent:4,district:'Vespormoor University',name:'Anatomy Hall',slug:'anatomy-hall',description:'A prestigious medical school containing old surgical theaters and some very unusual specimens.',category:'academic',type:'venue',activities:['medical study','lecture','anatomy research','specimen viewing']}),
  location({index:34,parent:4,district:'Vespormoor University',name:'The Observatory',slug:'observatory',description:'A remote domed observatory above the estate, popular for astronomy classes and late-night dates.',category:'observatory',type:'venue',activities:['stargazing','astronomy','late-night date','research']}),
  location({index:35,parent:4,district:'Vespormoor University',name:'The Undercroft',slug:'undercroft',description:'Ancient tunnels, crypts, forgotten rooms, and sealed passages beneath the castle.',category:'underground',type:'zone',activities:['exploration','archive search','crypt visit','investigation']}),
  location({index:36,parent:4,district:'Vespormoor University',name:'Rookery House',slug:'rookery-house',description:'A busy student café and pub inside an old gatehouse.',category:'cafe',type:'venue',activities:['coffee','pub food','student socializing','study']}),
  location({index:37,parent:4,district:'Vespormoor University',name:'The High Gardens',slug:'high-gardens',description:'Vast terraced gardens with fountains, hedge mazes, glasshouses, secluded benches, and cliffside overlooks.',category:'garden',type:'outdoor',activities:['garden walk','hedge maze','cliff views','quiet date']}),

  location({index:38,parent:5,district:'Thornwood',name:'Thornwood Trailhead',slug:'thornwood-trailhead',description:'The main entrance to the extensive network of mountain and forest trails.',category:'trailhead',type:'outdoor',activities:['hiking','trail planning','meetup','wildlife watching']}),
  location({index:39,parent:5,district:'Thornwood',name:'Witch’s Falls',slug:'witchs-falls',description:'A dramatic waterfall cascading into a deep natural swimming hole.',category:'waterfall',type:'outdoor',activities:['waterfall hike','swimming','picnic','photography']}),
  location({index:40,parent:5,district:'Thornwood',name:'Foxglove Cabin Retreats',slug:'foxglove-retreats',description:'Beautiful secluded cabins scattered through the forest.',category:'cabins',type:'residence',activities:['cabin stay','fireside evening','forest walk','private retreat']}),
  location({index:41,parent:5,district:'Thornwood',name:'The Crooked Oak',slug:'crooked-oak',description:'A rustic tavern and restaurant frequented by locals, hikers, rangers, and forest workers.',category:'tavern',type:'venue',activities:['rustic dinner','drinks','trail stories','local gathering']}),
  location({index:42,parent:5,district:'Thornwood',name:'Moonstone Quarry',slug:'moonstone-quarry',description:'An abandoned quarry containing flooded tunnels and unusual pale stone.',category:'quarry',type:'zone',activities:['exploration','geology','flooded tunnels','investigation']}),
  location({index:43,parent:5,district:'Thornwood',name:'The Standing Stones',slug:'standing-stones',description:'An ancient stone circle still used for private rites and subtle Veiled traditions.',category:'ritual site',type:'landmark',activities:['ritual observance','history','night visit','quiet reflection']}),
  location({index:44,parent:5,district:'Thornwood',name:'Morrow Vale Ranger Station',slug:'morrow-vale-ranger-station',description:'A remote ranger outpost responsible for incidents officials usually describe as wildlife encounters.',category:'ranger station',type:'venue',activities:['trail information','ranger work','incident report','wilderness rescue']}),

  location({index:45,parent:6,district:'Raven Ward',name:'Nocturne',slug:'nocturne',description:'Vespormoor’s premier nightclub inside a converted nineteenth-century performance hall.',category:'nightclub',type:'venue',activities:['dancing','cocktails','music','nightlife']}),
  location({index:46,parent:6,district:'Raven Ward',name:'The Crimson Room',slug:'crimson-room',description:'An exclusive members-only lounge popular with old families, artists, and discreet Veiled residents.',category:'lounge',type:'venue',activities:['cocktails','private conversation','networking','people watching']}),
  location({index:47,parent:6,district:'Raven Ward',name:'Black Veil Tattoo',slug:'black-veil-tattoo',description:'A tattoo and piercing studio specializing in unusual inks, sigils, and occult designs.',category:'tattoo studio',type:'venue',activities:['tattoo','piercing','sigil design','consultation']}),
  location({index:48,parent:6,district:'Raven Ward',name:'Dead Letter',slug:'dead-letter',description:'An underground live-music venue for alternative, metal, electronic, and experimental acts.',category:'music venue',type:'venue',activities:['live music','dancing','drinks','underground shows']}),
  location({index:49,parent:6,district:'Raven Ward',name:'Afterdark Diner',slug:'afterdark-diner',description:'A twenty-four-hour diner where almost every social circle in Vespormoor eventually crosses paths.',category:'diner',type:'venue',activities:['late meal','coffee','people watching','chance encounter']}),
  location({index:50,parent:6,district:'Raven Ward',name:'The Red Market',slug:'red-market',description:'A hidden nighttime marketplace for rare ingredients, warded objects, information, and discreet services.',category:'night market',type:'venue',activities:['night market','rare ingredients','information trading','unusual goods']}),
  location({index:51,parent:6,district:'Raven Ward',name:'Saint Mercy Hotel',slug:'saint-mercy-hotel',description:'A decadent old boutique hotel with a cocktail bar downstairs and a reputation for absolute discretion.',category:'hotel',type:'residence',activities:['stay','cocktails','private meeting','late-night date']}),
];
