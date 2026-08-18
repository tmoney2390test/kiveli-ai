import type { CharacterInstance, CharacterTemplate, Location, Snapshot } from '../types';
import { recommendPlanOptions, type PlanContext, type PlanOption } from './plans';
import { characterCatalogForWorld } from './place';

export type ExploreCategoryId='coffee'|'nightlife'|'dining'|'quiet'|'entertainment';
export type ExploreRecommendation={id:'tonight'|'companion'|'different'|'liked';title:string;subtitle:string;option:PlanOption;location:Location};
export type ExploreContext={locations:Location[];featuredLocations:Location[];categories:Array<{id:ExploreCategoryId;label:string;count:number}>;recommendations:ExploreRecommendation[];worldEvents:Snapshot['lifeEvents'];people:CharacterTemplate[]};

export const EXPLORE_CATEGORIES:Array<{id:ExploreCategoryId;label:string}>=[{id:'coffee',label:'Coffee'},{id:'nightlife',label:'Nightlife'},{id:'dining',label:'Dining'},{id:'quiet',label:'Quiet Spots'},{id:'entertainment',label:'Entertainment'}];

export function buildExploreContext(snapshot:Snapshot,companion:CharacterInstance|undefined,worldId:string):ExploreContext{
  const locations=snapshot.locations.filter((location)=>location.world_id===worldId&&isBrowsableLocation(location));
  const recommendations=companion?buildRecommendations(snapshot,companion,locations):[];
  const featuredLocations=featureLocations(locations,recommendations.map((item)=>item.location.id));
  const worldEvents=snapshot.lifeEvents.filter((event)=>event.location_id&&snapshot.locations.find((location)=>location.id===event.location_id)?.world_id===worldId).sort((left,right)=>new Date(right.starts_at).getTime()-new Date(left.starts_at).getTime()).slice(0,4);
  const people=peopleForWorld(snapshot,worldId).slice(0,8);
  return{locations,featuredLocations,categories:EXPLORE_CATEGORIES.map((category)=>({...category,count:locationsForExploreCategory(locations,category.id).length})).filter((category)=>category.count>0),recommendations,worldEvents,people};
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
export function isBrowsableLocation(location:Location){return!['room','zone','transit'].includes(location.location_type)&&location.category!=='home'&&location.category!=='work'&&location.metadata?.private!==true&&location.metadata?.directoryVisibility!=='private';}
export function matchesExploreCategory(location:Location,category:ExploreCategoryId){const tags=Array.isArray(location.metadata?.tags)?location.metadata.tags:[];const words=`${location.category} ${location.possible_activities.join(' ')} ${tags.join(' ')}`.toLowerCase();if(category==='coffee')return/coffee|cafe|bakery|pastry|brunch/.test(words);if(category==='nightlife')return/bar|lounge|nightlife|cocktail|music|karaoke|comedy|drinks/.test(words);if(category==='dining')return/restaurant|dinner|food|taco|brunch/.test(words);if(category==='quiet')return/quiet|book|park|gallery|walk|outdoor|reading|coffee/.test(words);return/entertainment|cinema|movie|arcade|games|music|comedy|karaoke|trivia|sport|arena|basketball|hockey|soccer|boxing/.test(words);}
function peopleForWorld(snapshot:Snapshot,worldId:string):CharacterTemplate[]{return characterCatalogForWorld(snapshot,worldId).map((entry)=>entry.template);}
function friendly(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}
