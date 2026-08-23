import { contentLevelEligible,daypartEligible,isCasualGreeting,isDirectAuthoredQuery,modeEligible,normalizeAuthoredText,relationshipStageEligible,storyEligible,termMatches,textTermMatches,turnsCoolingDown,type AuthoredContentUsage } from './kivelle-authored-depth.ts';

export type DialogueOpportunityCandidate=Record<string,any>;
export type RelevantDialogueOpportunity={id:string;slug:string;topic:string;angle:string;framing:string;requiredFactSlug:string|null;score:number};
export type DialogueOpportunityResolverInput={
  candidates:DialogueOpportunityCandidate[];worldId:string;currentLocationId?:string|null;districtLocationId?:string|null;
  userMessage:string;queryIntent?:string;currentTopic?:string;contentMode:string;relationshipStage?:string;spiceLevel:number;
  characterTags?:string[];occupationTags?:string[];activeStorySlug?:string|null;selectedFactSlugs?:string[];
  daypart?:string;interactionModes:string[];recentUsage?:Map<string,AuthoredContentUsage>;currentTurn?:number|null;maximumResults?:number;
};

export function resolveDialogueOpportunities(input:DialogueOpportunityResolverInput):RelevantDialogueOpportunity[]{
  if(isCasualGreeting(input.userMessage))return[];
  const terms=searchTerms(`${input.currentTopic??''} ${input.userMessage}`),direct=isDirectAuthoredQuery(input.userMessage,input.queryIntent);
  const characterTerms=[...(input.characterTags??[]),...(input.occupationTags??[])].map(normalizeAuthoredText).filter(Boolean);
  const facts=new Set((input.selectedFactSlugs??[]).map(normalizeAuthoredText));
  const results:RelevantDialogueOpportunity[]=[];
  for(const row of input.candidates.slice(0,15)){
    if(String(row.world_id)!==input.worldId||row.active===false)continue;
    if(!contentLevelEligible(row.content_level,input.contentMode)||Number(row.min_spice_level??1)>input.spiceLevel)continue;
    if(!relationshipStageEligible(input.relationshipStage,row.min_relationship_stage,row.max_relationship_stage)||!storyEligible(row.required_story_slug,input.activeStorySlug))continue;
    if(!daypartEligible(row.dayparts,input.daypart)||!modeEligible(row.interaction_modes,input.interactionModes))continue;
    if(row.required_fact_slug&&!facts.has(normalizeAuthoredText(row.required_fact_slug)))continue;
    const triggerMatches=termMatches(row.trigger_terms,terms),topicMatches=termMatches(row.topic_tags,terms)+textTermMatches(`${row.topic??''} ${row.angle??''}`,terms);
    const factMatch=Boolean(row.required_fact_slug&&facts.has(normalizeAuthoredText(row.required_fact_slug)));
    const locationMatch=Boolean(input.currentLocationId&&String(row.location_id??'')===input.currentLocationId),districtMatch=Boolean(input.districtLocationId&&String(row.district_location_id??'')===input.districtLocationId);
    const characterMatch=termMatches([...(row.character_tags??[]),...(row.occupation_tags??[])],characterTerms);
    // Location alone is not permission to hijack an established subject.
    if(triggerMatches===0&&topicMatches===0&&!factMatch)continue;
    const usage=input.recentUsage?.get(`dialogue_opportunity:${String(row.id)}`);
    if(turnsCoolingDown({usage,currentTurn:input.currentTurn,cooldownTurns:Number(row.cooldown_turns??24),directOverride:direct&&(triggerMatches>0||topicMatches>0)}))continue;
    let score=Number(row.weight??1)*4+triggerMatches*60+Math.min(70,topicMatches*28)+(factMatch?35:0)+(locationMatch?25:0)+(districtMatch?15:0)+(characterMatch?20:0);
    if(direct)score+=10;
    if(score<50)continue;
    results.push({id:String(row.id),slug:String(row.slug),topic:String(row.topic),angle:String(row.angle),framing:String(row.framing??''),requiredFactSlug:row.required_fact_slug?String(row.required_fact_slug):null,score});
  }
  return results.sort((left,right)=>right.score-left.score||left.slug.localeCompare(right.slug)).slice(0,Math.min(input.maximumResults??2,2));
}

function searchTerms(value:string):string[]{const tokens=normalizeAuthoredText(value).split(' ').filter((item)=>item.length>2),rows=new Set(tokens);for(let size=2;size<=3;size+=1)for(let index=0;index+size<=tokens.length;index+=1)rows.add(tokens.slice(index,index+size).join(' '));return[...rows];}
