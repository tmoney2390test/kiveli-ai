import type{SupabaseClient}from'@supabase/supabase-js';
import { antiRepetitionGuidance, classifyChemistryResponseIntent, compileCharacterGoals, compileRelationshipStance, compileResponseBrief, scoreConversationEngagement, type CharacterGoals, type KivelleCapabilities, type PromptInteractionQuality, type RelationshipStance, type RelationshipState, type ResponseBrief, type SpiceLevel } from '../../../packages/together-domain/src/index.ts';
import { buildKivelleConversationContext as buildBaseContext, type KivelleConversationContext as BaseContext } from './kivelle-conversation-context-base.ts';
import { loadConversationCommitments, type ConversationCommitment } from './kivelle-commitment-context.ts';
import { resolveSubscriptionState } from './kivelle-subscription.ts';
import { runKivelleDirector } from './kivelle-director.ts';

type Row=Record<string,any>;
export type TieredConversationContext=BaseContext&{
  commitments:ConversationCommitment[];
  subscription:{tier:string;displayName:string;intelligenceProfile:string;capabilities:KivelleCapabilities};
  relationshipStance:RelationshipStance;
  characterGoals:CharacterGoals;
  relationshipReflection:Row|null;
  responseBrief:ResponseBrief;
  interactionQuality:PromptInteractionQuality;
  antiRepetition:string[];
  director:{used:boolean;provider:string;policy:string};
};

export async function buildTieredKivelleConversationContext(input:{db:SupabaseClient;userId:string;instance:Row;conversation:Row;userMessage:string;lifeRun:Row;semanticRows?:Row[];now?:Date}):Promise<TieredConversationContext>{
  const subscription=await resolveSubscriptionState(input.db,input.userId,input.now);
  const base=await buildBaseContext(input);
  const caps=subscription.capabilities;
  let recent=base.recent.slice(-caps.recentTurnBudget);
  if(caps.recentTurnBudget>recent.length){const{data}=await input.db.from('together_messages').select('role,content,created_at').eq('conversation_id',input.conversation.id).order('created_at',{ascending:false}).limit(caps.recentTurnBudget);if(data?.length)recent=data.reverse().map((item:Row)=>({role:String(item.role),content:String(item.content)}));}
  const memoryContext={...base.memoryContext,silent:base.memoryContext.silent.slice(0,caps.memoryRetrievalBudget),callbacks:base.memoryContext.callbacks.slice(0,1),directRecall:base.memoryContext.directRecall.slice(0,Math.min(5,caps.memoryRetrievalBudget))};
  const memories=[...memoryContext.silent,...memoryContext.callbacks,...memoryContext.directRecall].map((item)=>({id:item.id,text:item.text,type:item.type,pinned:item.pinned,importance:item.importance})),sharedHistory=base.sharedHistory.slice(0,caps.historyRetrievalBudget);
  const[{data:reflection},{data:version},commitments]=await Promise.all([
    input.db.from('together_relationship_reflections').select('*').eq('user_id',input.userId).eq('character_instance_id',input.instance.id).maybeSingle(),
    input.db.from('together_character_versions').select('character_bible,life_config,relationship_config,personality_config').eq('id',input.instance.character_version_id).maybeSingle(),
    loadConversationCommitments(input.db,{userId:input.userId,continuityId:String(input.instance.continuity_id),characterInstanceId:String(input.instance.id),queryIntent:base.queryIntent,now:input.now}),
  ]);
  const reflectionView=reflection?{companionView:String(reflection.companion_view??''),relationshipSummary:String(reflection.relationship_summary??''),unresolvedTension:(reflection.unresolved_tension??[]).map(String),recurringDynamics:(reflection.recurring_dynamics??[]).map(String),sharedReferences:(reflection.shared_references??[]).map(String),emotionalExpectations:(reflection.emotional_expectations??[]).map(String)}:{};
  const personality=(version?.personality_config??base.character?.personality_config??{}) as Record<string,unknown>;const spiceLevel=normalizeSpice(base.character?.spice_level);const relationshipState=toRelationshipState(base.relationship);
  const relationshipStance=compileRelationshipStance({...base.relationship,spiceLevel,personality},reflectionView);
  const characterGoals=compileCharacterGoals({occupation:String(base.character?.occupation??''),currentActivity:base.currentScene.activity,bible:(version?.character_bible??{})as Record<string,unknown>,activeStory:base.activeStory?{title:String(base.activeStory.title??''),chapterTitle:String(base.activeStory.chapterTitle??''),knownSummary:String(base.activeStory.knownSummary??'')}:null,reflection:reflectionView,recentLifeEvents:base.knownLifeEvents.slice(0,2).map((event)=>({title:event.title,summary:event.summary}))});
  const precedingAssistantMessage=[...recent].reverse().find((turn)=>turn.role==='assistant')?.content;const recentUserMessages=recent.filter((turn)=>turn.role==='user').slice(-8).map((turn)=>turn.content);
  const interactionQuality=scoreConversationEngagement({message:input.userMessage,...(precedingAssistantMessage?{precedingAssistantMessage}:{}),recentUserMessages}).quality as PromptInteractionQuality;
  const assistantMessages=recent.filter((turn)=>turn.role==='assistant').map((turn)=>turn.content);
  const antiRepetition=antiRepetitionGuidance(assistantMessages);
  const nextCommitment=commitments.find((item)=>item.status!=='missed')??commitments[0];
  const responseIntent=classifyChemistryResponseIntent({message:input.userMessage,state:relationshipState,spiceLevel,personality,contextFit:sceneChemistryFit(base.currentScene)});
  const baseBrief=compileResponseBrief({message:input.userMessage,interactionQuality,relationshipStance,...(responseIntent?{responseIntent}:{}),openThread:base.openThreads.find((thread)=>thread.eligible)?.displaySubject,nextCommitment:nextCommitment?.title??base.upcomingCommitments[0]?.title,activeStory:base.activeStory?.title,recentAssistantMessages:assistantMessages});
  const director=await runKivelleDirector({context:{...base,commitments,character:{...base.character,character_bible:version?.character_bible??{},life_config:version?.life_config??{},relationship_config:version?.relationship_config??{}},relationshipStance,characterGoals,recent,userMessage:input.userMessage},baseBrief,policy:caps.directorPolicy,interactionQuality,pendingMilestone:Boolean(base.progression),activeConflict:Number(base.relationship?.conflict??0)>=45});
  const compiled:{companionView:string;relationshipSummary:string;unresolvedTension:string[];recurringDynamics:string[];sharedReferences:string[];emotionalExpectations:string[]}={companionView:relationshipStance.summary,relationshipSummary:`${relationshipStance.summary} ${relationshipStance.conflictPosture}`.trim(),unresolvedTension:Number(base.relationship?.conflict??0)>=25?[relationshipStance.conflictPosture]:[],recurringDynamics:reflectionView.recurringDynamics??[],sharedReferences:sharedHistory.slice(0,4).map((item)=>item.title),emotionalExpectations:[relationshipStance.vulnerabilityPosture,relationshipStance.affectionBoundary]};
  const shouldRefresh=!reflection||Date.now()-new Date(String(reflection.updated_at??0)).getTime()>6*3600000;
  if(shouldRefresh)void input.db.from('together_relationship_reflections').upsert({character_instance_id:input.instance.id,user_id:input.userId,continuity_id:input.instance.continuity_id??null,companion_view:compiled.companionView,relationship_summary:compiled.relationshipSummary,unresolved_tension:compiled.unresolvedTension,recurring_dynamics:compiled.recurringDynamics,shared_references:compiled.sharedReferences,emotional_expectations:compiled.emotionalExpectations,metadata:{source:'prompt_compiler',tier:subscription.tier,promptVersion:2},updated_at:new Date().toISOString()},{onConflict:'character_instance_id'});
  return{...base,commitments,character:{...base.character,character_bible:version?.character_bible??{},life_config:version?.life_config??{},relationship_config:version?.relationship_config??{}},recent,memories,memoryContext,sharedHistory,relationshipStance,characterGoals,relationshipReflection:reflection??compiled,responseBrief:director.brief,interactionQuality,antiRepetition,director:{used:director.directorUsed,provider:director.provider,policy:caps.directorPolicy},subscription:{tier:subscription.tier,displayName:caps.displayName,intelligenceProfile:caps.intelligenceProfile,capabilities:caps},debug:{...base.debug,limits:{...base.debug.limits,memory:caps.memoryRetrievalBudget,recentTurns:caps.recentTurnBudget,history:caps.historyRetrievalBudget,commitments:['plan','schedule','date'].includes(base.queryIntent)?8:4}}};
}

function normalizeSpice(value:unknown):SpiceLevel{const parsed=Number(value);return parsed===1||parsed===3?parsed:2;}
function toRelationshipState(value:Row):RelationshipState{return{stage:String(value.relationship_stage??value.stage??'stranger') as RelationshipState['stage'],trust:Number(value.trust??0),comfort:Number(value.comfort??0),attraction:Number(value.attraction??0),affinity:Number(value.affinity??0),familiarity:Number(value.familiarity??0),respect:Number(value.respect??0),conflict:Number(value.conflict??0),romantic_interest:Number(value.romantic_interest??0),commitment:Number(value.commitment??0),conversationCount:Number(value.interaction_turn_count??value.conversation_count??0),conversationSessionCount:Number(value.conversation_session_count??0),meaningfulInteractionCount:Number(value.meaningful_interaction_count??0),engagementScore:Number(value.engagement_score??0),genuineBackAndForthTurns:Number(value.genuine_back_and_forth_turns??0),trivialEngagementScore:Number(value.trivial_engagement_score??0),chemistryHeat:Number(value.chemistry_heat??0),physicalTension:Number(value.physical_tension??0),userFlirtSignals:Number(value.user_flirt_signals??0),characterFlirtSignals:Number(value.character_flirt_signals??0),mutualFlirtSignals:Number(value.mutual_flirt_signals??0),attractionAcknowledged:Boolean(value.attraction_acknowledged),...(value.last_chemistry_change_at?{lastChemistryChangeAt:String(value.last_chemistry_change_at)}:{}),...(value.last_flirt_signal_at?{lastFlirtSignalAt:String(value.last_flirt_signal_at)}:{}),activeMajorConflict:Boolean(value.active_major_conflict),romanceEnabled:value.romance_enabled!==false,romancePathStatus:String(value.romance_path_status??'open') as RelationshipState['romancePathStatus']};}
function sceneChemistryFit(scene:Row):number{const interruptibility=String(scene?.interruptibility??scene?.availability??'open');if(interruptibility==='busy'||interruptibility==='unavailable')return.2;const activity=String(scene?.activity??'').toLowerCase();if(/\b(work|meeting|sleep|driving|appointment|casework)\b/.test(activity))return.25;if(/\b(date|drinks|karaoke|dancing|dinner|rooftop|walk|music)\b/.test(activity))return.85;return interruptibility==='limited'?.45:.65;}
