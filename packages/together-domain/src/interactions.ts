/**
 * The interaction domain deliberately contains no character or venue names.
 * Content supplies places and people; this module resolves the small set of
 * actions that make sense in their shared, canonical scene.
 */

export const interactionFamilies = ['talk', 'activity', 'move', 'share', 'social', 'media', 'relationship', 'leave'] as const;
export type InteractionFamily = typeof interactionFamilies[number];

export type InteractionStage = 'stranger' | 'acquaintance' | 'friend' | 'flirting' | 'dating' | 'exclusive' | 'long_term';

export interface InteractionDefinition {
  key: string;
  family: InteractionFamily;
  labels: { default: string };
  activityTags?: string[];
  locationTypes?: string[];
  locationCategories?: string[];
  objectTags?: string[];
  durationMinutes?: number;
  requirements?: {
    minRelationshipStage?: InteractionStage;
    maxRelationshipStage?: InteractionStage;
    minAvailability?: 'open' | 'limited';
    minMetrics?: Record<string, number>;
    requiredActivityTags?: string[];
    forbiddenActivityTags?: string[];
    allowedCharacterRoles?: string[];
    contentLevel?: 'general' | 'romance';
  };
  effects?: {
    sceneActivityKey?: string;
    relationshipEvidenceType?: string;
    momentCandidate?: boolean;
    photoCandidate?: boolean;
    /** Explicit media actions may queue a photo; other actions can only offer one. */
    mediaPolicy?: 'none'|'offer'|'explicit';
    mayMoveCharacter?: boolean;
    mayExtendScene?: boolean;
    activityStateEffects?: {
      set?: Record<string, unknown>;
      increment?: Record<string, number>;
      append?: Record<string, unknown>;
    };
  };
  scoring?: { noveltyWeight?: number; personalityWeight?: number; relationshipWeight?: number; locationWeight?: number };
}

export interface InteractionCandidate {
  id: string;
  interactionKey: string;
  family: InteractionFamily;
  label: string;
  durationMinutes?: number;
  score: number;
  reasonCodes: string[];
  effects: Record<string, unknown>;
  presentation?: { subtitle?: string; iconKey?: string; emphasis?: 'normal' | 'recommended' };
}

export interface InteractionLocation {
  id: string;
  name: string;
  category?: string | null;
  locationType?: string | null;
  hours?: Record<string, unknown> | null;
  possibleActivities?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface InteractionWorld {
  id?: string;
  activityFamilies?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface CharacterInteractionProfile {
  preferredFamilies: InteractionFamily[];
  preferredActivityTags: string[];
  dislikedActivityTags: string[];
  initiative: number;
  competitiveness: number;
  curiosity: number;
  physicalActivity: number;
  nightlife: number;
  outdoors: number;
  foodInterest: number;
  creativeInterest: number;
  socialComfort: number;
  spontaneity: number;
}

export interface InteractionCharacter {
  role?: string | null;
  interests?: string[] | null;
  occupation?: string | null;
  personality?: Record<string, unknown> | null;
  relationshipConfig?: Record<string, unknown> | null;
  lifeConfig?: Record<string, unknown> | null;
  boundaries?: Record<string, unknown> | null;
}

export interface InteractionRelationship {
  stage: InteractionStage;
  trust?: number;
  comfort?: number;
  attraction?: number;
  affinity?: number;
  familiarity?: number;
  conflict?: number;
  romanceEnabled?: boolean;
}

export interface InteractionSceneState {
  id?: string;
  focus?: string | null;
  objectsInUse?: string[];
  recentActionKeys?: string[];
  selectedBy?: 'user' | 'character' | null;
  currentActivityKey?: string | null;
  activityLabel?: string | null;
  expectedEndAt?: string | null;
  activity?: Record<string, unknown>;
  lastCharacterInitiativeAt?: string | null;
  initiativeCooldownUntil?: string | null;
  pendingProposalId?: string | null;
  pendingDeparture?:{reason:string;requestedAt:string}|null;
}

export interface InteractionLife {
  availability?: 'open' | 'limited' | 'busy' | 'unavailable';
  interruptibility?: 'open' | 'limited' | 'busy' | 'unavailable';
  energy?: string | null;
  mood?: string | null;
  expectedEndAt?: string | null;
  now?: Date;
}

export interface InteractionMemoryCue { memoryId:string; type:'shared_activity'|'place_history'|'preference'|'shared_joke'|'negative_preference'; activityTags:string[]; locationId?:string; valence?:number; strength:number; interactionKey?:string; summary?:string; occurredAt?:string; }
export interface UserBehaviorPattern { patternKey:string; category:string; summary:string; confidence:number; }

export type InteractionDecisionStatus='accepted'|'countered'|'declined';
export type InteractionEvidenceType='shared_experience'|'playful_competition'|'support'|'vulnerability'|'affection'|'romantic_tension'|'conflict'|'repair'|'boundary_respected'|'boundary_ignored';
export type InteractionMetricDelta={trust?:number;comfort?:number;attraction?:number;affinity?:number;familiarity?:number;respect?:number;conflict?:number;romantic_interest?:number;commitment?:number};
export type InteractionRelationshipEvidence={type:InteractionEvidenceType;quality:number;valence:number;metricDelta:InteractionMetricDelta;reasonCodes:string[]};
export type SceneTransitionProposal=
  |{kind:'stay'}
  |{kind:'extend';minutes:number}
  |{kind:'move';destinationLocationId:string}
  |{kind:'character_departure';reason:'schedule'|'energy'|'boundary'|'scene_complete'}
  |{kind:'end';reason:'scene_complete'|'mutual_departure'};
export type CharacterInteractionDecision={decision:InteractionDecisionStatus;requestedInteractionKey:string;resolvedInteractionKey?:string;counterInteractionKey?:string;reasonCodes:string[];relationshipEvidence?:InteractionRelationshipEvidence;sceneTransition?:SceneTransitionProposal};
export type CharacterInitiativeResult=
  |{kind:'none';reasonCodes:string[]}
  |{kind:'proposal';interactionKey:string;label:string;expiresAt:string;reasonCodes:string[]};

export interface InteractionResolveInput {
  character: InteractionCharacter;
  interactionProfile?: CharacterInteractionProfile;
  relationship: InteractionRelationship;
  world?: InteractionWorld | null;
  location: InteractionLocation;
  scene?: InteractionSceneState | null;
  life?: InteractionLife | null;
  nearbyLocations?: InteractionLocation[];
  memoryCues?: InteractionMemoryCue[];
  userPatterns?: UserBehaviorPattern[];
  activePlan?: {
    id: string;
    activityKey: string;
    locationId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  };
  seed?: string;
  limit?: number;
}

const stageOrder: InteractionStage[] = ['stranger', 'acquaintance', 'friend', 'flirting', 'dating', 'exclusive', 'long_term'];
const stageIndex = (stage: string | undefined) => Math.max(0, stageOrder.indexOf(stage as InteractionStage));
const word = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : '';
const words = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Central alias registry. Client and server use this function instead of local regexes. */
const activityAliases: Record<string, string> = {
  'photo walk': 'photography', 'photography': 'photography', 'photos': 'photography', 'photo': 'photography',
  'garden walk': 'walking', 'river walk': 'walking', 'walk': 'walking', 'walking': 'walking',
  'arcade games': 'arcade', 'games': 'arcade', 'gaming': 'arcade', 'arcade': 'arcade',
  'cocktails': 'drinks', 'drink': 'drinks', 'drinks': 'drinks',
  'live music': 'live_music', 'music': 'live_music', 'karaoke': 'karaoke',
  'bookstore': 'books', 'books': 'books', 'reading': 'books',
  'gallery': 'art_gallery', 'museum': 'art_gallery', 'art': 'art_gallery',
  'gym': 'fitness', 'workout': 'fitness', 'running': 'fitness',
  'coffee': 'cafe', 'café': 'cafe', 'cafe': 'cafe',
  'food': 'restaurant', 'dinner': 'restaurant', 'lunch': 'restaurant',
  'market': 'market', 'shopping': 'shopping', 'beach': 'beach', 'hiking': 'hiking', 'hike': 'hiking',
  'camping': 'campfire', 'campfire': 'campfire', 'stargazing': 'stargazing', 'skiing': 'ski_snow', 'snow': 'ski_snow',
  'trivia': 'trivia', 'comedy': 'comedy', 'movies': 'cinema', 'movie': 'cinema',
  'sporting event': 'sports', 'sports game': 'sports', 'basketball game': 'sports', 'basketball': 'sports',
  'hockey game': 'sports', 'hockey': 'sports', 'indoor soccer': 'sports', 'soccer': 'sports', 'boxing night': 'sports', 'boxing': 'sports',
  'dancing': 'dance', 'dance': 'dance', 'nightclub': 'dance', 'climbing': 'climbing', 'bouldering': 'climbing',
  'boating': 'boating', 'sailing': 'boating', 'rowboating': 'boating', 'boat tour': 'boating',
  'spa treatment': 'spa', 'spa': 'spa', 'massage': 'spa', 'sauna': 'spa', 'bathing': 'spa', 'hot springs': 'spa',
  'hotel stay': 'lodging', 'overnight stay': 'lodging', 'lodging': 'lodging', 'laundry': 'laundry',
  'horseback riding': 'equestrian', 'trail ride': 'equestrian', 'wine tasting': 'vineyard', 'vineyard tour': 'vineyard',
  'medical appointment': 'medical', 'museum visit': 'history', 'archive research': 'history', 'sample analysis': 'research',
  'vehicle repair': 'workshop', 'equipment repair': 'workshop', 'quiet reflection': 'sacred',
};

export function normalizeActivityTag(value: string): string {
  const normalized = value.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const direct = activityAliases[normalized];
  if (direct) return direct;
  for (const [alias, canonical] of Object.entries(activityAliases)) if (normalized.includes(alias)) return canonical;
  return normalized.replace(/\s+/g, '_');
}

const packTerms: Record<string, string[]> = {
  cafe: ['cafe', 'coffee', 'pastry', 'pastries', 'bakery', 'tea house'],
  restaurant: ['restaurant', 'dinner', 'dining', 'lunch', 'brunch', 'bistro', 'diner', 'pizza', 'meal', 'meals', 'sushi'],
  bar: ['bar', 'barcade', 'cocktail', 'cocktails', 'drinks', 'pub', 'tavern', 'lounge', 'roadhouse'],
  karaoke: ['karaoke'],
  live_music: ['live music', 'concert', 'music venue', 'music_venue', 'open mic', 'records', 'listening'],
  dance: ['dance', 'dancing', 'nightclub', 'nightlife', 'dance club', 'cabaret'],
  arcade: ['arcade', 'barcade', 'gaming', 'games', 'esports', 'virtual reality', 'neural games'],
  cinema: ['cinema', 'movie', 'movies', 'film', 'screening', 'screenings'],
  books: ['book', 'books', 'bookstore', 'library', 'rare book', 'rare books'],
  art_gallery: ['gallery', 'museum', 'art', 'exhibition', 'exhibitions', 'ceramics', 'painting'],
  fitness: ['fitness', 'gym', 'workout', 'running', 'training', 'yoga', 'pilates'],
  climbing: ['climbing', 'bouldering', 'climbing gym'],
  market: ['market', 'bazaar', 'food stalls', 'market stalls'],
  shopping: ['shopping', 'boutique', 'groceries', 'gifts', 'fashion', 'styling'],
  park: ['park', 'garden', 'botanical', 'picnic', 'outdoor', 'outdoors', 'plaza'],
  scenic: ['riverwalk', 'waterfront', 'overlook', 'scenic', 'views', 'viewing', 'sunset', 'pier', 'dock', 'waterfall'],
  hiking: ['hiking', 'hike', 'trails', 'trailhead', 'snowshoeing', 'mountain biking', 'backcountry access'],
  beach: ['beach', 'coast', 'shore', 'sunbathing', 'cove'],
  water_activity: ['water activity', 'swimming', 'swim', 'snorkel', 'snorkeling', 'kayak', 'kayaking', 'paddleboard', 'paddling'],
  boating: ['boating', 'boat', 'boats', 'sailing', 'marina', 'boathouse', 'rowboating', 'boat charter', 'lake excursion'],
  spa: ['spa', 'sauna', 'massage', 'bathing', 'bathhouse', 'baths', 'hot springs', 'hot spring', 'warm pool', 'spa treatment'],
  lodging: ['lodging', 'hotel', 'inn', 'lodge', 'cabins', 'cabin stay', 'cabin stays', 'overnight stay', 'overnight stays', 'retreat', 'ryokan'],
  home: ['home', 'apartment', 'residence', 'dormitory'],
  workplace: ['workplace', 'work', 'studio', 'office', 'workspace', 'shift work'],
  workshop: ['workshop', 'garage', 'fabrication', 'repair', 'repairs', 'maintenance', 'mechanical work', 'tuning workshop'],
  research: ['research', 'laboratory', 'lab', 'academic', 'science', 'analysis', 'forecasting', 'specimen', 'observation'],
  education: ['education', 'school', 'college', 'university', 'lecture', 'classes', 'study', 'campus'],
  medical: ['medical', 'medicine', 'healthcare', 'clinic', 'hospital', 'pharmacy', 'medical care', 'medical appointment'],
  civic: ['civic', 'city hall', 'town hall', 'public service', 'public_service', 'community hall', 'union hall', 'public meeting', 'public debate'],
  sacred: ['sacred', 'chapel', 'shrine', 'ritual site', 'cloister', 'candle lighting', 'quiet reflection'],
  history: ['history', 'historic', 'heritage', 'museum', 'ruin', 'ruins', 'archive', 'archives', 'artifact', 'artifacts', 'old architecture'],
  exploration: ['exploration', 'investigation', 'urban exploration', 'crypt visit', 'subsurface surveys', 'flooded tunnels', 'underground'],
  equestrian: ['equestrian', 'stables', 'horseback riding', 'trail rides', 'riding club'],
  laundry: ['laundry', 'laundromat'],
  vineyard: ['vineyard', 'wine tasting', 'winery'],
  transit: ['transit', 'station', 'train', 'gondola', 'spaceport', 'commute', 'arrivals', 'departures'],
  district: ['district', 'neighborhood'],
  theater: ['theater', 'theatre', 'show', 'shows', 'formal dances'],
  cooking: ['cooking', 'kitchen', 'recipe'],
  campfire: ['campfire', 'cabin', 'fireside'],
  stargazing: ['stargazing', 'observatory', 'astronomy', 'constellations', 'aurora watching'],
  ski_snow: ['ski', 'skiing', 'snow', 'snowboarding', 'powder runs', 'glade skiing', 'nordic center', 'cross country skiing'],
  night_market: ['night market'],
  photography: ['photography', 'photo', 'photos', 'portrait session'],
  trivia: ['trivia'],
  comedy: ['comedy'],
  sports: ['sports', 'sporting event', 'arena', 'basketball', 'hockey', 'soccer', 'boxing', 'spectating'],
};

export type InteractionPack = keyof typeof packTerms;

function packSource(values: unknown[]) {
  return ` ${values.map(word).join(' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function sourceHasPackTerm(source: string, term: string) {
  const normalized = term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Boolean(normalized) && source.includes(` ${normalized} `);
}

export function inferInteractionPacks(location: InteractionLocation, world?: InteractionWorld | null): InteractionPack[] {
  // World activity families describe the directory as a whole, not what can
  // physically happen inside this individual location.
  void world;
  const metadata = location.metadata ?? {};
  const explicit = [...words(metadata['interactionPacks']), ...words(metadata['interaction_packs'])].map((item) => normalizeActivityTag(item));
  const broadArea = location.locationType === 'district' || location.locationType === 'neighborhood';
  const source = packSource([location.category, location.locationType, ...(broadArea ? [] : [...words(metadata['tags']), ...(location.possibleActivities ?? [])])]);
  const packs = new Set<InteractionPack>();
  for (const item of explicit) if (item in packTerms) packs.add(item);
  for (const [pack, terms] of Object.entries(packTerms)) if (terms.some((term) => sourceHasPackTerm(source, term))) packs.add(pack);
  if (location.locationType === 'residence' && !packs.has('lodging')) packs.add('home');
  if (location.locationType === 'transit') packs.add('transit');
  if (location.locationType === 'district' || location.locationType === 'neighborhood') packs.add('district');
  if (location.locationType === 'landmark' && !packs.size) packs.add('scenic');
  if (location.locationType === 'outdoor' && !packs.size) packs.add('park');
  if (!packs.size) packs.add('district');
  return [...packs];
}

const definition = (key: string, family: InteractionFamily, label: string, tags: string[], durationMinutes: number, effects: InteractionDefinition['effects'] = {}, requirements?: InteractionDefinition['requirements']): InteractionDefinition => ({ key, family, labels: { default: label }, activityTags: tags, durationMinutes, effects: { ...effects, ...(effects.photoCandidate && !effects.mediaPolicy ? { mediaPolicy: family === 'media' ? 'explicit' : 'offer' as const } : {}) }, ...(requirements ? { requirements } : {}), scoring: { noveltyWeight: .35, personalityWeight: .45, relationshipWeight: .2, locationWeight: .5 } });
const pack = (prefix: string, entries: Array<[InteractionFamily, string, string[], number, InteractionDefinition['effects']?, InteractionDefinition['requirements']?]>): InteractionDefinition[] => entries.map(([family, label, tags, duration, effects, requirements]) => definition(`${prefix}.${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`, family, label, tags, duration, effects, requirements));

// Packs are composable. A location can inherit as many as its data supports.
export const interactionPacks: Record<InteractionPack, InteractionDefinition[]> = {
  cafe: pack('cafe', [['activity','Sit together',['cafe'],20,{sceneActivityKey:'coffee_together'}],['activity','Order something',['cafe','food'],8],['share','Share something',['cafe'],5],['talk','Ask what they are working on',['workplace','creative'],5],['social','People-watch',['cafe','social'],15],['activity','Stay a little longer',['cafe'],20,{mayExtendScene:true}]]),
  restaurant: pack('restaurant', [['activity','Look at the menu',['restaurant','food'],8],['activity','Let them choose',['restaurant','food'],6],['share','Pick something for each other',['restaurant','food'],8],['activity','Share food',['restaurant','food'],15],['relationship','Order dessert',['restaurant','food'],20,{}, {minRelationshipStage:'friend'}],['social','Toast together',['restaurant','drinks'],5,{relationshipEvidenceType:'shared_experience'}, {minRelationshipStage:'friend'}]]),
  bar: pack('bar', [['activity','Grab a drink',['bar','drinks'],12,{sceneActivityKey:'drinks'}],['activity','Let them choose for you',['bar','drinks'],8],['activity','Find a booth',['bar','social'],10],['social','Use the jukebox',['bar','live_music'],6],['social','Toast together',['bar','drinks'],5,{relationshipEvidenceType:'shared_experience'}],['move','Go somewhere quieter',['bar'],12,{mayMoveCharacter:true}]]),
  karaoke: pack('karaoke', [['activity','Pick a song',['karaoke'],6,{sceneActivityKey:'karaoke',mayExtendScene:true}],['activity','Sing together',['karaoke'],8,{sceneActivityKey:'karaoke',relationshipEvidenceType:'shared_experience',photoCandidate:true,momentCandidate:true},{minRelationshipStage:'friend'}],['activity','Let them pick your song',['karaoke'],5,{sceneActivityKey:'karaoke'}],['social','Cheer them on',['karaoke'],7,{sceneActivityKey:'karaoke'}],['activity','Do another song',['karaoke'],8,{sceneActivityKey:'karaoke',mayExtendScene:true}]]),
  live_music: pack('live_music', [['activity','Find a spot together',['live_music'],8],['social','Talk about the set',['live_music','music'],6],['activity','Stay for another song',['live_music'],7,{mayExtendScene:true}],['media','Take a photo together',['live_music','photography'],4,{photoCandidate:true,momentCandidate:true}],['move','Step outside for a minute',['live_music'],8,{mayMoveCharacter:true}]]),
  dance: pack('dance', [['activity','Dance together',['dance'],18,{sceneActivityKey:'dancing',relationshipEvidenceType:'shared_experience'}],['activity','Let them lead',['dance'],12,{sceneActivityKey:'dancing'}],['social','Find a quieter corner',['dance'],8],['activity','Take a breather together',['dance'],8],['relationship','Share a slow dance',['dance'],14,{relationshipEvidenceType:'romantic_tension',momentCandidate:true},{minRelationshipStage:'friend',contentLevel:'romance'}],['relationship','Turn up the flirting',['dance'],10,{relationshipEvidenceType:'romantic_tension'},{minRelationshipStage:'flirting',contentLevel:'romance'}]]),
  arcade: pack('arcade', [['activity','Challenge them',['arcade'],8,{sceneActivityKey:'arcade_game'}],['activity','Pick a co-op game',['arcade'],10,{sceneActivityKey:'arcade_game'}],['social','Ask for a rematch',['arcade'],8,{sceneActivityKey:'arcade_game'}],['social','Raise the stakes playfully',['arcade'],5,{relationshipEvidenceType:'shared_experience'},{minRelationshipStage:'friend'}],['activity','Visit the prize counter',['arcade'],6]]),
  cinema: pack('cinema', [['activity','Pick a movie',['cinema'],8,{sceneActivityKey:'cinema',activityStateEffects:{set:{phase:'choosing_movie',moviePickedBy:'user',stayedForCredits:false}}}],['activity','Share snacks',['cinema','food'],6],['talk','Talk before it starts',['cinema'],8],['activity','Stay for the credits',['cinema'],10,{mayExtendScene:true,sceneActivityKey:'cinema',activityStateEffects:{set:{phase:'credits',stayedForCredits:true}}}],['relationship','Talk about the ending',['cinema'],12,{relationshipEvidenceType:'shared_experience'}]]),
  books: pack('books', [['activity','Browse together',['books'],18],['share','Recommend something',['books'],8],['share','Pick a book for them',['books'],8],['activity','Read a passage',['books'],6],['activity','Sit with coffee',['books','cafe'],20]]),
  art_gallery: pack('art_gallery', [['activity','Pick a favorite',['art_gallery'],8],['talk','Ask what they see in it',['art_gallery'],8],['social','Disagree about a piece',['art_gallery'],9],['move','Move to another room',['art_gallery'],7,{mayMoveCharacter:true}],['media','Take a photo together',['art_gallery','photography'],4,{photoCandidate:true}]]),
  fitness: pack('fitness', [['activity','Work out together',['fitness'],30,{sceneActivityKey:'fitness'}],['activity','Set a small challenge',['fitness'],10,{sceneActivityKey:'fitness'}],['social','Cool down together',['fitness'],12],['talk','Ask about their routine',['fitness'],6]]),
  climbing: pack('climbing', [['activity','Choose a route',['climbing'],8,{sceneActivityKey:'climbing'}],['activity','Climb side by side',['climbing'],24,{sceneActivityKey:'climbing',relationshipEvidenceType:'shared_experience'}],['activity','Try a bouldering problem',['climbing'],15,{sceneActivityKey:'climbing'}],['social','Set a playful challenge',['climbing'],10],['activity','Take a chalk break',['climbing'],8],['relationship','Trust them on belay',['climbing'],18,{relationshipEvidenceType:'support'},{minRelationshipStage:'friend'}]]),
  market: pack('market', [['activity','Browse the stalls',['market'],20],['activity','Try something new',['market','food'],10],['share','Pick out something together',['market','shopping'],12],['media','Take a photo together',['market','photography'],4,{photoCandidate:true}]]),
  shopping: pack('shopping', [['activity','Browse together',['shopping'],20],['share','Ask their opinion',['shopping'],6],['activity','Pick something for each other',['shopping'],10],['activity','Find somewhere to sit',['shopping'],12]]),
  park: pack('park', [['activity','Walk together',['park','walking'],24,{sceneActivityKey:'walking'}],['activity','Choose a path',['park','walking'],10],['activity','Sit down',['park'],15],['social','People-watch',['park'],15],['media','Take photos',['park','photography'],8,{photoCandidate:true,momentCandidate:true}],['activity','Have a picnic',['park','food'],35,{relationshipEvidenceType:'shared_experience'}]]),
  scenic: pack('scenic', [['activity','Take in the view',['scenic'],12],['activity','Walk together',['scenic','walking'],24,{sceneActivityKey:'walking'}],['media','Take a photo together',['scenic','photography'],5,{photoCandidate:true,momentCandidate:true}],['relationship','Stay for sunset',['scenic'],30,{relationshipEvidenceType:'shared_experience',momentCandidate:true},{minRelationshipStage:'friend'}]]),
  hiking: pack('hiking', [['activity','Choose the next trail',['hiking'],12],['activity','Keep walking',['hiking'],35,{sceneActivityKey:'hiking',mayExtendScene:true}],['activity','Take a break',['hiking'],15],['media','Take a photo together',['hiking','photography'],5,{photoCandidate:true,momentCandidate:true}],['move','Head back before dark',['hiking'],18,{mayMoveCharacter:true}]]),
  beach: pack('beach', [['activity','Walk along the water',['beach','walking'],25,{sceneActivityKey:'beach_walk'}],['activity','Find a spot',['beach'],10],['activity','Watch the sunset',['beach','scenic'],30,{momentCandidate:true}],['media','Take a photo together',['beach','photography'],5,{photoCandidate:true,momentCandidate:true}]]),
  water_activity: pack('water_activity', [['activity','Try the water',['water_activity'],30,{sceneActivityKey:'water_activity'}],['activity','Rent something together',['water_activity'],20],['activity','Sit by the water',['water_activity','scenic'],18],['media','Take a photo together',['water_activity','photography'],5,{photoCandidate:true}]]),
  boating: pack('boating', [['activity','Walk the docks',['boating'],12],['activity','Choose a boat',['boating'],8],['activity','Take a short sail',['boating'],35,{sceneActivityKey:'boating',relationshipEvidenceType:'shared_experience'}],['activity','Help with the lines',['boating'],10],['social','Trade stories on the water',['boating'],16],['relationship','Stay out for sunset',['boating','scenic'],28,{momentCandidate:true,relationshipEvidenceType:'romantic_tension'},{minRelationshipStage:'friend',contentLevel:'romance'}]]),
  spa: pack('spa', [['activity','Choose a treatment',['spa'],8,{sceneActivityKey:'spa'}],['activity','Try the sauna circuit',['spa'],20,{sceneActivityKey:'spa'}],['activity','Unwind in the warm pool',['spa'],24,{sceneActivityKey:'spa'}],['activity','Rest in the quiet lounge',['spa'],18],['talk','Talk somewhere peaceful',['spa'],14],['relationship','Book a couples treatment',['spa'],35,{relationshipEvidenceType:'affection'},{minRelationshipStage:'dating',contentLevel:'romance'}],['relationship','Share a private soak',['spa'],30,{relationshipEvidenceType:'romantic_tension',momentCandidate:true},{minRelationshipStage:'dating',contentLevel:'romance'}]]),
  lodging: pack('lodging', [['activity','Check in together',['lodging'],10,{sceneActivityKey:'hotel_stay'}],['activity','Explore the grounds',['lodging'],18],['activity','Order room service',['lodging','restaurant'],25],['social','Have a lobby drink',['lodging','bar'],14],['activity','Plan a slow morning',['lodging'],12],['relationship','Make it a private night in',['lodging'],35,{relationshipEvidenceType:'affection',momentCandidate:true},{minRelationshipStage:'dating',contentLevel:'romance'}]]),
  home: pack('home', [['activity','Put something on',['home','cinema'],20,{sceneActivityKey:'at_home'}],['activity','Cook together',['home','cooking'],45,{relationshipEvidenceType:'shared_experience'},{minRelationshipStage:'friend'}],['social','Choose music',['home','live_music'],8],['share','Look through photos',['home','photography'],14],['activity','Relax together',['home'],25]],),
  workplace: pack('workplace', [['talk','Ask what they are working on',['workplace'],6],['activity','Look at the project',['workplace','creative'],10],['share','Give an opinion',['workplace'],7],['activity','Bring coffee',['workplace','cafe'],8],['activity','Wait until they are done',['workplace'],15]]),
  workshop: pack('workshop', [['activity','Look over the project',['workshop'],8],['activity','Lend a hand',['workshop'],14,{sceneActivityKey:'workshop'}],['talk','Ask how it works',['workshop'],7],['activity','Test the repair',['workshop'],12],['social','Compare approaches',['workshop'],10],['activity','Take a break from the bench',['workshop'],10]]),
  research: pack('research', [['activity','Compare observations',['research'],10,{sceneActivityKey:'research'}],['activity','Inspect a curious detail',['research'],12,{sceneActivityKey:'research'}],['talk','Ask what does not add up',['research'],8],['activity','Follow a promising lead',['research'],18,{sceneActivityKey:'research'}],['share','Record the finding together',['research'],10],['relationship','Stay for the late shift',['research'],24,{relationshipEvidenceType:'shared_experience'},{minRelationshipStage:'friend'}]]),
  education: pack('education', [['activity','Study together',['education'],20,{sceneActivityKey:'studying'}],['activity','Sit in on a class',['education'],30],['share','Trade notes',['education'],8],['talk','Ask what they are learning',['education'],7],['activity','Find a quiet study spot',['education'],12],['social','Explore the campus',['education'],18]]),
  medical: pack('medical', [['activity','Check in together',['medical'],8],['activity','Wait with them',['medical'],16,{relationshipEvidenceType:'support'}],['share','Bring something comforting',['medical'],8,{relationshipEvidenceType:'support'},{minRelationshipStage:'friend'}],['talk','Talk quietly while you wait',['medical'],10],['activity','Take a restorative break',['medical'],12]]),
  civic: pack('civic', [['activity','See what is happening',['civic'],10],['activity','Browse the public exhibits',['civic','history'],12],['talk','Ask what the issue means locally',['civic'],10],['social','Sit in on the discussion',['civic'],18],['activity','Handle an errand together',['civic'],12],['move','Step outside to talk',['civic'],8,{mayMoveCharacter:true}]]),
  sacred: pack('sacred', [['activity','Sit in quiet reflection',['sacred'],14],['activity','Light a candle',['sacred'],6],['activity','Study the old architecture',['sacred','history'],12],['talk','Ask what this place means to them',['sacred'],10],['activity','Walk the grounds quietly',['sacred'],16]]),
  history: pack('history', [['activity','Take a closer look',['history'],10],['activity','Follow the local story',['history'],14],['talk','Ask what they remember about it',['history'],9],['activity','Browse the exhibits',['history'],18],['share','Choose one detail to remember',['history'],7],['media','Take a respectful photo',['history','photography'],5,{photoCandidate:true}]]),
  exploration: pack('exploration', [['activity','Inspect the surroundings',['exploration'],10,{sceneActivityKey:'exploring'}],['activity','Follow a clue',['exploration'],15,{sceneActivityKey:'exploring'}],['activity','Map the route together',['exploration'],12],['talk','Compare theories',['exploration'],10],['activity','Choose how far to go',['exploration'],8],['move','Turn back together',['exploration'],10,{mayMoveCharacter:true}]]),
  equestrian: pack('equestrian', [['activity','Visit the stables',['equestrian'],10],['activity','Take a riding lesson',['equestrian'],28,{sceneActivityKey:'horseback_riding'}],['activity','Help groom a horse',['equestrian'],14],['activity','Ride out together',['equestrian'],35,{sceneActivityKey:'horseback_riding',relationshipEvidenceType:'shared_experience'}],['social','Choose a gentle trail',['equestrian'],10]]),
  laundry: pack('laundry', [['activity','Start a load',['laundry'],6,{sceneActivityKey:'laundry'}],['activity','Fold clothes together',['laundry'],14,{sceneActivityKey:'laundry'}],['activity','Get coffee while you wait',['laundry','cafe'],12],['social','People-watch through a cycle',['laundry'],12],['talk','Talk while the machines run',['laundry'],16]]),
  vineyard: pack('vineyard', [['activity','Taste the current pour',['vineyard'],12,{sceneActivityKey:'wine_tasting'}],['activity','Walk through the vines',['vineyard','scenic'],20],['activity','Take the cellar tour',['vineyard'],18],['share','Choose a bottle together',['vineyard'],10],['activity','Stay for a long lunch',['vineyard','restaurant'],30],['relationship','Wander the vines at sunset',['vineyard','scenic'],25,{momentCandidate:true,relationshipEvidenceType:'romantic_tension'},{minRelationshipStage:'friend',contentLevel:'romance'}]]),
  transit: pack('transit', [['activity','Ride together',['transit'],18,{sceneActivityKey:'transit'}],['activity','Choose a stop',['transit'],6,{mayMoveCharacter:true}],['activity','Wait together',['transit'],10],['social','People-watch',['transit'],10],['relationship','Make a last-train decision',['transit'],7,{relationshipEvidenceType:'shared_experience'}]]),
  district: pack('district', [['activity','Explore together',['district','walking'],20,{sceneActivityKey:'exploring'}],['talk','Ask where they want to go',['district'],5],['move','Find somewhere nearby',['district'],8,{mayMoveCharacter:true}],['social','Take a slower walk',['district','walking'],18]]),
  theater: pack('theater', [['activity','Choose a show',['theater'],8],['activity','Find your seats',['theater'],7],['talk','Talk at intermission',['theater'],10],['relationship','Stay after to talk about it',['theater'],15,{relationshipEvidenceType:'shared_experience'}]]),
  cooking: pack('cooking', [['activity','Cook together',['cooking'],45,{sceneActivityKey:'cooking',relationshipEvidenceType:'shared_experience'}],['activity','Pick a recipe',['cooking'],8],['share','Taste-test together',['cooking'],10],['social','Clean up together',['cooking'],12]]),
  campfire: pack('campfire', [['activity','Build up the fire',['campfire'],10],['activity','Make something warm',['campfire','food'],12],['talk','Tell a story',['campfire'],16],['relationship','Stay out a little longer',['campfire'],25,{momentCandidate:true,relationshipEvidenceType:'shared_experience'},{minRelationshipStage:'friend'}]]),
  stargazing: pack('stargazing', [['activity','Look for constellations',['stargazing'],16],['activity','Make a wish',['stargazing'],6],['talk','Talk about something real',['stargazing'],18,{relationshipEvidenceType:'meaningful_conversation'}],['media','Take a photo together',['stargazing','photography'],5,{photoCandidate:true,momentCandidate:true}]]),
  ski_snow: pack('ski_snow', [['activity','Choose a run',['ski_snow'],8],['activity','Warm up together',['ski_snow'],15],['activity','Take a break',['ski_snow'],12],['media','Take a photo together',['ski_snow','photography'],5,{photoCandidate:true}]]),
  night_market: pack('night_market', [['activity','Browse the stalls',['night_market','market'],20],['activity','Try a late snack',['night_market','food'],10],['share','Pick something for each other',['night_market','shopping'],10],['media','Take a photo together',['night_market','photography'],5,{photoCandidate:true}]]),
  photography: pack('photography', [['activity','Ask what caught their eye',['photography'],6],['activity','Help frame a shot',['photography'],8],['activity','Take a photo together',['photography'],5,{photoCandidate:true,momentCandidate:true}],['activity','Walk until something interesting appears',['photography','walking'],20,{sceneActivityKey:'photography'}]]),
  trivia: pack('trivia', [['activity','Join the team',['trivia'],12,{sceneActivityKey:'trivia'}],['social','Choose a category',['trivia'],5],['social','Compare answers',['trivia'],6],['activity','Celebrate a good round',['trivia'],5,{relationshipEvidenceType:'shared_experience'}]]),
  comedy: pack('comedy', [['activity','Find a table',['comedy'],8],['activity','Watch the set',['comedy'],20],['social','Trade reactions',['comedy'],6],['relationship','Stay to talk after',['comedy'],12,{relationshipEvidenceType:'shared_experience'}]]),
  sports: pack('sports', [['activity','Find your section',['sports'],10,{sceneActivityKey:'arena_event'}],['social','Pick a side',['sports'],6],['social','Call the next play',['sports'],6],['share','Grab arena food',['sports','food'],12],['talk','React to the replay',['sports'],7],['media','Take a concourse photo',['sports','photography'],5,{photoCandidate:true,momentCandidate:true,mediaPolicy:'explicit'}],['relationship','Stay for the finish',['sports'],20,{mayExtendScene:true,relationshipEvidenceType:'shared_experience'}]]),
};

const allDefinitions = Object.values(interactionPacks).flat();
export const interactionDefinitions = new Map(allDefinitions.map((item) => [item.key, item]));

export function deriveCharacterInteractionProfile(character: InteractionCharacter): CharacterInteractionProfile {
  const personality = character.personality ?? {};
  const relationship = character.relationshipConfig ?? {};
  const life = character.lifeConfig ?? {};
  const interests = (character.interests ?? []).map(normalizeActivityTag);
  const text = `${interests.join(' ')} ${word(character.occupation)} ${JSON.stringify(life)}`.toLowerCase();
  const numeric = (keys: string[], fallback: number) => clamp(keys.map((key) => Number(personality[key] ?? relationship[key] ?? life[key])).find(Number.isFinite) ?? fallback);
  const affinity = (terms: string[]) => clamp(terms.some((term) => text.includes(term)) ? .82 : .34);
  const profile: CharacterInteractionProfile = {
    preferredFamilies: ['talk', 'activity', 'social'],
    preferredActivityTags: interests,
    dislikedActivityTags: words((character.boundaries ?? {})['dislikedActivities']).map(normalizeActivityTag),
    initiative: numeric(['initiative', 'directness'], .5), competitiveness: numeric(['competitiveness'], affinity(['arcade', 'game', 'sport', 'trivia'])), curiosity: numeric(['curiosity', 'openness'], .55),
    physicalActivity: affinity(['fitness', 'run', 'hiking', 'outdoor', 'ski']), nightlife: affinity(['nightlife', 'bar', 'music', 'karaoke', 'dance']), outdoors: affinity(['outdoor', 'hiking', 'park', 'beach', 'nature']),
    foodInterest: affinity(['food', 'cooking', 'restaurant', 'coffee']), creativeInterest: affinity(['photo', 'art', 'design', 'music', 'book']), socialComfort: numeric(['socialEnergy', 'social_energy', 'warmth'], .55), spontaneity: numeric(['spontaneity'], .5),
  };
  if (profile.creativeInterest > .7) profile.preferredFamilies.push('media');
  if (profile.socialComfort > .7) profile.preferredFamilies.push('social');
  return profile;
}

export function resolveInteractions(input: InteractionResolveInput): InteractionCandidate[] {
  const profile = input.interactionProfile ?? deriveCharacterInteractionProfile(input.character);
  const packs = inferInteractionPacks(input.location, input.world);
  const source = packs.flatMap((item) => interactionPacks[item] ?? []);
  const recent = input.scene?.recentActionKeys ?? [];
  const life = input.life ?? {};
  const availableMinutes = life.expectedEndAt ? Math.max(0, (new Date(life.expectedEndAt).getTime() - (life.now ?? new Date()).getTime()) / 60000) : Infinity;
  const results = source.flatMap((definition) => {
    const eligibility = interactionEligible(definition, input, profile, availableMinutes);
    if (!eligibility.eligible) return [];
    const tags = definition.activityTags ?? [];
    const repetition = recent.slice(-5).filter((key) => key === definition.key).length * .85 + (recent.slice(-2).some((key) => key === definition.key) ? .45 : 0);
    const locationFit = tags.some((tag) => packs.includes(tag)) ? .58 : .26;
    const preferenceFit = tags.reduce((score, tag) => score + tagProfileFit(tag, profile), 0) / Math.max(1, tags.length);
    const relationshipFit = interactionRelationshipFit(definition, input.relationship);
    const moodScore = moodFit(tags, life.mood, life.energy);
    const stableNoise = (stableHash(`${input.seed ?? input.location.id}:${definition.key}:${recent.join('|')}`) % 17) / 500;
    const memory = memoryInteractionFit(definition,input);
    const planFit = planActivityFit(input.activePlan, definition, input.scene);
    const score = Math.max(0, locationFit + preferenceFit * .52 + relationshipFit * .22 + moodScore * .12 + memory.score + stableNoise + planFit.score - repetition);
    const label=contextualInteractionLabel(definition,memory);
    return [{
      id: definition.key, interactionKey: definition.key, family: definition.family, label, ...(definition.durationMinutes !== undefined ? { durationMinutes: definition.durationMinutes } : {}),
      score, reasonCodes: [...eligibility.reasons, locationFit > .5 ? 'location_match' : 'location_flexible', preferenceFit > .62 ? 'character_fit' : 'variety', ...memory.reasonCodes, ...planFit.reasonCodes, repetition ? 'repetition_penalty' : 'fresh'],
      effects: { ...(definition.effects ?? {}) }, presentation: { ...(memory.reasonCodes.some((reason)=>['shared_activity','place_history','user_preference','user_pattern'].includes(reason))?{subtitle:'A familiar choice'}:{}), iconKey: definition.family, emphasis: score > .95 ? 'recommended' as const : 'normal' as const },
    }];
  });
  const chained = applyActionChains(results, input.scene, packs);
  const unique = new Map<string, InteractionCandidate>();
  for (const candidate of chained.sort((left, right) => right.score - left.score || left.interactionKey.localeCompare(right.interactionKey))) if (!unique.has(candidate.interactionKey)) unique.set(candidate.interactionKey, candidate);
  const ordered = [...unique.values()].sort((left, right) => right.score - left.score || left.interactionKey.localeCompare(right.interactionKey));
  // Preserve the strongest overall candidates while reserving room for each
  // compatible pack. A park that also supports photography should not bury
  // every photo interaction beneath five slightly different walking options.
  const candidates: InteractionCandidate[] = [];
  for (const interactionPack of packs) {
    const compatible = ordered.find((candidate) => !candidates.some((chosen) => chosen.id === candidate.id) && (interactionDefinition(candidate.interactionKey)?.activityTags ?? []).includes(interactionPack));
    if (compatible) candidates.push(compatible);
    if (candidates.length >= (input.limit ?? 5)) break;
  }
  for (const candidate of ordered) {
    if (candidates.length >= (input.limit ?? 5)) break;
    if (!candidates.some((chosen) => chosen.id === candidate.id)) candidates.push(candidate);
  }
  return candidates.length ? candidates : fallbackInteractions(input, availableMinutes);
}

export function deriveInteractionRelationshipEvidence(candidate:Pick<InteractionCandidate,'interactionKey'|'family'|'effects'>,relationship:InteractionRelationship,recentSameInteractionCount=0):InteractionRelationshipEvidence|null{
  const rawEvidenceType=candidate.effects['relationshipEvidenceType'];
  const requested=typeof rawEvidenceType==='string'?rawEvidenceType:'';
  const key=candidate.interactionKey;
  let type:InteractionEvidenceType|null=normalizeEvidenceType(requested);
  if(!type&&candidate.effects['momentCandidate']===true)type='shared_experience';
  if(!type&&/challenge|rematch|trivia|pick_a_side|call_the_next_play/.test(key))type='playful_competition';
  if(!type&&/cheer|bring_coffee|help_/.test(key))type='support';
  if(!type)return null;
  const repetitionMultiplier=recentSameInteractionCount>=4?0:recentSameInteractionCount===3?.2:recentSameInteractionCount===2?.45:recentSameInteractionCount===1?.7:1;
  const baseQuality=candidate.effects['momentCandidate']===true?.72:type==='vulnerability'||type==='repair'?.66:.48;
  const quality=roundInteraction(baseQuality*repetitionMultiplier);
  const romantic=relationship.romanceEnabled!==false&&['flirting','dating','exclusive','long_term'].includes(relationship.stage);
  const metricDelta=interactionMetricDelta(type,quality,romantic);
  return{type,quality,valence:type==='conflict'||type==='boundary_ignored'?-.55:.45,metricDelta,reasonCodes:[`evidence_${type}`,...(recentSameInteractionCount?['diminishing_returns']:[]),...(romantic?['romance_context']:[])]};
}

export function resolveCharacterInteractionDecision(input:{candidate:InteractionCandidate;candidates:InteractionCandidate[];profile:CharacterInteractionProfile;relationship:InteractionRelationship;life?:InteractionLife|null;scene?:InteractionSceneState|null;seed?:string;recentSameInteractionCount?:number}):CharacterInteractionDecision{
  const{candidate,profile,relationship}=input,recentSame=input.recentSameInteractionCount??input.scene?.recentActionKeys?.filter((key)=>key===candidate.interactionKey).length??0;
  const tags=(interactionDefinition(candidate.interactionKey)?.activityTags??[]).map(normalizeActivityTag);
  const lifeLevelValue=lifeLevel(input.life),energy=word(input.life?.energy),physical=tags.some((tag)=>['fitness','hiking','ski_snow','water_activity'].includes(tag));
  const evidence=deriveInteractionRelationshipEvidence(candidate,relationship,recentSame);
  if(lifeLevelValue==='unavailable'||lifeLevelValue==='busy')return{decision:'declined',requestedInteractionKey:candidate.interactionKey,reasonCodes:['not_interruptible'],...(evidence?{relationshipEvidence:{type:'boundary_respected',quality:.28,valence:.2,metricDelta:{respect:1},reasonCodes:['availability_respected']}}:{})};
  if(tags.some((tag)=>profile.dislikedActivityTags.includes(tag)))return{decision:'declined',requestedInteractionKey:candidate.interactionKey,reasonCodes:['character_boundary'],sceneTransition:{kind:'stay'}};
  const alternatives=input.candidates.filter((item)=>item.interactionKey!==candidate.interactionKey&&item.family!=='leave'&&item.family!=='move');
  const counter=alternatives.find((item)=>{
    const alternativeTags=interactionDefinition(item.interactionKey)?.activityTags??[];
    return alternativeTags.some((tag)=>tagProfileFit(normalizeActivityTag(tag),profile)>.62)&&!input.scene?.recentActionKeys?.slice(-2).includes(item.interactionKey);
  })??alternatives[0];
  if((physical&&/low|tired|exhaust/.test(energy))||recentSame>=3){
    if(counter)return{decision:'countered',requestedInteractionKey:candidate.interactionKey,counterInteractionKey:counter.interactionKey,reasonCodes:[physical?'energy_mismatch':'repetition_limit','counteroffered'],sceneTransition:{kind:'stay'}};
    return{decision:'declined',requestedInteractionKey:candidate.interactionKey,reasonCodes:[physical?'energy_mismatch':'repetition_limit'],sceneTransition:{kind:'stay'}};
  }
  const preference=tags.length?tags.reduce((sum,tag)=>sum+tagProfileFit(tag,profile),0)/tags.length:.5;
  const comfort=Math.max(0,Math.min(1,Number(relationship.comfort??35)/100));
  const probability=Math.max(.25,Math.min(.98,.5+preference*.28+comfort*.14+(lifeLevelValue==='limited'?-.12:0)));
  const roll=(stableHash(`${input.seed??'interaction-decision'}:${candidate.interactionKey}:${input.scene?.recentActionKeys?.join('|')??''}`)%10000)/10000;
  if(roll>probability){
    if(counter)return{decision:'countered',requestedInteractionKey:candidate.interactionKey,counterInteractionKey:counter.interactionKey,reasonCodes:['character_preference','counteroffered'],sceneTransition:{kind:'stay'}};
    return{decision:'declined',requestedInteractionKey:candidate.interactionKey,reasonCodes:['character_preference'],sceneTransition:{kind:'stay'}};
  }
  const transition=resolveSceneTransition({candidate,...(input.life!==undefined?{life:input.life}:{}),...(input.scene!==undefined?{scene:input.scene}:{})});
  return{decision:'accepted',requestedInteractionKey:candidate.interactionKey,resolvedInteractionKey:candidate.interactionKey,reasonCodes:['character_agreed',preference>.65?'character_fit':'open_to_suggestion'],...(evidence?{relationshipEvidence:evidence}:{}),sceneTransition:transition};
}

export function resolveCharacterInitiative(input:{candidates:InteractionCandidate[];profile:CharacterInteractionProfile;life?:InteractionLife|null;scene?:InteractionSceneState|null;now?:Date;seed?:string}):CharacterInitiativeResult{
  const now=input.now??new Date(),scene=input.scene??{};
  if(!input.candidates.length)return{kind:'none',reasonCodes:['no_candidates']};
  if(['busy','unavailable'].includes(lifeLevel(input.life)))return{kind:'none',reasonCodes:['not_interruptible']};
  if(scene.pendingProposalId)return{kind:'none',reasonCodes:['proposal_pending']};
  const cooldown=scene.initiativeCooldownUntil?new Date(scene.initiativeCooldownUntil).getTime():0;
  if(Number.isFinite(cooldown)&&cooldown>now.getTime())return{kind:'none',reasonCodes:['initiative_cooldown']};
  const last=scene.lastCharacterInitiativeAt?new Date(scene.lastCharacterInitiativeAt).getTime():0;
  if(Number.isFinite(last)&&now.getTime()-last<10*60_000)return{kind:'none',reasonCodes:['initiative_cooldown']};
  const candidate=input.candidates.find((item)=>!['leave','move'].includes(item.family)&&!scene.recentActionKeys?.slice(-2).includes(item.interactionKey));
  if(!candidate)return{kind:'none',reasonCodes:['no_fresh_candidate']};
  const sceneEntry=(scene.recentActionKeys?.length??0)===0;
  const probability=Math.max(.08,Math.min(.82,input.profile.initiative*.55+input.profile.spontaneity*.2+(sceneEntry?.12:0)));
  const roll=(stableHash(`${input.seed??'character-initiative'}:${candidate.interactionKey}:${scene.recentActionKeys?.join('|')??''}`)%10000)/10000;
  if(roll>probability&&input.profile.initiative<.8)return{kind:'none',reasonCodes:['character_waits']};
  return{kind:'proposal',interactionKey:candidate.interactionKey,label:candidate.label,expiresAt:new Date(now.getTime()+12*60_000).toISOString(),reasonCodes:['character_initiative',sceneEntry?'scene_entry':'scene_lull']};
}

export function resolveSceneTransition(input:{candidate:Pick<InteractionCandidate,'interactionKey'|'durationMinutes'|'effects'>;life?:InteractionLife|null;scene?:InteractionSceneState|null;now?:Date}):SceneTransitionProposal{
  const now=input.now??input.life?.now??new Date(),expected=input.life?.expectedEndAt??input.scene?.expectedEndAt;
  const remaining=expected?(new Date(expected).getTime()-now.getTime())/60000:Infinity;
  if(Number.isFinite(remaining)&&remaining<=5)return{kind:'character_departure',reason:'schedule'};
  const destination=input.candidate.effects['destinationLocationId'];
  if(input.candidate.effects['mayMoveCharacter']===true&&typeof destination==='string')return{kind:'move',destinationLocationId:destination};
  if(input.candidate.effects['mayExtendScene']===true)return{kind:'extend',minutes:Math.min(30,input.candidate.durationMinutes??10)};
  if(/leave|head_back|last_train/.test(input.candidate.interactionKey))return{kind:'end',reason:'scene_complete'};
  return{kind:'stay'};
}

function interactionEligible(definition: InteractionDefinition, input: InteractionResolveInput, profile: CharacterInteractionProfile, availableMinutes: number) {
  const requirements = definition.requirements;
  const reasons = ['eligible'];
  if (!requirements) return { eligible: true, reasons };
  if (requirements.allowedCharacterRoles?.length && !requirements.allowedCharacterRoles.includes(input.character.role ?? '')) return { eligible: false, reasons: ['role'] };
  if (requirements.minRelationshipStage && stageIndex(input.relationship.stage) < stageIndex(requirements.minRelationshipStage)) return { eligible: false, reasons: ['relationship_stage'] };
  if (requirements.maxRelationshipStage && stageIndex(input.relationship.stage) > stageIndex(requirements.maxRelationshipStage)) return { eligible: false, reasons: ['relationship_stage'] };
  if (requirements.contentLevel === 'romance' && input.relationship.romanceEnabled === false) return { eligible: false, reasons: ['romance_disabled'] };
  if (requirements.minAvailability === 'open' && lifeLevel(input.life) !== 'open') return { eligible: false, reasons: ['availability'] };
  if (requirements.minAvailability === 'limited' && ['busy', 'unavailable'].includes(lifeLevel(input.life))) return { eligible: false, reasons: ['availability'] };
  if (definition.durationMinutes && availableMinutes < definition.durationMinutes + 3) return { eligible: false, reasons: ['schedule_pressure'] };
  if ((definition.activityTags ?? []).some((tag) => profile.dislikedActivityTags.includes(tag))) return { eligible: false, reasons: ['character_boundary'] };
  if (input.character.role === 'social_character' && definition.family === 'relationship') return { eligible: false, reasons: ['social_role'] };
  return { eligible: true, reasons };
}

function lifeLevel(life: InteractionLife | null | undefined) { return life?.availability ?? life?.interruptibility ?? 'open'; }
function tagProfileFit(tag: string, profile: CharacterInteractionProfile) {
  if (profile.dislikedActivityTags.includes(tag)) return -1;
  if (profile.preferredActivityTags.includes(tag)) return .92;
  if (['photography', 'art_gallery', 'books', 'live_music'].includes(tag)) return profile.creativeInterest;
  if (['park', 'scenic', 'hiking', 'beach', 'water_activity'].includes(tag)) return profile.outdoors;
  if (['fitness', 'ski_snow'].includes(tag)) return profile.physicalActivity;
  if (['bar', 'karaoke', 'live_music', 'night_market'].includes(tag)) return profile.nightlife;
  if (['cafe', 'restaurant', 'market', 'cooking'].includes(tag)) return profile.foodInterest;
  if (['arcade', 'trivia'].includes(tag)) return profile.competitiveness;
  return .45;
}
function interactionRelationshipFit(definition: InteractionDefinition, relationship: InteractionRelationship) {
  const stage = stageIndex(relationship.stage) / (stageOrder.length - 1);
  if (definition.family === 'relationship') return stage;
  if (definition.family === 'talk') return .65;
  return .45 + (relationship.comfort ?? 35) / 200;
}
function moodFit(tags: string[], mood?: string | null, energy?: string | null) {
  const text = `${mood ?? ''} ${energy ?? ''}`.toLowerCase();
  if (/tired|low/.test(text) && tags.some((tag) => ['hiking', 'fitness', 'ski_snow'].includes(tag))) return -.65;
  if (/playful|energized|high/.test(text) && tags.some((tag) => ['karaoke', 'arcade', 'trivia'].includes(tag))) return .3;
  if (/quiet|reflective/.test(text) && tags.some((tag) => ['books', 'art_gallery', 'scenic'].includes(tag))) return .24;
  return 0;
}

function planActivityFit(activePlan: InteractionResolveInput['activePlan'], definition: InteractionDefinition, scene?: InteractionSceneState | null) {
  if (!activePlan) return { score: 0, reasonCodes: [] as string[] };
  const planned = normalizeActivityTag(activePlan.activityKey);
  const tags = definition.activityTags ?? [];
  const matches = tags.some((tag) => normalizeActivityTag(tag) === planned) || normalizeActivityTag(definition.key.split('.')[0] ?? '') === planned;
  if (!matches) return { score: scene?.recentActionKeys?.length && scene.recentActionKeys.length >= 4 ? .08 : .16, reasonCodes: ['plan_context'] };
  const actionCount = scene?.recentActionKeys?.filter((key) => normalizeActivityTag(key.split('.')[0] ?? '') === planned).length ?? 0;
  const score = Math.max(.12, .46 - Math.min(.28, actionCount * .07));
  return { score, reasonCodes: ['active_plan_activity', ...(actionCount >= 3 ? ['plan_activity_opening'] : [])] };
}
function memoryInteractionFit(definition:InteractionDefinition,input:InteractionResolveInput){
  const tags=definition.activityTags??[];let score=0;const reasonCodes:string[]=[];let repeatPick=false;
  for(const cue of input.memoryCues??[]){
    const matches=cue.activityTags.some((tag)=>tags.includes(tag));const atPlace=Boolean(cue.locationId&&cue.locationId===input.location.id);
    if(cue.type==='negative_preference'&&matches){score-=.4*cue.strength;reasonCodes.push('negative_preference');continue;}
    if(cue.type==='preference'&&matches){score+=.12*cue.strength;reasonCodes.push('user_preference');}
    if(cue.type==='shared_activity'&&matches){score+=.08*cue.strength;reasonCodes.push('shared_activity');if(definition.key.includes('let_them_pick'))repeatPick=true;}
    if(cue.type==='place_history'&&atPlace){score+=.08*cue.strength;reasonCodes.push('place_history');}
  }
  for(const pattern of input.userPatterns??[]){
    const summary=normalizeActivityTag(`${pattern.patternKey} ${pattern.summary}`);
    if(/quiet|calm|low energy/.test(summary)&&tags.some((tag)=>['books','art_gallery','scenic','cafe'].includes(tag))){score+=.08*pattern.confidence;reasonCodes.push('user_pattern');}
    if(/play|game|competition/.test(summary)&&tags.some((tag)=>['arcade','trivia','karaoke'].includes(tag))){score+=.08*pattern.confidence;reasonCodes.push('user_pattern');}
  }
  return{score,reasonCodes:[...new Set(reasonCodes)],repeatPick};
}
function contextualInteractionLabel(definition:InteractionDefinition,memory:{repeatPick:boolean;reasonCodes:string[]}){
  if(memory.repeatPick&&definition.key.includes('let_them_pick'))return definition.labels.default.replace(/your song/i,'again');
  if(!memory.reasonCodes.some((reason)=>reason==='shared_activity'||reason==='place_history'))return definition.labels.default;
  const callbacks:Record<string,string>={
    'karaoke.sing_together':'Sing together again',
    'arcade.challenge_them':'Challenge them again',
    'arcade.ask_for_a_rematch':'Ask for another rematch',
    'photography.take_a_photo_together':'Take another photo together',
    'live_music.take_a_photo_together':'Take another photo together',
    'scenic.take_a_photo_together':'Take another photo together',
    'sports.pick_a_side':'Defend your team choice',
    'restaurant.let_them_choose':'Let them choose again',
  };
  return callbacks[definition.key]??definition.labels.default;
}
function normalizeEvidenceType(value:string):InteractionEvidenceType|null{
  const normalized=value.toLowerCase();
  if(normalized==='meaningful_conversation')return'vulnerability';
  const allowed=new Set<InteractionEvidenceType>(['shared_experience','playful_competition','support','vulnerability','affection','romantic_tension','conflict','repair','boundary_respected','boundary_ignored']);
  return allowed.has(normalized as InteractionEvidenceType)?normalized as InteractionEvidenceType:null;
}
function interactionMetricDelta(type:InteractionEvidenceType,quality:number,romantic:boolean):InteractionMetricDelta{
  const strength=quality<.18?0:quality>=.65?2:1;
  switch(type){
    case'shared_experience':return{comfort:strength,affinity:strength,familiarity:strength};
    case'playful_competition':return{affinity:strength,familiarity:1,respect:1};
    case'support':return{trust:strength,comfort:strength,respect:1};
    case'vulnerability':return{trust:strength,comfort:strength,familiarity:1};
    case'affection':return romantic?{comfort:1,affinity:1,attraction:strength,romantic_interest:1}:{comfort:strength,affinity:strength};
    case'romantic_tension':return romantic?{attraction:strength,romantic_interest:strength,affinity:1}:{affinity:1};
    case'conflict':return{conflict:strength,respect:-1};
    case'repair':return{trust:strength,comfort:strength,conflict:-strength,respect:1};
    case'boundary_respected':return{respect:strength,trust:1};
    case'boundary_ignored':return{respect:-strength,trust:-1,conflict:strength};
  }
}
function roundInteraction(value:number){return Math.round(Math.max(0,Math.min(1,value))*1000)/1000;}
function applyActionChains(candidates: InteractionCandidate[], scene: InteractionSceneState | null | undefined, packs: InteractionPack[]) {
  const recent = scene?.recentActionKeys ?? [];
  const last = recent.at(-1) ?? '';
  return candidates.map((candidate) => {
    let bonus = 0;
    if (last.includes('pick_a_song') && ['karaoke.sing_together', 'karaoke.let_them_pick_your_song', 'bar.grab_a_drink'].includes(candidate.interactionKey)) bonus = .55;
    if (last.includes('sing_together') && ['bar.grab_a_drink', 'karaoke.do_another_song', 'live_music.take_a_photo_together'].includes(candidate.interactionKey)) bonus = .48;
    if (last.includes('challenge_them') && ['arcade.ask_for_a_rematch', 'arcade.pick_a_co_op_game'].includes(candidate.interactionKey)) bonus = .5;
    if (last.includes('take_a_photo') && candidate.family === 'move') bonus = .25;
    if (scene?.focus === 'karaoke' && packs.includes('karaoke') && candidate.interactionKey.startsWith('karaoke.')) bonus += .16;
    return bonus ? { ...candidate, score: candidate.score + bonus, reasonCodes: [...candidate.reasonCodes, 'scene_chain'] } : candidate;
  });
}
function fallbackInteractions(input: InteractionResolveInput, availableMinutes: number): InteractionCandidate[] {
  const fallback = [definition('scene.talk', 'talk', 'Talk for a while', [], 8), definition('scene.look_around', 'activity', 'Look around together', [], 10), definition('scene.leave', 'leave', 'Head out', [], 1, { mayMoveCharacter: true })];
  return fallback.filter((item) => !item.durationMinutes || availableMinutes >= item.durationMinutes).map((item, index) => ({ id: item.key, interactionKey: item.key, family: item.family, label: item.labels.default, ...(item.durationMinutes !== undefined ? { durationMinutes: item.durationMinutes } : {}), score: .4 - index * .04, reasonCodes: ['safe_fallback'], effects: { ...(item.effects ?? {}) }, presentation: { iconKey: item.family } }));
}

export function resolveMovementDestinations(input: InteractionResolveInput): InteractionCandidate[] {
  const currentPacks = inferInteractionPacks(input.location, input.world);
  return (input.nearbyLocations ?? []).filter((location) => location.id !== input.location.id && locationOpenForInteraction(location, input.life?.now ?? new Date())).map((location) => {
    const destinationPacks = inferInteractionPacks(location, input.world);
    const shared = destinationPacks.filter((pack) => currentPacks.includes(pack)).length;
    const profile = input.interactionProfile ?? deriveCharacterInteractionProfile(input.character);
    const activityFit = destinationPacks.reduce((sum, pack) => sum + tagProfileFit(pack, profile), 0) / Math.max(1, destinationPacks.length);
    const score = .42 + shared * .12 + activityFit * .35 + (stableHash(`${input.seed ?? input.location.id}:${location.id}`) % 9) / 1000;
    return { id: `move:${location.id}`, interactionKey: `move:${location.id}`, family: 'move' as const, label: `Go to ${location.name}`, durationMinutes: 12, score, reasonCodes: [shared ? 'nearby_related' : 'nearby', activityFit > .62 ? 'character_fit' : 'variety'], effects: { mayMoveCharacter: true, destinationLocationId: location.id }, presentation: { iconKey: 'move' } };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 5);
}

export function applyInteractionSceneState(state: InteractionSceneState | null | undefined, candidate: Pick<InteractionCandidate, 'interactionKey' | 'effects' | 'label'>): InteractionSceneState {
  const previous = state ?? {};
  const recent = [...(previous.recentActionKeys ?? []), candidate.interactionKey].slice(-10);
  const activity = typeof candidate.effects['sceneActivityKey'] === 'string' ? candidate.effects['sceneActivityKey'] : previous.currentActivityKey ?? null;
  const focus = candidate.interactionKey.split('.')[0] ?? previous.focus ?? null;
  const nextActivity = applyActivityState(previous.activity ?? {}, candidate);
  return { ...previous, focus, currentActivityKey: activity, activityLabel: candidate.label, recentActionKeys: recent, selectedBy: candidate.interactionKey.includes('let_them_pick') ? 'character' : 'user', activity: nextActivity };
}

function applyActivityState(previous: Record<string, unknown>, candidate: Pick<InteractionCandidate, 'interactionKey' | 'effects' | 'label'>) {
  const next: Record<string, unknown> = { ...previous };
  const configured = candidate.effects['activityStateEffects'];
  if (configured && typeof configured === 'object') {
    const effect = configured as { set?: Record<string, unknown>; increment?: Record<string, number>; append?: Record<string, unknown> };
    Object.assign(next, effect.set ?? {});
    for (const [key, value] of Object.entries(effect.increment ?? {})) next[key] = Number(next[key] ?? 0) + Number(value ?? 0);
    for (const [key, value] of Object.entries(effect.append ?? {})) next[key] = [...unknownArray(next[key]), value].slice(-12);
  }
  const key = candidate.interactionKey;
  const storedType=next['type'];
  const type = typeof storedType==='string' ? storedType : key.split('.')[0] ?? 'shared_plan';
  const actions = [...unknownArray(next['actions']), key].slice(-12);
  next['actions'] = actions;
  if (type === 'karaoke' || key.startsWith('karaoke.')) {
    next['type'] = 'karaoke';
    if (/pick_a_song|let_them_pick_your_song/.test(key)) next['currentSong'] = { pickedBy: key.includes('let_them_pick') ? 'character' : 'user' };
    if (/sing_together|duet/.test(key)) { next['songsCompleted'] = Number(next['songsCompleted'] ?? 0) + 1; next['userPerformed'] = true; next['companionPerformed'] = true; next['duet'] = true; }
  }
  if (type === 'trivia' || key.startsWith('trivia.')) { next['type'] = 'trivia'; if (/round|category|team/.test(key)) next['round'] = Number(next['round'] ?? 0) + 1; }
  if (type === 'arcade' || key.startsWith('arcade.')) { next['type'] = 'arcade'; if (key.includes('rematch')) next['rematches'] = Number(next['rematches'] ?? 0) + 1; }
  if (type === 'cinema' || key.startsWith('cinema.')) {
    next['type'] = 'cinema';
    if (key.includes('pick_a_movie')) { next['phase'] = 'choosing_movie'; next['moviePickedBy'] = 'user'; next['stayedForCredits'] = false; }
    if (key.includes('stay_for_the_credits')) { next['phase'] = 'credits'; next['stayedForCredits'] = true; }
    if (key.includes('talk_about_the_ending')) next['phase'] = 'after_movie';
  }
  if (type === 'photography' || key.startsWith('photography.')) { next['type'] = 'photography'; if (key.includes('photo')) { next['photosTaken'] = Number(next['photosTaken'] ?? 0) + 1; next['photoTogetherTaken'] = true; } }
  if (type === 'restaurant' || key.startsWith('restaurant.')) { next['type'] = 'restaurant'; if (/order|choose|menu/.test(key)) next['ordered'] = true; if (key.includes('share_food')) next['sharedDish'] = true; if (key.includes('dessert')) next['dessert'] = true; }
  return next;
}
function unknownArray(value:unknown):unknown[]{return Array.isArray(value)?value as unknown[]:[];}

/**
 * Recognises only clear, affirmative scene commands. This is deliberately a
 * matcher over server-resolved candidates: free text can select a currently
 * valid action, but it can never invent an interaction or bypass its rules.
 */
export function matchInteractionIntent(text: string, candidates: InteractionCandidate[]): InteractionCandidate | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || /\b(don'?t|do not|never mind|maybe later|not now)\b/.test(normalized)) return null;
  const affirmative = /\b(let s|lets|let us|we should|i want to|i d like to|i would like to|go ahead|do it|yes let s|yes lets)\b/.test(normalized);
  if (!affirmative) return null;
  const normalizedLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string[]> = {
    'sing together': ['sing with you', 'sing with them', 'do a duet'],
    'take a photo together': ['take a picture together', 'get a photo together'],
    'walk together': ['go for a walk', 'take a walk'],
    'grab a drink': ['get a drink', 'have a drink'],
    'browse together': ['look around together'],
  };
  const matches = candidates.filter((candidate) => {
    const label = normalizedLabel(candidate.label);
    if (normalized.includes(label)) return true;
    return (aliases[label] ?? []).some((alias) => normalized.includes(alias));
  });
  return matches.sort((left, right) => right.score - left.score || left.interactionKey.localeCompare(right.interactionKey))[0] ?? null;
}

export function interactionDefinition(key: string) { return interactionDefinitions.get(key) ?? null; }
function locationOpenForInteraction(location: InteractionLocation, now: Date) {
  const hours = location.hours;
  if (!hours || !Object.keys(hours).length) return true;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now).toLowerCase().slice(0, 3);
  const raw = hours[day] ?? hours['default'] ?? hours;
  if (raw === 'closed' || (typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>)['closed'] === true)) return false;
  const record = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null;
  const openValue = record?.['open'] ?? record?.['opensAt'];
  const closeValue = record?.['close'] ?? record?.['closesAt'];
  const text = typeof raw === 'string' ? raw : `${typeof openValue === 'string' ? openValue : ''}-${typeof closeValue === 'string' ? closeValue : ''}`;
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) return true;
  const current = now.getHours() * 60 + now.getMinutes(), open = Number(match[1]) * 60 + Number(match[2] ?? 0), close = Number(match[3]) * 60 + Number(match[4] ?? 0);
  return close < open ? current >= open || current <= close : current >= open && current <= close;
}
function stableHash(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
