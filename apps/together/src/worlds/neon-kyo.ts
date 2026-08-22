import type { Location, LocationType, World } from '../types';
import{locationSeedLore}from'./location-bible';

export const NEON_KYO_WORLD_ID='10000000-0000-4000-8000-000000000009';
export const NEON_KYO_ARRIVAL_ID='28000000-0000-4000-8000-000000000007';

export const neonKyoWorld:World={
  id:NEON_KYO_WORLD_ID,
  slug:'neon-kyo',
  name:'Neon Kyo',
  description:'One of the richest and loneliest cities in the known world: hyperconnected, heavily watched, and always selling a more perfect version of desire.',
  hero_asset_key:'neon-kyo-hero',
  access_type:'subscription',
  entitlement_key:'worlds.standard',
  timezone:'Asia/Tokyo',
  sort_order:80,
  featured:true,
  published:true,
  visual_context:{
    setting:'seductive near-future East Asian megacity where corporate luxury, dense residential life, experimental technology, and historic blind zones overlap',
    geography:['vertical corporate core','stacked residential towers','subterranean transit and markets','historic canal district'],
    architecture:['glass megatowers','layered mixed-use blocks','transparent skybridges','compact old timber buildings'],
    climate:'humid temperate city with frequent rain',
    visualStyle:['grounded speculative realism','wet neon reflections','warm private interiors against cool public surveillance'],
    palette:['electric cyan','deep indigo','restrained magenta','warning red','warm amber'],
    recurringElements:['biometric cameras','reactive advertisements','elevated walkways','rain-slicked streets','old lanterns at the city edge'],
    signageStyle:['dense responsive displays','minimal luxury wayfinding','handmade signs inside surveillance blind zones'],
    avoid:['recognizable real-world landmarks','Blade Runner imitation','Times Square imitation','empty streets','flying-car spectacle'],
  },
  default_arrival_location_id:NEON_KYO_ARRIVAL_ID,
  metadata:{
    releaseWave:8,
    early_access:false,
    photoStatus:'ready',
    locationPhotoStatus:'ready',
    mappedLocationPhotoCount:51,
    tagline:'Everybody is connected. Everybody is watched. Everybody has something they hide.',
    civicRating:true,
    relationshipFantasy:'Find something genuine in a city that can manufacture almost everything else.',
    nativeDateSeeds:['Rain at Kissaten 88','Above the City at Halo','No Filters in Koi Garden','A Night Completely Offline'],
    storySeeds:['The Rating Changed','Someone Is Watching','What the Implant Recorded','Disappear Into the Shade'],
    populationArchetypes:['corporate professional','club worker','hacker','augmented artist','medical specialist','tower resident'],
    residentCompanionCount:30,
    residentPortraitStatus:'ready',
    mappedResidentPortraitCount:30,
    residentRosterVersion:1,
    supportingPlaceCount:3,
    publicPlaceCount:45,
  },
  world_role:'home',
  social_rhythm:'always_on',
  dominant_dayparts:['evening','late_night','morning'],
  relationship_themes:['surveillance','authenticity','privacy','manufactured desire','class divide','chosen vulnerability'],
  activity_families:['nightlife','fashion','technology','gaming','luxury dining','body modification','residential life','historic retreats'],
  mobility_style:'transit',
  weather_profile:{climate:'humid temperate megacity',states:['rain','overcast','humid','clear','storm'],outdoorBias:.46},
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
};

const locationId=(index:number)=>`28000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const avoid=['recognizable real-world landmarks','generic cyberpunk slum','flying cars','empty streets','illegible text walls','cartoon futurism'];

function seed(input:SeedInput):Location{
  const district=input.district??input.name;
  const districtNode=input.type==='district';
  return{
    id:locationId(input.index),
    world_id:NEON_KYO_WORLD_ID,
    parent_location_id:input.parent?locationId(input.parent):null,
    name:input.name,
    slug:input.slug,
    location_type:input.type,
    description:input.description,
    category:input.category,
    hours:input.hours,
    possible_activities:input.activities,
    visual_asset_key:input.slug,
    canonical_visual_context:{
      canonicalPrompt:`${input.name}, ${district}, Neon Kyo. ${input.description}`,
      indoorOutdoor:['outdoor','landmark','transit','district'].includes(input.type)?'outdoor':'mixed',
      visualAnchors:[input.name,district,'Neon Kyo'],
      avoid,
    },
    canonical_lore:locationSeedLore({world:'Neon Kyo',district,name:input.name,description:input.description,category:input.category,type:input.type,activities:input.activities,atmosphere:['hyperconnected','socially observant','grounded speculative realism'],sensory:['rain against dense city surfaces','public systems humming behind human routines'],weather:['Rain changes crowd cover, reflections, and surveillance sightlines.','Humid nights keep indoor routes and elevated walkways active.']}),
    sort_order:input.index*10,
    metadata:{tags:input.activities,district:districtNode?true:district,photoStatus:'ready'},
  };
}

export const neonKyoLocations:Location[]=[
  seed({index:1,name:'Hikari Core',slug:'hikari-core',description:'Neon Kyo’s brilliant public face: aspirational, crowded, and continuously analyzed by biometric and private security systems.',category:'district',type:'district',activities:['shopping','fashion','cafes','gaming','people watching','nightlife']}),
  seed({index:2,name:'Shinjira',slug:'shinjira',description:'The vertical nightlife district respectable residents deny visiting, where hidden floors and unlisted doors make almost everything feel permitted.',category:'district',type:'district',activities:['nightlife','cocktails','dancing','private clubs','late food']}),
  seed({index:3,name:'Aoyama-9',slug:'aoyama-nine',description:'An immaculate high-altitude enclave for the people who own Neon Kyo, where beauty, privacy, and convenience are purchasable services.',category:'district',type:'district',activities:['luxury dining','fashion','art','wellness','rooftop drinks']}),
  seed({index:4,name:'Akiba Undergrid',slug:'akiba-undergrid',description:'The experimental district beneath the tourist streets, where engineers, hackers, gamers, and artists modify technology without asking permission.',category:'district',type:'district',activities:['technology','gaming','nightlife','body modification','digital art']}),
  seed({index:5,name:'Tsuki Blocks',slug:'tsuki-blocks',description:'The dense residential towers where ordinary young adults live, share amenities, endure constant advertising, and make scarce private space meaningful.',category:'district',type:'district',activities:['residential life','late errands','fitness','rooftops','neighborhood drinks']}),
  seed({index:6,name:'Old Kyo / The Shade',slug:'old-kyo-the-shade',description:'Historic streets and canals where surveillance fails unpredictably, drawing lovers, dissidents, celebrities, and anyone who needs to disappear.',category:'district',type:'district',activities:['shrines','gardens','quiet dining','canal walks','underground music']}),

  seed({index:7,parent:1,district:'Hikari Core',name:'Hikari Crossing',slug:'hikari-crossing',description:'The city’s legendary pedestrian crossing, where enormous reactive advertisements watch tens of thousands of people disappear into the crowd.',category:'landmark',type:'landmark',activities:['people watching','meet up','street photography','disappear into the crowd']}),
  seed({index:8,parent:1,district:'Hikari Core',name:'Maison Vice',slug:'maison-vice',description:'A six-story fashion complex for provocative cybercouture, designer lingerie, augmented fabrics, and luxury body accessories.',category:'shopping',type:'venue',activities:['fashion','shopping','virtual fitting','styling'],hours:{open:'10:00',close:'23:00'}}),
  seed({index:9,parent:1,district:'Hikari Core',name:'Kissaten 88',slug:'kissaten-88',description:'A tiny low-lit café beneath a cosmetics hologram, with leather booths and rainy windows that become notably private after midnight.',category:'cafe',type:'venue',activities:['coffee','late-night conversation','casual date','people watching'],hours:{open:'07:00',close:'03:00'}}),
  seed({index:10,parent:1,district:'Hikari Core',name:'Hikari Capsule Club',slug:'hikari-capsule-club',description:'A futuristic capsule hotel with soundproof rooms, environmental controls, and anonymous payments, popular with locals who need privacy.',category:'hotel',type:'residence',activities:['stay','rest','private conversation'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:11,parent:1,district:'Hikari Core',name:'Mirror',slug:'mirror-hikari',description:'An exclusive fashion lounge where guests can alter their projected hair, clothing, and faces throughout the evening.',category:'lounge',type:'venue',activities:['cocktails','fashion','dancing','augmented reality'],hours:{open:'18:00',close:'03:00'}}),
  seed({index:12,parent:1,district:'Hikari Core',name:'Pulse Arcade',slug:'pulse-arcade',description:'A huge gaming tower of competitive neural-response games whose upper floors become darker and less legal after midnight.',category:'entertainment',type:'venue',activities:['arcade games','neural games','competition','betting'],hours:{open:'10:00',close:'04:00'}}),
  seed({index:13,parent:1,district:'Hikari Core',name:'Hikari Skybridge',slug:'hikari-skybridge',description:'A transparent walkway sixty floors above Hikari, where drifting advertisements below the glass make public space feel strangely private.',category:'landmark',type:'landmark',activities:['skyline view','walk','date','late-night conversation']}),

  seed({index:14,parent:2,district:'Shinjira',name:'Velvet Static',slug:'velvet-static',description:'Shinjira’s defining nightclub: dark concrete, red light, bass, perfume, and neural audio that responds to the crowd’s emotional state.',category:'nightlife',type:'venue',activities:['dancing','music','drinks','nightlife'],hours:{open:'21:00',close:'05:00'}}),
  seed({index:15,parent:2,district:'Shinjira',name:'Room 13',slug:'room-thirteen',description:'A private cocktail lounge behind an unmarked steel door where recording is disabled and bartenders never ask for surnames.',category:'lounge',type:'venue',activities:['cocktails','private conversation','people watching'],hours:{open:'19:00',close:'04:00'}}),
  seed({index:16,parent:2,district:'Shinjira',name:'Hotel Nocturne',slug:'hotel-nocturne',description:'A luxury privacy hotel with automated check-in, anonymous elevators, soundproof rooms, and a fashionable penthouse bar.',category:'hotel',type:'residence',activities:['stay','penthouse drinks','private dinner','skyline view'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:17,parent:2,district:'Shinjira',name:'Scarlet Garden',slug:'scarlet-garden',description:'A seductive rooftop bar of faintly glowing crimson foliage and semi-private alcoves overlooking the city’s lower levels.',category:'bar',type:'venue',activities:['cocktails','rooftop date','conversation','skyline view'],hours:{open:'17:00',close:'03:00'}}),
  seed({index:18,parent:2,district:'Shinjira',name:'Ghost Line',slug:'ghost-line',description:'An abandoned subway platform turned illegal market for black-market implants, synthetic stimulants, forged Civic IDs, fashion mods, and cheap alcohol.',category:'market',type:'venue',activities:['underground market','implant shopping','street food','people watching'],hours:{open:'20:00',close:'05:00'}}),
  seed({index:19,parent:2,district:'Shinjira',name:'Red Lantern Alley',slug:'red-lantern-alley',description:'A rain-bright entertainment street of tiny bars, private lounges, noodle counters, and hidden entrances beneath suspended red holographic lanterns.',category:'nightlife',type:'landmark',activities:['bar hopping','late food','walking','nightlife']}),
  seed({index:20,parent:2,district:'Shinjira',name:'Eden',slug:'eden-shinjira',description:'A members-only immersive club that combines augmented reality, fragrance, temperature, and neural audio into custom environments.',category:'entertainment',type:'venue',activities:['immersive experience','dancing','cocktails','fantasy date'],hours:{open:'20:00',close:'05:00'}}),

  seed({index:21,parent:3,district:'Aoyama-9',name:'The Glass House',slug:'glass-house',description:'A prestigious residential tower with private elevators, immense windows, total visitor records, and expensive ways to erase them.',category:'residence',type:'residence',activities:['visit','private dinner','skyline view','stay']}),
  seed({index:22,parent:3,district:'Aoyama-9',name:'Halo',slug:'halo-aoyama',description:'An exclusive rooftop lounge centered on an infinity pool suspended above the city, eveningwear, cocktails, and reflected skyline light.',category:'lounge',type:'venue',activities:['cocktails','pool','rooftop date','skyline view'],hours:{open:'16:00',close:'02:00'}}),
  seed({index:23,parent:3,district:'Aoyama-9',name:'Maison IX',slug:'maison-nine',description:'A fine-dining restaurant of private glass alcoves whose kitchen already knows each guest’s preferences from public biometric profiles.',category:'restaurant',type:'venue',activities:['fine dining','wine','date night','skyline view'],hours:{open:'17:00',close:'00:00'}}),
  seed({index:24,parent:3,district:'Aoyama-9',name:'Aoyama Modification Institute',slug:'aoyama-modification-institute',description:'An elite clinic for skin reconstruction, body sculpting, sensory implants, longevity treatments, and neural upgrades.',category:'healthcare',type:'venue',activities:['consultation','augmentation','recovery','wellness'],hours:{open:'08:00',close:'20:00'}}),
  seed({index:25,parent:3,district:'Aoyama-9',name:'Gallery Null',slug:'gallery-null',description:'A private gallery of neural art and synthetic performers where the distinction between exhibition and manipulation is deliberately unclear.',category:'gallery',type:'venue',activities:['art','exhibition','neural art','conversation'],hours:{open:'11:00',close:'23:00'}}),
  seed({index:26,parent:3,district:'Aoyama-9',name:'Saint',slug:'saint-aoyama',description:'A severe, luxurious members club for celebrities, executives, and old-money families, with staff who see more than guests realize.',category:'lounge',type:'venue',activities:['cocktails','networking','private dinner','people watching'],hours:{open:'18:00',close:'03:00'}}),
  seed({index:27,parent:3,district:'Aoyama-9',name:'The Atrium',slug:'the-atrium',description:'A private shopping arcade of designer fashion, jewelry, body-modification boutiques, and champagne bars where prices are rarely displayed.',category:'shopping',type:'venue',activities:['luxury shopping','fashion','champagne','body modification'],hours:{open:'10:00',close:'22:00'}}),

  seed({index:28,parent:4,district:'Akiba Undergrid',name:'ZeroDay',slug:'zeroday',description:'A basement hacker bar without cameras, facial recognition, or corporate networks, frequented by researchers, whistleblowers, and erased people.',category:'bar',type:'venue',activities:['drinks','hacking','private conversation','networking'],hours:{open:'18:00',close:'04:00'}}),
  seed({index:29,parent:4,district:'Akiba Undergrid',name:'SYN',slug:'syn-club',description:'An experimental nightclub where consenting guests synchronize music, light, and physical sensation through neural interfaces.',category:'nightlife',type:'venue',activities:['dancing','neural sync','music','nightlife'],hours:{open:'21:00',close:'05:00'}}),
  seed({index:30,parent:4,district:'Akiba Undergrid',name:'Dollhouse Robotics',slug:'dollhouse-robotics',description:'A boutique robotics company building extraordinarily lifelike synthetic companions, publicly sold as assistants despite an uneasy two-year waitlist.',category:'technology',type:'venue',activities:['robotics','tour','research','work'],hours:{open:'09:00',close:'19:00'}}),
  seed({index:31,parent:4,district:'Akiba Undergrid',name:'Dreamscape',slug:'dreamscape',description:'A neural VR lounge for shared simulations that can feel nearly physical, used for fantasy dates and escapes from difficult reality.',category:'entertainment',type:'venue',activities:['virtual reality','shared simulation','fantasy date','games'],hours:{open:'12:00',close:'04:00'}}),
  seed({index:32,parent:4,district:'Akiba Undergrid',name:'Chrome Kiss',slug:'chrome-kiss',description:'A body-modification studio known for subdermal illumination, metallic tattoos, sensory piercings, and cosmetic implants.',category:'studio',type:'venue',activities:['body modification','tattoo','consultation','fashion'],hours:{open:'12:00',close:'23:00'}}),
  seed({index:33,parent:4,district:'Akiba Undergrid',name:'The Backroom',slug:'the-backroom',description:'An illegal repair shop beneath an electronics market that fixes implants corporate clinics refuse to touch.',category:'workshop',type:'venue',activities:['implant repair','electronics','private consultation'],hours:{open:'14:00',close:'02:00'}}),
  seed({index:34,parent:4,district:'Akiba Undergrid',name:'Nova Arena',slug:'nova-arena',description:'A massive esports stadium where professional gamers are celebrities and every major match spills into an uncontrolled district party.',category:'arena',type:'venue',activities:['esports','competition','spectating','party'],hours:{open:'10:00',close:'01:00'}}),

  seed({index:35,parent:5,district:'Tsuki Blocks',name:'Tsuki Tower 17',slug:'tsuki-tower-17',description:'The player’s residential building: tiny apartments, thin walls, shared balconies, and late elevators where neighbors appear without public polish.',category:'residence',type:'residence',activities:['home','visit neighbors','shared balcony','late-night conversation']}),
  seed({index:36,parent:5,district:'Tsuki Blocks',name:'TwentyFour',slug:'twentyfour',description:'The fluorescent neighborhood convenience store where residents cross paths at 3 AM in office clothes, club outfits, and whatever they threw on.',category:'shopping',type:'venue',activities:['late shopping','instant meal','cheap drinks','chance encounter'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:37,parent:5,district:'Tsuki Blocks',name:'Laundry 9',slug:'laundry-nine',description:'A nearly automated laundromat with a vending café whose after-midnight quiet makes ordinary waiting unexpectedly intimate.',category:'laundry',type:'venue',activities:['laundry','coffee','late-night conversation','waiting'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:38,parent:5,district:'Tsuki Blocks',name:'Moonpool',slug:'moonpool',description:'A rooftop swimming pool shared by several towers, surrounded by the city and frequently almost empty after 1 AM.',category:'fitness',type:'outdoor',activities:['swimming','rooftop view','relaxation','late-night date'],hours:{open:'05:00',close:'03:00'}}),
  seed({index:39,parent:5,district:'Tsuki Blocks',name:'The Balcony',slug:'the-balcony',description:'An informal rooftop where residents bring drinks, smoke, flirt, and complain about work without anyone officially organizing it.',category:'outdoor',type:'outdoor',activities:['rooftop drinks','conversation','flirting','city view']}),
  seed({index:40,parent:5,district:'Tsuki Blocks',name:'Kumo Gym',slug:'kumo-gym',description:'A premium twenty-four-hour residential fitness club with biometric smart mirrors and a notably social late-night crowd.',category:'fitness',type:'venue',activities:['workout','class','recovery','socializing'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:41,parent:5,district:'Tsuki Blocks',name:'Quiet Hours',slug:'quiet-hours',description:'A warm basement bar without advertising or corporate payment systems, where regulars keep monthly tabs and the bartender keeps their secrets.',category:'bar',type:'venue',activities:['drinks','conversation','neighborhood gossip','late food'],hours:{open:'18:00',close:'03:00'}}),

  seed({index:42,parent:6,district:'Old Kyo / The Shade',name:'Tsukimi Shrine',slug:'tsukimi-shrine',description:'A cedar-shaded shrine where neural signals weaken near the stone-lantern courtyard and people come specifically to become unreachable.',category:'shrine',type:'landmark',activities:['quiet visit','reflection','walk','disconnect']}),
  seed({index:43,parent:6,district:'Old Kyo / The Shade',name:'Whisper Bridge',slug:'whisper-bridge',description:'A narrow wooden canal bridge where lantern reflections sit beneath the distant towers and local folklore demands honest questions.',category:'landmark',type:'landmark',activities:['canal walk','conversation','date','night view']}),
  seed({index:44,parent:6,district:'Old Kyo / The Shade',name:'Ryokan Kaze',slug:'ryokan-kaze',description:'A traditional inn of tatami rooms, private baths, paper screens, and mandatory disconnection from neural devices and advertising.',category:'hotel',type:'residence',activities:['stay','private bath','dinner','disconnect'],hours:{open:'00:00',close:'23:59'}}),
  seed({index:45,parent:6,district:'Old Kyo / The Shade',name:'Velvet Shrine',slug:'velvet-shrine',description:'A hidden invitation-only lounge inside a historic townhouse, candlelit and warm behind a shoes-off entrance.',category:'lounge',type:'venue',activities:['drinks','private conversation','date','live music'],hours:{open:'19:00',close:'02:00'}}),
  seed({index:46,parent:6,district:'Old Kyo / The Shade',name:'Koi Garden',slug:'koi-garden',description:'An old garden where augmented reality is jammed, leaving every visitor without filters, projected clothing, or synthetic makeup overlays.',category:'garden',type:'outdoor',activities:['garden walk','quiet conversation','date','disconnect']}),
  seed({index:47,parent:6,district:'Old Kyo / The Shade',name:'Soba Miyako',slug:'soba-miyako',description:'A fifteen-seat family restaurant without biometric ordering, valued by famous and ordinary guests because nobody photographs anyone inside.',category:'restaurant',type:'venue',activities:['soba','dinner','conversation','quiet meal'],hours:{open:'11:00',close:'22:00'}}),
  seed({index:48,parent:6,district:'Old Kyo / The Shade',name:'Below Kyo',slug:'below-kyo',description:'An unmapped network of abandoned pedestrian tunnels occupied by street artists, musicians, underground clubs, and unauthorized markets.',category:'underground',type:'venue',activities:['street art','live music','underground club','market','exploration']}),
  seed({index:49,parent:6,district:'Old Kyo / The Shade',name:'Paper Moon Books',slug:'paper-moon-books',description:'An independent bookshop specializing in physical books, old magazines, local history, and the kind of browsing no recommendation system can record.',category:'bookstore',type:'venue',activities:['books','reading','local history','quiet conversation'],hours:{open:'10:00',close:'21:00'}}),
  seed({index:50,parent:6,district:'Old Kyo / The Shade',name:'Lantern Street',slug:'lantern-street',description:'A preserved pedestrian street of small shops, food counters, traditional facades, and handmade lanterns beyond the reach of responsive advertising.',category:'shopping',type:'landmark',activities:['walking','shopping','street food','photography','people watching']}),
  seed({index:51,parent:6,district:'Old Kyo / The Shade',name:'Tea House Aoi',slug:'tea-house-aoi',description:'A quiet tea house with canal-facing rooms, careful service, and a strict no-recording custom respected by ordinary residents and famous guests alike.',category:'cafe',type:'venue',activities:['tea','quiet conversation','reading','date'],hours:{open:'09:00',close:'22:00'}}),
];
