import type { CharacterInstance, CharacterTemplate, Location, Snapshot } from '../types';
import { companionPick, recommendPlanOptions, type PlanContext, type PlanOption } from './plans';

export type ExploreCategoryId='coffee'|'nightlife'|'dining'|'quiet'|'entertainment';
export type ExploreRecommendation={id:string;title:string;subtitle:string;option:PlanOption;location:Location};
export type ExploreCategory={id:ExploreCategoryId;label:string;count:number};

const categoryLabels:Record<ExploreCategoryId,string>={coffee:'Coffee',nightlife:'Nightlife',dining:'Dining',quiet:'Quiet spots',entertainment:'Entertainment'};

export function buildExploreContext(snapshot:Snapshot,character:CharacterInstance|undefined,worldId:string){
  const locations=snapshot.locations.filter((location)=>location.world_id===worldId&&isBrowsableLocation(location));
  const planContext=character?buildPlanContext(snapshot,character,locations):null;
  const recommendations=planContext?buildRecommendations(planContext,locations,character?.together_character_templates.name??'Your companion'):[];
  const categories=(Object.keys(categoryLabels) as ExploreCategoryId[]).map((id)=>({id,label:categoryLabels[id],count:locationsForExploreCategory(locations,id).length})).filter((item)=>item.count>0);
  const featuredLocations=featureLocations(locations,recommendations.map((item)=>item.location.id));
  const worldEvents=snapshot.lifeEvents.filter((event)=>{const location=snapshot.locations.find((item)=>item.id===event.location_id);return location?.world_id===worldId;}).sort((a,b)=>new Date(b.starts_at).getTime()-new Date(a.starts_at).getTime()).slice(0,4);
  const people=peopleForWorld(snapshot,worldId).slice(0,8);
  return{locations,recommendations,categories,featuredLocations,worldEvents,people};
}

export function locationsForExploreCategory(locations:Location[],category:ExploreCategoryId){return locations.filter((location)=>matchesCategory(location,category));}

function buildPlanContext(snapshot:Snapshot,character:CharacterInstance,locations:Location[]):PlanContext{
  const preferences=snapshot.memories.filter((item)=>item.character_instance_id===character.id&&item.memory_type==='preference').map((item)=>item.canonical_text);
  return{activity:character.current_activity,mood:character.current_mood,locationId:character.current_location_id,interests:character.together_character_versions.interests,userInterests:snapshot.profile?.interests??[],preferences,personality:character.together_character_versions.personality_config,relationshipStage:character.relationship_stage,hour:new Date().getHours(),locations,previousPlans:(snapshot.sharedPlans??[]).filter((plan)=>plan.character_instance_id===character.id)};
}
function buildRecommendations(context:PlanContext,locations:Location[],companionName:string):ExploreRecommendation[]{
  const candidates:Array<{id:string;title:string;option?:PlanOption}>=[
    {id:'tonight',title:'Good for tonight',option:recommendPlanOptions({...context,intent:'tonight'})[0]},
    {id:'companion',title:`${companionName} would pick`,option:companionPick(context)},
    {id:'different',title:'Something different',option:recommendPlanOptions({...context,intent:'different'})[0]},
    {id:'liked',title:'You both liked',option:recommendPlanOptions({...context,intent:'liked'})[0]},
  ];
  const seen=new Set<string>();
  return candidates.flatMap((candidate):ExploreRecommendation[]=>{const option=candidate.option;if(!option||seen.has(option.id))return[];const location=locations.find((item)=>item.id===option.locationId);if(!location)return[];seen.add(option.id);return[{id:candidate.id,title:candidate.title,subtitle:recommendationSubtitle(candidate.id,option),option,location}];}).slice(0,4);
}
function recommendationSubtitle(id:string,option:PlanOption){if(id==='tonight')return`${option.locationName} · ${friendly(option.activityKey)}`;if(id==='companion')return`${option.locationName} feels like the right fit right now.`;if(id==='different')return`${option.locationName} breaks your recent pattern.`;return`${option.locationName} is worth doing again.`;}
function featureLocations(locations:Location[],priorityIds:string[]){const score=(location:Location)=>{const priority=priorityIds.indexOf(location.id);return(priority>=0?50-priority*5:0)+(location.sort_order??0)*-.001+(hasArtPriority(location.slug)?12:0);};return[...locations].sort((a,b)=>score(b)-score(a)).slice(0,8);}
function hasArtPriority(slug:string){return['velvet-hour','riverwalk','pixel-and-pint','paper-trail','moss-and-crumb'].includes(slug);}
function isBrowsableLocation(location:Location){return!['room','zone','transit'].includes(location.location_type)&&location.category!=='home'&&location.category!=='work'&&location.metadata?.private!==true;}
function matchesCategory(location:Location,category:ExploreCategoryId){const words=`${location.category} ${location.possible_activities.join(' ')} ${(Array.isArray(location.metadata?.tags)?location.metadata?.tags:[]).join(' ')}`.toLowerCase();if(category==='coffee')return/coffee|cafe|bakery|pastry|brunch/.test(words);if(category==='nightlife')return/bar|lounge|nightlife|cocktail|music|karaoke|comedy|drinks/.test(words);if(category==='dining')return/restaurant|dinner|food|taco|brunch/.test(words);if(category==='quiet')return/quiet|book|park|gallery|walk|outdoor|reading|coffee/.test(words);return/entertainment|cinema|movie|arcade|games|music|comedy|karaoke|trivia/.test(words);}
function peopleForWorld(snapshot:Snapshot,worldId:string):CharacterTemplate[]{return(snapshot.discoverableCharacters??[]).filter((template)=>{const instance=snapshot.characters.find((item)=>item.character_template_id===template.id);const instanceWorld=instance?snapshot.locations.find((location)=>location.id===instance.current_location_id)?.world_id:null;return instanceWorld===worldId||template.first_meeting?.world_id===worldId;});}
function friendly(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())}
