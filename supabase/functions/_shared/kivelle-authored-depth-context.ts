import type{SupabaseClient}from'@supabase/supabase-js';
import { authoredSearchTerms,latestUsageByKey,normalizeAuthoredText,worldFactCategories,type AuthoredContentUsage } from './kivelle-authored-depth.ts';
import { resolveRelevantWorldFacts,type RelevantWorldFact } from './kivelle-world-facts.ts';
import { resolveDialogueOpportunities,type RelevantDialogueOpportunity } from './kivelle-dialogue-opportunities.ts';
import { resolveSceneInteractionBeats,type RelevantSceneInteractionBeat } from './kivelle-scene-beats.ts';

type Row=Record<string,any>;
export type AuthoredDepthConversationContext=Row&{
  worldFacts:RelevantWorldFact[];
  dialogueOpportunities:RelevantDialogueOpportunity[];
  sceneInteractionBeats:RelevantSceneInteractionBeat[];
};

export async function attachAuthoredDepthContext(input:{
  db:SupabaseClient;userId:string;continuityId:string;conversationId:string;characterInstanceId:string;
  characterVersionId?:string|null;context:Row;now?:Date;
}):Promise<AuthoredDepthConversationContext>{
  const context=input.context as AuthoredDepthConversationContext;
  context.worldFacts=[];context.dialogueOpportunities=[];context.sceneInteractionBeats=[];
  const worldId=String(context.place?.world?.id??'');
  if(!worldId)return context;
  const locationId=nullableId(context.currentScene?.locationId??context.place?.location?.id),districtId=nullableId(context.place?.district?.id);
  const terms=authoredSearchTerms(String(context.userMessage??'')),categories=worldFactCategories(String(context.userMessage??''),String(context.queryIntent??'general'));
  const modes=interactionModes(context),now=input.now??new Date();
  try{
    const[factResult,opportunityResult,beatResult,familiarityResult,presenceResult,usageResult]=await Promise.all([
      input.db.rpc('kivelle_world_fact_candidates',{p_world_id:worldId,p_location_id:locationId,p_district_id:districtId,p_terms:terms,p_categories:categories,p_limit:20}),
      input.db.rpc('kivelle_dialogue_opportunity_candidates',{p_world_id:worldId,p_location_id:locationId,p_district_id:districtId,p_terms:terms,p_limit:15}),
      input.db.rpc('kivelle_scene_beat_candidates',{p_world_id:worldId,p_location_id:locationId,p_district_id:districtId,p_terms:[...terms,...authoredSearchTerms(String(context.currentScene?.activity??''))].slice(0,48),p_interaction_modes:modes,p_limit:15}),
      input.db.from('together_world_familiarity').select('visit_count,total_minutes,discovered_location_ids').eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('world_id',worldId).maybeSingle(),
      input.characterVersionId?input.db.from('together_character_world_presence').select('presence_type,familiarity,metadata').eq('character_version_id',input.characterVersionId).eq('world_id',worldId).maybeSingle():Promise.resolve({data:null,error:null}),
      input.db.from('together_content_usage').select('content_kind,content_key,used_at,conversation_turn').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('conversation_id',input.conversationId).in('content_kind',['world_fact','dialogue_opportunity','interaction_beat']).gte('used_at',new Date(now.getTime()-30*86400000).toISOString()).order('used_at',{ascending:false}).limit(120),
    ]);
    const errors=[factResult.error,opportunityResult.error,beatResult.error,familiarityResult.error,presenceResult.error,usageResult.error].filter(Boolean);
    if(errors.length)throw errors[0];
    const usageRows=(usageResult.data??[]).map((row:Row):AuthoredContentUsage=>({contentKind:String(row.content_kind),contentKey:String(row.content_key),usedAt:String(row.used_at),conversationTurn:row.conversation_turn==null?null:Number(row.conversation_turn)}));
    const usage=latestUsageByKey(usageRows),worldFamiliarity=worldFamiliarityScore(familiarityResult.data),characterTags=deriveCharacterTags(context.character),occupationTags=authoredSearchTerms(String(context.character?.occupation??''));
    const currentTurn=nextConversationTurn(context.recent),activeStorySlug=String(context.activeStory?.slug??'')||null,relationshipStage=String(context.relationship?.relationship_stage??context.relationship?.stage??'stranger');
    const facts=resolveRelevantWorldFacts({candidates:(factResult.data??[]) as Row[],worldId,currentLocationId:locationId,districtLocationId:districtId,userMessage:String(context.userMessage??''),queryIntent:String(context.queryIntent??'general'),contentMode:String(context.contentMode??'standard'),relationshipStage,worldFamiliarity,characterWorldFamiliarity:Number(presenceResult.data?.familiarity??0),characterPresenceType:String(presenceResult.data?.presence_type??''),characterSlug:String(context.character?.slug??''),characterOccupation:String(context.character?.occupation??''),characterTags,activeStorySlug,recentUsage:usage,currentTurn,daypart:String(context.clock?.daypart??'')});
    const selectedFactSlugs=facts.map((fact)=>fact.slug);
    const opportunities=resolveDialogueOpportunities({candidates:(opportunityResult.data??[]) as Row[],worldId,currentLocationId:locationId,districtLocationId:districtId,userMessage:String(context.userMessage??''),queryIntent:String(context.queryIntent??'general'),currentTopic:recentTopic(context.recent),contentMode:String(context.contentMode??'standard'),relationshipStage,spiceLevel:Number(context.character?.spice_level??2),characterTags,occupationTags,activeStorySlug,selectedFactSlugs,daypart:String(context.clock?.daypart??''),interactionModes:modes,recentUsage:usage,currentTurn});
    const participants=sceneParticipantCount(context),maxSocialTension=Math.max(0,...(context.sceneParticipants??[]).map((row:Row)=>Number(row.socialTension??0)));
    const participantRelationshipTypes=(context.sceneParticipants??[]).map((row:Row)=>String(row.relationshipType??'')).filter(Boolean);
    const beats=resolveSceneInteractionBeats({candidates:(beatResult.data??[]) as Row[],worldId,currentLocationId:locationId,districtLocationId:districtId,userMessage:String(context.userMessage??''),contentMode:String(context.contentMode??'standard'),relationshipStage,spiceLevel:Number(context.character?.spice_level??2),activeStorySlug,selectedFactSlugs,daypart:String(context.clock?.daypart??''),interactionModes:modes,interactionMode:String(context.currentScene?.interactionMode??'remote'),activity:String(context.currentScene?.activity??''),participantCount:participants,maxSocialTension,participantRelationshipTypes,characterTags,characterBoundaries:context.character?.boundaries,intimacyStance:context.intimacyStance??null,recentUsage:usage,now});
    context.worldFacts=facts;context.dialogueOpportunities=opportunities;context.sceneInteractionBeats=beats;
    context.debug={...(context.debug??{}),limits:{...(context.debug?.limits??{}),worldFactCandidates:(factResult.data??[]).length,worldFactsSelected:facts.length,dialogueOpportunityCandidates:(opportunityResult.data??[]).length,dialogueOpportunitiesSelected:opportunities.length,sceneBeatCandidates:(beatResult.data??[]).length,sceneBeatsSelected:beats.length}};
    await recordUsage(input,{facts,opportunities,beats,currentTurn,now});
  }catch(error){
    console.warn(JSON.stringify({level:'warn',operation:'authored_depth_resolution',conversationId:input.conversationId,characterInstanceId:input.characterInstanceId,errorCode:normalizedErrorCode(error)}));
  }
  return context;
}

async function recordUsage(input:{db:SupabaseClient;userId:string;continuityId:string;conversationId:string;characterInstanceId:string},selected:{facts:RelevantWorldFact[];opportunities:RelevantDialogueOpportunity[];beats:RelevantSceneInteractionBeat[];currentTurn:number;now:Date}){
  const rows=[...selected.facts.map((row)=>usageRow('world_fact',row.id,row.slug)),...selected.opportunities.map((row)=>usageRow('dialogue_opportunity',row.id,row.slug)),...selected.beats.map((row)=>usageRow('interaction_beat',row.id,row.slug))];
  if(!rows.length)return;
  const{error}=await input.db.from('together_content_usage').upsert(rows.map((row)=>({...row,user_id:input.userId,continuity_id:input.continuityId,conversation_id:input.conversationId,character_instance_id:input.characterInstanceId,conversation_turn:selected.currentTurn,used_at:selected.now.toISOString()})),{onConflict:'user_id,character_instance_id,conversation_id,content_kind,content_key,conversation_turn',ignoreDuplicates:true});
  if(error)console.warn(JSON.stringify({level:'warn',operation:'authored_depth_usage',conversationId:input.conversationId,errorCode:String(error.code??'usage_write_failed')}));
}

function usageRow(content_kind:string,content_key:string,slug:string){return{content_kind,content_key,metadata:{slug,selection:'prompt_candidate'}};}
function nullableId(value:unknown):string|null{const text=String(value??'');return /^[0-9a-f-]{36}$/i.test(text)?text:null;}
function nextConversationTurn(recent:Row[]):number{const last=Math.max(0,...(recent??[]).map((row)=>Number(row.conversationSequence??0)).filter(Number.isFinite));return last+1;}
function worldFamiliarityScore(row:Row|null):number{if(!row)return 0;return Math.min(100,Number(row.visit_count??0)*8+Number(row.total_minutes??0)/20+(Array.isArray(row.discovered_location_ids)?row.discovered_location_ids.length*2:0));}
function deriveCharacterTags(character:Row):string[]{const tags=new Set<string>();for(const value of[character?.slug,character?.occupation,...(character?.metadata?.tags??[])])for(const term of authoredSearchTerms(String(value??'')))tags.add(term);for(const[source,value]of Object.entries(character?.personality_config??{}))if(Number(value)>=.65)tags.add(normalizeAuthoredText(source));return[...tags];}
function interactionModes(context:Row):string[]{const rows=new Set<string>([String(context.currentScene?.interactionMode??'remote')]);if(context.currentScene?.activeDate)rows.add('active_date');if(context.currentScene?.activePlan)rows.add('active_plan');if(context.currentScene?.sceneSessionId)rows.add('shared_scene');if(context.groupContext)rows.add('group_chat');if(context.activeStory)rows.add('story');return[...rows];}
function sceneParticipantCount(context:Row):number{if(context.groupContext?.participants?.length)return Number(context.groupContext.participants.length);if(Array.isArray(context.sceneParticipants)&&context.sceneParticipants.length)return context.sceneParticipants.length;return 1;}
function recentTopic(recent:Row[]):string{return(recent??[]).slice(-4).map((row)=>String(row.content??'')).join(' ').slice(0,1200);}
function normalizedErrorCode(error:unknown){const row=error&&typeof error==='object'?error as Record<string,unknown>:{};return String(row.code??(error instanceof Error?error.name:'unknown_error')).slice(0,80);}
