import { GILDED_WORLD_ID, gildedWorld, gildedPlaces } from './world.mjs';
import { gildedCast, gildedRelationshipPairs } from './cast.mjs';
import { gildedStories, gildedExperiences, gildedRecurringEvents } from './stories.mjs';

const uuid = (prefix, ordinal) => `${prefix}000000-0000-4000-8014-${String(ordinal).padStart(12, '0')}`;
const placeIds = new Map(gildedPlaces.map((place, index) => [place.slug, uuid('2e', index + 1)]));
const castIds = new Map(gildedCast.map((resident, index) => [resident.slug, uuid('24', index + 1)]));
const districtNames = new Map(gildedPlaces.filter((place) => place.locationType === 'district').map((place) => [place.slug, place.name]));
const related = (slug) => gildedRelationshipPairs.flatMap(([a, b]) => a === slug ? [b] : b === slug ? [a] : []);
const daytime = new Set(['anika-saye','seraphine-vale','julian-mercer','iria-montrose','hugo-fen','bruna-kest','mateo-salt','yara-nouri','levi-ash','celia-mar','amara-kade','bastien-crow','oren-gale','sami-haddad','elias-reed','tomas-renn']);
const eveningWorkers = new Set(['sabine-quill','lucien-damar','inez-sol','cassia-bloom','luca-vane','fen-moreno','javier-ro','maia-bel']);
const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const leisureAt = {
  'brass-compass':'Having a meal and listening to harbor stories',
  'breakwater-steps':'Walking along the sea wall',
  'glass-garden':'Walking among the shade plants',
  'mariners-table':'Sharing a meal at the long table',
  'pearl-salon':'Listening to live music',
  'spice-courtyard':'Playing a courtyard game',
  'house-of-hours':'Having tea in the public tea room',
  'honeyglass-theatre':'Watching a performance',
  'tidepool-cove':'Walking among the tidepools',
  'ropewalk-kitchen':'Helping cook a shared meal',
  'drydock-baths':'Taking a quiet bath',
  'night-market':'Tasting food at the market',
  'coconut-beach':'Swimming near the marked shore',
  'lightkeep':'Watching the sea from the public stair',
};
const atHome = {
  'elara-voss':'Sharpening a knife at home','tomas-renn':'Practicing a wooden flute at home','anika-saye':'Working through a puzzle at home',
  'rafiq-nadir':'Baking bread at home','mira-cael':'Carving a small figure at home','nico-solari':'Practicing boat knots at home',
  'seraphine-vale':'Tending orchids at home','julian-mercer':'Looking through old maps at home','sabine-quill':'Blending tea at home',
  'lucien-damar':'Repairing a violin at home','iria-montrose':'Cutting a practice stone at home','hugo-fen':'Cooking an old recipe at home',
  'bruna-kest':'Making a wooden toy at home','mateo-salt':'Drawing a sail pattern at home','yara-nouri':'Working on a rope puzzle at home',
  'dorian-pike':'Carving wood at home','levi-ash':'Practicing ropework at home','celia-mar':'Tending plants at home',
  'inez-sol':'Sketching a costume at home','cassia-bloom':'Restoring an old chair at home','luca-vane':'Writing a song at home',
  'fen-moreno':'Arranging music at home','javier-ro':'Cooking supper at home','maia-bel':'Solving a wooden puzzle at home',
  'amara-kade':'Drying herbs at home','bastien-crow':'Mending a net at home','talia-wren':'Watching seabirds from home',
  'oren-gale':'Keeping a weather journal at home','nera-tide':'Carving a shell at home','sami-haddad':'Working a ledger puzzle at home',
  'mara-blackfin':'Mending a net at home','idris-vale':'Practicing a song at home','sora-bay':'Cooking at home',
  'keon-flint':'Looking over charts at home','nadia-storm':'Drawing at home','elias-reed':'Playing fiddle at home',
};
function openIntervals(locationSlug){
  const hours=gildedPlaces.find((place)=>place.slug===locationSlug)?.hours;
  if(!hours)return [[0,1440]];
  const minutes=(value)=>Number(value.slice(0,2))*60+Number(value.slice(3));
  const start=minutes(hours.open),end=minutes(hours.close);
  return end<=start?[[0,end],[start,1440]]:[[start,end]];
}
function scheduleSegments(locationSlug,start,end){
  if(!locationSlug)return [{start,end,open:true}];
  const intervals=openIntervals(locationSlug);
  const cuts=[start,end,...intervals.flat().filter((point)=>point>start&&point<end)].sort((a,b)=>a-b);
  return cuts.slice(0,-1).map((point,index)=>({start:point,end:cuts[index+1],open:intervals.some(([a,b])=>point>=a&&cuts[index+1]<=b)}));
}

const locations = gildedPlaces.map((place, index) => {
  const isDistrict = place.locationType === 'district';
  const district = districtNames.get(place.districtSlug);
  const portraitPrompt = `Textless cinematic naturalistic realism of ${place.name} in Tidemark, The Gilded Coast, a fictional age-of-sail port. ${place.visual} ${place.description} Salt-worn, lived-in materials; no modern technology, no readable text, no logos, no explicit sexual activity.`;
  return {
    id: placeIds.get(place.slug), worldId: GILDED_WORLD_ID,
    parentLocationId: isDistrict ? null : placeIds.get(place.districtSlug),
    index: index + 1, name: place.name, slug: place.slug, description: place.description,
    category: place.category, locationType: place.locationType, hours: place.hours,
    activities: place.activities, visualAssetKey: `gilded-coast-location-${place.slug}`,
    visualAnchors:[place.visual],canonicalVisualContext: { canonicalPrompt: portraitPrompt, indoorOutdoor: /beach|reef|quay|steps|point|cove|village|anchorage/.test(place.slug) || isDistrict ? 'outdoor' : 'indoor', visualAnchors: [place.visual], avoid: gildedWorld.visualContext.avoid },
    canonicalLore: { version: 2, authored: true, summary: place.description, atmosphere: [place.visual], sensoryDetails: [place.visual], layout: isDistrict ? ['public route','working edge','private thresholds'] : ['public entrance','main activity space','private or staff threshold'], crowdRhythm: {morning:'Crews and neighbors establish the practical day.',afternoon:'Trade, work, and errands overlap.',evening:'Meals and social invitations change the crowd.',late_night:'Only venues with posted late hours remain open.'}, stableFacts: [place.description,place.history], localEtiquette: [place.etiquette], publicHistory: [place.history], recurringPeople: [{label:'local regulars',role:`People who work and live in ${district ?? place.name}`,rhythm:'They remember routine changes and named incidents.'}], activityNotes: Object.fromEntries(place.activities.map((activity) => [activity, `${activity} depends on this venue's opening hours, access, weather, and mutual consent.`])), accessNotes: [place.etiquette], weatherNotes: ['Heavy squalls can delay open-air activity and crossings.'], activityDescriptions: Object.fromEntries(place.activities.map((activity) => [activity, `Try ${activity} here with someone who is available.`])) },
    metadata: {source:'gilded_coast_pack_v1',district:place.districtSlug,assetStatus:'pending',photoStatus:'pending',imageSlotKey:`gilded-coast-location-${place.slug}`,userLocalClock:true},
  };
});

const characters = gildedCast.map((resident, index) => {
  const circleSlugs = related(resident.slug);
  const shiftKind = eveningWorkers.has(resident.slug) ? 'evening' : daytime.has(resident.slug) ? 'daytime' : 'maritime';
  const workDays = [0,1,2,3,4,5,6].filter((day) => day !== index % 7 && (!eveningWorkers.has(resident.slug) || day !== (index + 3) % 7));
  const homePrompt = `A private lived-in residence for ${resident.name}, ${resident.occupation}, in ${districtNames.get(resident.districtSlug)}, Tidemark. Practical age-of-sail furnishings reflecting ${resident.interests.slice(0,2).join(' and ')}, without assuming wealth or public entry.`;
  const languageRegister = 'Clear original English in a fictional age-of-sail port; maritime, craft, market, or institutional words come naturally from lived experience. No modern devices or real-world nations.';
  const voiceLine = `${resident.traits[0]}, ${resident.traits[1]} delivery shaped by ${resident.occupation}; concise in public, more specific in trust. Does not narrate actions aloud in voice.`;
  const adultBoundary = 'Work, payment, patronage, rank, rescue, debt, captivity, and protection never imply sexual or romantic consent.';
  const firstMeeting = {worldId:GILDED_WORLD_ID,locationSlug:resident.workSlug,title:`Meet ${resident.name}`,setup:resident.firstSetup,companionActivity:resident.occupation,mood:resident.traits[0],openingLine:resident.openingLine,suggestedPrompts:[`What is happening at ${gildedPlaces.find((place)=>place.slug===resident.workSlug)?.name}?`,`How did you come to ${resident.occupation}?`,`What are you working toward?`]};
  const relationshipConfig = {goal:'either',spiceLevel:resident.spiceLevel,romanticEnergy:'Attraction may grow from specific trust, humor, and mutual choice; a profession or rescue is never consent.',pace:'organic',initialStage:'stranger',romanticPace:.65,affection:.6,initiative:.65};
  const communicationStyle = {length:'short_to_medium',emojiFrequency:'none',directness:.78,teasing:resident.traits.includes('playful'),callbackFrequency:'natural',genericQuestions:'avoid',followupQuestions:'specific_and_earned',signature:voiceLine,languageRegister};
  const timeline = [{year:`Year ${94-resident.age}`,event:`${resident.name} is born.`},{year:`Year ${Math.max(0,94-resident.age+18)}`,event:`${resident.name} enters adult work and begins building a life in ${districtNames.get(resident.districtSlug)}.`},{year:'Year 94',event:resident.goal}];
  const characterBible = {depthVersion:5,traits:resident.traits,appearance:resident.appearance,occupation:resident.occupation,interests:resident.interests,storyHook:resident.storyHook,desire:resident.goal,ordinaryWish:resident.ordinaryWish,biography:resident.biography,personalTimeline:timeline,socialCircle:circleSlugs,firstMeeting,voice:{cadence:voiceLine,vocabulary:resident.interests,forbiddenPhrases:['As an AI','Tell me more.','How does that make you feel?']},publicBehavior:resident.firstSetup,privateBehavior:resident.ordinaryWish,conflictBehavior:resident.storyHook,repairBehavior:'Names the specific harm or mistake before asking to be forgiven.',boundaries:[adultBoundary],knowledge:{firsthand:[resident.biography],suspects:[resident.storyHook],publicWorld:gildedWorld.description},groupChat:{independentAgenda:resident.goal,knownCharacters:circleSlugs,disclosure:'Do not treat another participant’s private thought as shared knowledge.'}};
  return {
    rosterId:index+1,slug:resident.slug,name:resident.name,age:resident.age,gender:resident.gender,pronouns:resident.pronouns,
    background:`Resident of ${districtNames.get(resident.districtSlug)}`,classification:'human',caste:'not applicable',districtSlug:resident.districtSlug,
    occupation:resident.occupation,workSlug:resident.workSlug,leisureSlug:resident.leisureSlug,eveningSlug:resident.leisureSlug,weekendSlug:resident.leisureSlug,
    shiftKind,workDays,spiceLevel:resident.spiceLevel,biography:resident.biography,appearance:resident.appearance,interests:resident.interests,traits:resident.traits,
    quirks:resident.ordinaryWish,allegiances:[districtNames.get(resident.districtSlug)],dialogueTone:voiceLine,openingLine:resident.openingLine,
    voice:{cadence:voiceLine,vocabulary:resident.interests},psychology:{goal:resident.goal,ordinaryWish:resident.ordinaryWish},desire:resident.goal,
    complication:resident.storyHook,privateTruth:resident.storyHook,storyHook:resident.storyHook,romanceStyle:relationshipConfig.romanticEnergy,
    circleSlugs,templateId:castIds.get(resident.slug),versionId:uuid('25',index+1),portraitAssetKey:`gilded-coast-${resident.slug}`,
    firstMeeting,relationshipConfig,communicationStyle,portraitPrompt:`Cinematic naturalistic waist-up portrait of ${resident.name}, an adult ${resident.age}-year-old ${resident.occupation} in Tidemark, The Gilded Coast. ${resident.appearance} Fictional age-of-sail port, consistent facial features, honest adult age, no modern objects, no readable text, no explicit content.`,
    homePrompt,voiceProfile:{voiceKey:`gilded-coast-${resident.slug}`,delivery:voiceLine,providerMapping:'unassigned'},
    lifeConfig:{version:2,homeWorldId:GILDED_WORLD_ID,homeDistrictSlug:resident.districtSlug,occupation:{title:resident.occupation,workPattern:shiftKind,primaryLocationSlug:resident.workSlug,activityVariants:[`Working as ${resident.occupation}`,`Handling ${resident.storyHook}`,`Preparing for ${resident.goal}`]},interests:resident.interests,publicLocationSlugs:[resident.workSlug,resident.leisureSlug],workDays,seasonalStatus:'year_round_resident',scheduling:{userLocalClock:true,authoredCoverage:'full_week',scheduleProfile:'gilded_coast_authored_weekly_v1'}},
    characterBible,relationshipGoal:'either',canBeSelected:true,canBeRomanced:true,languageRegister,boundaries:[adultBoundary],
    hiddenSexual:null,intimateAnatomy:null,
  };
});

function scheduleFor(character) {
  const rows=[];
  for (let day=0;day<7;day++) {
    const working=character.workDays.includes(day);
    const night=character.shiftKind==='evening' && working;
    const plan=night ? [
      [0,180,null,'Sleeping at home','busy','sleep'],[180,660,null,'Sleeping at home','busy','sleep'],
      [660,900,null,'Having a private morning at home','limited','home'],[900,1080,character.leisureSlug,`Spending time at ${gildedPlaces.find(p=>p.slug===character.leisureSlug)?.name}`,'available','leisure'],
      [1080,1260,character.workSlug,`Working as ${character.occupation}`,'busy','work'],[1260,1440,character.workSlug,`Finishing the evening as ${character.occupation}`,'busy','work'],
    ] : working ? [
      [0,420,null,'Sleeping at home','busy','sleep'],[420,540,null,'Getting ready at home','limited','home'],
      [540,720,character.workSlug,`Working as ${character.occupation}`,'busy','work'],[720,780,character.leisureSlug,'Eating lunch','limited','meal'],
      [780,1080,character.workSlug,`Continuing work as ${character.occupation}`,'busy','work'],[1080,1440,character.leisureSlug,`Enjoying ${character.interests[0]}`,'available','leisure'],
    ] : [
      [0,480,null,'Sleeping at home','busy','sleep'],[480,600,null,'Taking a slow morning at home','limited','home'],
      [600,780,character.leisureSlug,`Enjoying ${character.interests[0]}`,'available','leisure'],[780,840,character.leisureSlug,'Eating a midday meal','available','meal'],
      [840,1080,character.leisureSlug,`Spending time at ${gildedPlaces.find(p=>p.slug===character.leisureSlug)?.name}`,'available','leisure'],[1080,1440,null,'Spending the evening at home','limited','home'],
    ];
    for(const [startMinute,endMinute,locationSlug,activity,availability,activityKey] of plan){
      for(const segment of scheduleSegments(locationSlug,startMinute,endMinute)){
        const accessible=segment.open;
        const actualPlace=accessible?locationSlug:null;
        const actualActivity=!accessible?(activityKey==='work'?'Finishing work at home':atHome[character.slug]):activityKey==='leisure'?(leisureAt[locationSlug]??activity):activityKey==='meal'?'Eating a packed meal':activity;
        const actualAvailability=accessible?availability:'limited';
        const slot=rows.filter((row)=>row.dayOfWeek===day).length;
        rows.push({characterVersionId:character.versionId,characterSlug:character.slug,dayOfWeek:day,diegeticDay:dayName[day],slot,startMinute:segment.start,endMinute:segment.end,locationSlug:actualPlace,activity:actualActivity,availability:actualAvailability,energyDelta:activityKey==='sleep'?2:activityKey==='work'?-1:0,mood:activityKey==='work'?'focused':activityKey==='sleep'?'rested':'open',activityKey:`${activityKey}-${slot}`,source:'gilded_coast_authored_weekly_v1'});
      }
    }
  }
  return rows;
}
const weeklySchedules = characters.flatMap(scheduleFor);
const socialConnections = gildedRelationshipPairs.flatMap(([a,b,type,publicDynamic,privateTension])=>[
  {sourceSlug:a,targetSlug:b,relationshipType:type,affinity:.69,trust:.64,tension:.48,publicDynamic,privateTension,knowledgeScope:'direct',authored:true},
  {sourceSlug:b,targetSlug:a,relationshipType:type,affinity:.66,trust:.6,tension:.52,publicDynamic,privateTension,knowledgeScope:'direct',authored:true},
]);
const worldFacts = [
  ...gildedWorld.history.map((row,index)=>({slug:`history-${index+1}`,title:`Gilded Coast ${row.year}`,factText:row.event,category:'history',truthMode:'canonical',knowledgeScope:'public',contentLevel:'standard',topicTags:['history','coast'],triggerTerms:[row.year],minWorldFamiliarity:0,weight:1,cooldownTurns:24,interactive:false})),
  ...gildedPlaces.map((place)=>({slug:`place-${place.slug}`,title:place.name,factText:`${place.description} ${place.history}`,category:'local_knowledge',truthMode:'canonical',knowledgeScope:'public',contentLevel:'standard',districtSlug:place.districtSlug,locationSlug:place.slug,topicTags:['place',place.districtSlug],triggerTerms:[place.name],minWorldFamiliarity:0,weight:1,cooldownTurns:24,interactive:false})),
];
const dialogueOpportunities = characters.map((character)=>({slug:`${character.slug}-ambition`,topic:character.desire,angle:`Ask ${character.name} what ${character.goal ?? character.desire} costs in their current work and relationships.`,framing:character.dialogueTone,characterSlugs:[character.slug],locationSlug:character.workSlug,topicTags:['ambition',character.slug],triggerTerms:character.interests.slice(0,2),minRelationshipStage:'acquaintance',contentLevel:'standard',minSpiceLevel:null,dayparts:['afternoon','evening'],interactionModes:['chat','group_chat','place'],weight:1.2,cooldownTurns:30}));
const interactionBeats = gildedPlaces.filter((place)=>place.locationType==='venue').map((place)=>({slug:`${place.slug}-visit`,title:`A visit to ${place.name}`,locationSlug:place.slug,districtSlug:place.districtSlug,affordance:`The player may join, watch, ask about, decline, or leave ${place.activities[0]} at ${place.name} when access and co-presence allow.`,framing:`${place.description} ${place.etiquette}`,requiredParticipantSlugs:[],minParticipants:1,maxParticipants:4,minRelationshipStage:null,contentLevel:'standard',minSpiceLevel:null,dayparts:['morning','afternoon','evening'],interactionModes:['place','chat','group_chat'],outcomePolicy:'Possibility only; never force movement, consent, romance, sex, violence, or relationship changes.',cooldownTurns:24,active:true}));

export const gildedPack={schemaVersion:'kivelli-gilded-coast-v1',world:gildedWorld,history:gildedWorld.history,factions:gildedWorld.factions,
  contentPolicy:{adultOnly:true,consent:gildedWorld.matureContentDoctrine.consentRule,violence:gildedWorld.matureContentDoctrine.violenceRule},
  districts:gildedPlaces.filter((place)=>place.locationType==='district').map((place)=>({slug:place.slug,name:place.name,summary:place.description,history:place.history,socialTexture:place.etiquette})),
  locations,characters,weeklySchedules,socialConnections,keyRelationships:socialConnections,
  recurringEvents:gildedRecurringEvents,storyArcs:gildedStories,experiences:gildedExperiences,worldFacts,dialogueOpportunities,interactionBeats};

export function validateGildedPack(pack=gildedPack){
  const locationSlugs=new Set(pack.locations.map((item)=>item.slug));const residentSlugs=new Set(pack.characters.map((item)=>item.slug));
  const errors=[];
  for(const resident of pack.characters){for(const slug of [resident.districtSlug,resident.workSlug,resident.leisureSlug,resident.firstMeeting.locationSlug])if(!locationSlugs.has(slug))errors.push(`${resident.slug}: missing ${slug}`);if(resident.age<24)errors.push(`${resident.slug}: under 24`);if(related(resident.slug).length<2)errors.push(`${resident.slug}: fewer than 2 connections`)}
  for(const row of pack.weeklySchedules)if(row.locationSlug&&!locationSlugs.has(row.locationSlug))errors.push(`${row.characterSlug}: schedule ${row.locationSlug}`);
  for(const story of pack.storyArcs){if(!locationSlugs.has(story.locationSlug))errors.push(`${story.slug}: location`);for(const slug of story.involved)if(!residentSlugs.has(slug))errors.push(`${story.slug}: ${slug}`)}
  for(const item of [...pack.experiences,...pack.recurringEvents])if(!locationSlugs.has(item.locationSlug))errors.push(`${item.slug}: location`);
  for(const resident of pack.characters){for(let day=0;day<7;day++){const blocks=pack.weeklySchedules.filter((row)=>row.characterSlug===resident.slug&&row.dayOfWeek===day).sort((a,b)=>a.startMinute-b.startMinute);if(!blocks.length||blocks[0].startMinute!==0||blocks.at(-1).endMinute!==1440||blocks.some((row,index)=>row.startMinute>=row.endMinute||(index>0&&blocks[index-1].endMinute!==row.startMinute)))errors.push(`${resident.slug}: incomplete schedule day ${day}`);}}
  for(const row of pack.weeklySchedules)if(row.locationSlug&&!openIntervals(row.locationSlug).some(([a,b])=>row.startMinute>=a&&row.endMinute<=b))errors.push(`${row.characterSlug}: closed venue in schedule`);
  if(pack.locations.length!==42||pack.characters.length!==36||pack.weeklySchedules.length<1512||pack.experiences.length<20||pack.storyArcs.length<6)errors.push('content counts');
  return {ok:errors.length===0,errors,counts:{locations:pack.locations.length,residents:pack.characters.length,schedules:pack.weeklySchedules.length,relationships:pack.socialConnections.length,stories:pack.storyArcs.length,experiences:pack.experiences.length,recurring:pack.recurringEvents.length}};
}
