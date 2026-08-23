import { contentLevelEligible,daypartEligible,hoursCoolingDown,modeEligible,normalizeAuthoredText,relationshipStageEligible,storyEligible,termMatches,textTermMatches,type AuthoredContentUsage } from './kivelle-authored-depth.ts';

export type SceneBeatCandidate=Record<string,any>;
export type RelevantSceneInteractionBeat={id:string;slug:string;title:string;interactionType:string;seed:string;affordances:unknown;requiredFactSlug:string|null;score:number};
export type SceneBeatResolverInput={
  candidates:SceneBeatCandidate[];worldId:string;currentLocationId?:string|null;districtLocationId?:string|null;userMessage:string;
  contentMode:string;relationshipStage?:string;spiceLevel:number;activeStorySlug?:string|null;selectedFactSlugs?:string[];
  daypart?:string;interactionModes:string[];interactionMode:string;activity?:string;participantCount:number;maxSocialTension?:number;
  participantRelationshipTypes?:string[];
  characterTags?:string[];characterBoundaries?:unknown;intimacyStance?:Record<string,unknown>|null;recentUsage?:Map<string,AuthoredContentUsage>;now?:Date;maximumResults?:number;
};

export function resolveSceneInteractionBeats(input:SceneBeatResolverInput):RelevantSceneInteractionBeat[]{
  if(input.interactionMode!=='co_present')return[];
  const terms=searchTerms(`${input.userMessage} ${input.activity??''}`),facts=new Set((input.selectedFactSlugs??[]).map(normalizeAuthoredText));
  const characterTerms=(input.characterTags??[]).map(normalizeAuthoredText),boundaryText=normalizeAuthoredText(input.characterBoundaries);
  const results:RelevantSceneInteractionBeat[]=[];
  for(const row of input.candidates.slice(0,15)){
    if(String(row.world_id)!==input.worldId||row.active===false)continue;
    if(row.co_present_required!==false&&input.interactionMode!=='co_present')continue;
    if(!contentLevelEligible(row.content_level,input.contentMode)||Number(row.min_spice_level??1)>input.spiceLevel)continue;
    if(!relationshipStageEligible(input.relationshipStage,row.min_relationship_stage,row.max_relationship_stage)||!storyEligible(row.required_story_slug,input.activeStorySlug))continue;
    if(!daypartEligible(row.dayparts,input.daypart)||!modeEligible(row.interaction_modes,input.interactionModes))continue;
    const required=Number(row.required_participant_count??1),maximum=Number(row.maximum_participant_count??2);
    if(input.participantCount<required||input.participantCount>maximum)continue;
    if(['group','character_character'].includes(String(row.interaction_type))&&input.participantCount<2)continue;
    if(String(row.interaction_type)==='jealousy_context'&&Number(input.maxSocialTension??0)<.35)continue;
    if(!metadataPreconditionsEligible(row,input))continue;
    if(row.required_fact_slug&&!facts.has(normalizeAuthoredText(row.required_fact_slug)))continue;
    if(declaresCanonicalOutcome(row)||declaresUserAction(String(row.seed??'')))continue;
    if(boundaryConflict(row,boundaryText))continue;
    if(adultBeat(row)&&!intimacyAllowsBeat(input.userMessage,input.intimacyStance))continue;
    const locationMatch=Boolean(input.currentLocationId&&String(row.location_id??'')===input.currentLocationId),districtMatch=Boolean(input.districtLocationId&&String(row.district_location_id??'')===input.districtLocationId);
    const activityMatches=termMatches(row.activity_tags,terms),topicMatches=termMatches(row.topic_tags,terms)+textTermMatches(`${row.title??''} ${row.seed??''}`,terms);
    const factMatch=Boolean(row.required_fact_slug&&facts.has(normalizeAuthoredText(row.required_fact_slug))),characterMatch=termMatches(row.character_tags,characterTerms);
    if(!locationMatch&&!districtMatch&&activityMatches===0&&topicMatches===0&&!factMatch)continue;
    const usage=input.recentUsage?.get(`interaction_beat:${String(row.id)}`);
    if(hoursCoolingDown({usage,cooldownHours:Number(row.cooldown_hours??24),now:input.now}))continue;
    const score=Number(row.weight??1)*4+(locationMatch?55:0)+(districtMatch?35:0)+activityMatches*30+Math.min(50,topicMatches*18)+(factMatch?25:0)+(characterMatch?15:0);
    if(score<42)continue;
    results.push({id:String(row.id),slug:String(row.slug),title:String(row.title),interactionType:String(row.interaction_type),seed:String(row.seed),affordances:row.affordances??[],requiredFactSlug:row.required_fact_slug?String(row.required_fact_slug):null,score});
  }
  return results.sort((left,right)=>right.score-left.score||left.slug.localeCompare(right.slug)).slice(0,Math.min(input.maximumResults??1,1));
}

function adultBeat(row:SceneBeatCandidate){return String(row.interaction_type)==='adult'||String(row.content_level)==='explicit';}
function intimacyAllowsBeat(message:string,stance?:Record<string,unknown>|null){
  if(/\b(stop|no|dont|do not|not now|changed my mind|withdraw)\b/i.test(message))return false;
  if(!stance||stance.active!==true)return false;
  if(stance.shouldReciprocate===true)return true;
  const outcome=normalizeAuthoredText(stance.outcome),disposition=normalizeAuthoredText(stance.disposition);
  return['accept','accepted','reciprocate','reciprocated','proceed'].includes(outcome)&&!['decline','refuse','slow','redirect'].includes(disposition);
}
function boundaryConflict(row:SceneBeatCandidate,boundaryText:string){const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata as Record<string,unknown>:{};const tags=Array.isArray(metadata.blockedBoundaryTags)?metadata.blockedBoundaryTags.map(normalizeAuthoredText):[];return tags.some((tag)=>tag&&boundaryText.includes(tag));}
function declaresCanonicalOutcome(row:SceneBeatCandidate){const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata as Record<string,unknown>:{};return['relationshipDelta','trustDelta','attractionDelta','storyProgress','memoryMutation','automaticOutcome'].some((key)=>metadata[key]!=null);}
function declaresUserAction(seed:string){const normalized=normalizeAuthoredText(seed);return /\b(?:the )?user (?:kisses|agrees|consents|arrives|enters|drinks|confesses|has sex|commits|becomes jealous|touches|undresses)\b/.test(normalized);}
function metadataPreconditionsEligible(row:SceneBeatCandidate,input:SceneBeatResolverInput){
  const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata as Record<string,unknown>:{};
  const requiredTypes=Array.isArray(metadata.requiredParticipantRelationshipTypes)?metadata.requiredParticipantRelationshipTypes.map(normalizeAuthoredText):[];
  const actualTypes=(input.participantRelationshipTypes??[]).map(normalizeAuthoredText);
  if(requiredTypes.length&&!requiredTypes.some((type)=>actualTypes.includes(type)))return false;
  if(metadata.requiresKnownParticipant===true&&input.participantCount<2)return false;
  // These authored beats describe a canonical condition, object, record, invitation, participant role,
  // or complication. Until that state is supplied by Kivelle's story/scene model, fail closed instead
  // of letting the prompt manufacture it. An active story may satisfy the explicitly story-driven forms.
  const canonicalKeys=Object.keys(metadata).filter((key)=>key.startsWith('requiresCanonical'));
  if(canonicalKeys.length&&!input.activeStorySlug)return false;
  const unsupportedParticipantKeys=['requiresOutsiderParticipant','requiresKnowledgeableParticipants','requiresEstateStaffParticipant'];
  if(unsupportedParticipantKeys.some((key)=>metadata[key]===true))return false;
  return true;
}
function searchTerms(value:string):string[]{const tokens=normalizeAuthoredText(value).split(' ').filter((item)=>item.length>2),rows=new Set(tokens);for(let size=2;size<=3;size+=1)for(let index=0;index+size<=tokens.length;index+=1)rows.add(tokens.slice(index,index+size).join(' '));return[...rows];}
