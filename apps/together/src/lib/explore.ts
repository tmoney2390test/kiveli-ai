import type { CharacterInstance, Location, Snapshot } from '../types';
import type { FeaturedCompanion } from './featuredCompanions';
import { featuredCompanionGender, type FeaturedGenderFilter } from './featuredCompanions';
import { recommendPlanOptions, type PlanContext, type PlanOption } from './plans';
import { characterCatalogForWorld } from './place';

export type ExploreCategoryId='food'|'nightlife'|'lodging'|'quiet'|'entertainment';
export type ExploreRecommendation={id:'tonight'|'companion'|'different'|'liked';title:string;subtitle:string;option:PlanOption;location:Location};
export type ExploreContext={locations:Location[];featuredLocations:Location[];categories:Array<{id:ExploreCategoryId;label:string;count:number}>;recommendations:ExploreRecommendation[];worldEvents:Snapshot['lifeEvents'];people:FeaturedCompanion[]};
export type ExplorePeopleOptions={gender?:FeaturedGenderFilter;limit?:number};
export type ExploreEventStatus='HAPPENING NOW'|'UPCOMING';

export const EXPLORE_CATEGORIES:Array<{id:ExploreCategoryId;label:string}>=[{id:'food',label:'Food'},{id:'nightlife',label:'Nightlife'},{id:'lodging',label:'Lodging'},{id:'quiet',label:'Quiet Spots'},{id:'entertainment',label:'Entertainment'}];

export function buildExploreContext(snapshot:Snapshot,companion:CharacterInstance|undefined,worldId:string,peopleOptions:ExplorePeopleOptions={},now=new Date()):ExploreContext{
  const locations=snapshot.locations.filter((location)=>location.world_id===worldId&&isBrowsableLocation(location));
  const recommendations=companion?buildRecommendations(snapshot,companion,locations):[];
  const featuredLocations=featureLocations(locations,recommendations.map((item)=>item.location.id));
  const worldEvents=selectExploreWorldEvents(snapshot,worldId,now);
  const people=peopleForWorld(snapshot,worldId,companion,peopleOptions);
  return{locations,featuredLocations,categories:EXPLORE_CATEGORIES.map((category)=>({...category,count:locationsForExploreCategory(locations,category.id).length})).filter((category)=>category.count>0),recommendations,worldEvents,people};
}

export function selectExploreWorldEvents(snapshot:Snapshot,worldId:string,now=new Date()):Snapshot['lifeEvents']{
  const nowMs=now.getTime(),windowEndMs=nowMs+7*86400000;
  const locationIds=new Set(snapshot.locations.filter((location)=>location.world_id===worldId).map((location)=>location.id));
  const seen=new Set<string>();
  return snapshot.lifeEvents
    .filter((event)=>Boolean(event.location_id&&locationIds.has(event.location_id)))
    .filter((event)=>isDisplayableExploreEvent(event,nowMs,windowEndMs))
    .sort((left,right)=>{
      const leftActive=exploreEventStatus(left,now)==='HAPPENING NOW',rightActive=exploreEventStatus(right,now)==='HAPPENING NOW';
      if(leftActive!==rightActive)return leftActive?-1:1;
      return new Date(left.starts_at).getTime()-new Date(right.starts_at).getTime();
    })
    .filter((event)=>{const key=exploreEventIdentity(event);if(seen.has(key))return false;seen.add(key);return true;})
    .slice(0,4);
}

export function exploreEventStatus(event:Snapshot['lifeEvents'][number],now=new Date()):ExploreEventStatus{
  const nowMs=now.getTime(),starts=new Date(event.starts_at).getTime(),ends=eventEndMs(event);
  return starts<=nowMs&&ends>nowMs?'HAPPENING NOW':'UPCOMING';
}

function isDisplayableExploreEvent(event:Snapshot['lifeEvents'][number],nowMs:number,windowEndMs:number){
  const starts=new Date(event.starts_at).getTime(),ends=eventEndMs(event),type=String(event.event_type??'').toLowerCase(),metadata=event.metadata??{};
  if(!Number.isFinite(starts)||starts>windowEndMs||ends<=nowMs)return false;
  if(type.startsWith('commitment_')||type==='shared_plan_completed'||type==='schedule_presence'||type==='schedule_outcome')return false;
  if(metadata.canonicalPlanId||metadata.commitmentBeat||metadata.source==='character_schedule')return false;
  return true;
}

function eventEndMs(event:Snapshot['lifeEvents'][number]){
  const starts=new Date(event.starts_at).getTime(),explicit=event.ends_at?new Date(event.ends_at).getTime():Number.NaN;
  return Number.isFinite(explicit)?explicit:starts+2*60*60*1000;
}

function exploreEventIdentity(event:Snapshot['lifeEvents'][number]){
  const title=normalize(event.title),summary=normalize(event.narrative_summary),location=event.location_id??'',starts=new Date(event.starts_at).getTime(),timeBucket=Number.isFinite(starts)?Math.floor(starts/(30*60*1000)):0;
  return`${location}|${title}|${summary}|${timeBucket}`;
}

export function locationsForExploreCategory(locations:Location[],category:ExploreCategoryId){return locations.filter((location)=>matchesExploreCategory(location,category));}

function buildRecommendations(snapshot:Snapshot,companion:CharacterInstance,locations:Location[]):ExploreRecommendation[]{
  const memories=snapshot.memories.filter((memory)=>memory.character_instance_id===companion.id&&memory.memory_type==='preference').map((memory)=>memory.canonical_text);
  const base:PlanContext={activity:companion.current_activity,mood:companion.current_mood,locationId:companion.current_location_id,interests:companion.together_character_versions.interests,userInterests:snapshot.profile?.interests??[],preferences:memories,personality:companion.together_character_versions.personality_config,relationshipStage:companion.relationship_stage,locations,previousPlans:(snapshot.sharedPlans??[]).filter((plan)=>plan.character_instance_id===companion.id)};
  const candidates:Array<{id:ExploreRecommendation['id'];title:string;option?:PlanOption}>=[
    {id:'tonight',title:'Good for tonight',option:recommendPlanOptions({...base,intent:'tonight'})[0]},
    {id:'companion',title:`${companion.together_character_templates.name} would pick`,option:recommendPlanOptions({...base,intent:'companion_pick'})[0]},
    {id:'different',title:'Something different',option:recommendPlanOptions({...base,intent:'different'})[0]},
    {id:'liked',title:'You both liked',option:recommendPlanOptions({...base,intent:'liked'})[0]},
  ];
  const seen=new Set<string>();
  return candidates.flatMap((candidate):ExploreRecommendation[]=>{const option=candidate.option;if(!option||seen.has(option.id))return[];const location=locations.find((item)=>item.id===option.locationId);if(!location)return[];seen.add(option.id);return[{id:candidate.id,title:candidate.title,subtitle:recommendationSubtitle(candidate.id,option),option,location}];}).slice(0,4);
}

function recommendationSubtitle(id:string,option:PlanOption){if(id==='tonight')return`${option.locationName} · ${friendly(option.activityKey)}`;if(id==='companion')return`${option.locationName} feels like the right fit right now.`;if(id==='different')return`${option.locationName} breaks your recent pattern.`;return`${option.locationName} is worth doing again.`;}
function featureLocations(locations:Location[],priorityIds:string[]){const score=(location:Location)=>{const priority=priorityIds.indexOf(location.id);return(priority>=0?50-priority*5:0)+(location.sort_order??0)*-.001+(hasArtPriority(location.slug)?12:0);};return[...locations].sort((a,b)=>score(b)-score(a)).slice(0,8);}
function hasArtPriority(slug:string){return['velvet-hour','riverwalk','pixel-and-pint','paper-trail','moss-and-crumb','juniper-civic-arena'].includes(slug);}
export function isBrowsableLocation(location:Location){const explicitlyPublic=location.metadata?.directoryVisibility==='public';return!['region','district','neighborhood','room','zone'].includes(location.location_type)&&location.category!=='home'&&(location.category!=='work'||explicitlyPublic)&&location.metadata?.private!==true&&location.metadata?.directoryVisibility!=='private';}
export function matchesExploreCategory(location:Location,category:ExploreCategoryId){const tags=Array.isArray(location.metadata?.tags)?location.metadata.tags:[];const words=`${location.category} ${location.possible_activities.join(' ')} ${tags.join(' ')}`.toLowerCase();if(category==='food')return/restaurant|dinner|dining|food|taco|brunch|coffee|cafe|café|bakery|pastry|breakfast|lunch|seafood|tavern|diner/.test(words);if(category==='nightlife')return/bar|lounge|nightlife|cocktail|music|karaoke|comedy|drinks/.test(words);if(category==='lodging')return/hotel|inn|guesthouse|lodg|resort|cabin|accommodation|overnight stay/.test(words);if(category==='quiet')return/quiet|book|park|gallery|walk|outdoor|reading|coffee/.test(words);return/entertainment|cinema|movie|arcade|games|music|comedy|karaoke|trivia|sport|arena|basketball|hockey|soccer|boxing/.test(words);}
export function exploreCompanionBadge(snapshot:Snapshot,person:FeaturedCompanion,index:number):string|null{
  const instance=snapshot.characters.find((item)=>item.character_template_id===person.id);
  const favorite=(snapshot.favoriteCharacterTemplateIds??[]).includes(person.id);
  if(instance?.contact_added_at||instance?.introduced_at)return'CONNECTED';
  if(favorite)return'FAVORITE';
  if(person.discovery_metadata?.trending===true)return'POPULAR';
  if(person.discovery_metadata?.new===true&&index<2)return'NEW TO YOU';
  if(person.discovery_metadata?.featured===true&&index<4)return'FEATURED';
  return null;
}

function peopleForWorld(snapshot:Snapshot,worldId:string,active:CharacterInstance|undefined,options:ExplorePeopleOptions):FeaturedCompanion[]{
  const gender=options.gender??'any';
  const activeTemplateId=active?.character_template_id;
  const profileInterests=new Set((snapshot.profile?.interests??[]).map(normalize));
  const goals=new Set((snapshot.profile?.experience_goals??[]).map(normalize));
  const favorites=new Set(snapshot.favoriteCharacterTemplateIds??[]);
  const ranked=characterCatalogForWorld(snapshot,worldId)
    .map((entry,index)=>{
      const person={...entry.template,together_character_versions:entry.version};
      if(gender!=='any'&&featuredCompanionGender(person)!==gender)return null;
      const established=Boolean(entry.instance?.contact_added_at||entry.instance?.introduced_at);
      const personInterests=(entry.version.interests??[]).map(normalize);
      const interestOverlap=personInterests.filter((interest)=>profileInterests.has(interest)).length;
      const relationshipGoal=normalize(entry.template.relationship_goal??'either');
      const goalMatch=(goals.has('dating')||goals.has('romance'))&&relationshipGoal!=='friendship'
        ||goals.has('friendship')&&relationshipGoal!=='romance';
      const metadata=entry.template.discovery_metadata??{};
      const score=Number(entry.template.id!==activeTemplateId)*30
        +Number(!established)*22
        +Number(goalMatch)*8
        +interestOverlap*5
        +Number(metadata.featured===true)*7
        +Number(metadata.trending===true)*5
        +Number(favorites.has(entry.template.id))*3
        -Number(established)*8
        -index*.001;
      return{person,score};
    })
    .filter((item):item is{person:FeaturedCompanion;score:number}=>Boolean(item))
    .sort((left,right)=>right.score-left.score||left.person.name.localeCompare(right.person.name));
  const withoutActive=ranked.filter((item)=>item.person.id!==activeTemplateId);
  const results=withoutActive.length?withoutActive:ranked;
  return results.slice(0,options.limit??24).map((item)=>item.person);
}
function friendly(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}
function normalize(value:string){return value.trim().toLowerCase().replace(/[_-]+/g,' ')}
