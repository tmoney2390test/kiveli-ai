import type{SupabaseClient}from'@supabase/supabase-js';
import { antiRepetitionGuidance, classifyInteractionQuality, compileCharacterGoals, compileRelationshipStance, compileResponseBrief, type CharacterGoals, type KivelleCapabilities, type PromptInteractionQuality, type RelationshipStance, type ResponseBrief } from '../../../packages/together-domain/src/index.ts';
import { buildKivelleConversationContext as buildBaseContext, type KivelleConversationContext as BaseContext } from './kivelle-conversation-context-base.ts';
import { resolveSubscriptionState } from './kivelle-subscription.ts';
import { runKivelleDirector } from './kivelle-director.ts';

type Row=Record<string,any>;
export type TieredConversationContext=BaseContext&{
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
  const memories=base.memories.slice(0,caps.memoryRetrievalBudget),sharedHistory=base.sharedHistory.slice(0,caps.historyRetrievalBudget);
  const[{data:reflection},{data:version}]=await Promise.all([
    input.db.from('together_relationship_reflections').select('*').eq('user_id',input.userId).eq('character_instance_id',input.instance.id).maybeSingle(),
    input.db.from('together_character_versions').select('character_bible,life_config,relationship_config').eq('id',input.instance.character_version_id).maybeSingle(),
  ]);
  const reflectionView=reflection?{companionView:String(reflection.companion_view??''),relationshipSummary:String(reflection.relationship_summary??''),unresolvedTension:(reflection.unresolved_tension??[]).map(String),recurringDynamics:(reflection.recurring_dynamics??[]).map(String),sharedReferences:(reflection.shared_references??[]).map(String),emotionalExpectations:(reflection.emotional_expectations??[]).map(String)}:{};
  const relationshipStance=compileRelationshipStance(base.relationship,reflectionView);
  const characterGoals=compileCharacterGoals({occupation:String(base.character?.occupation??''),currentActivity:base.currentScene.activity,bible:(version?.character_bible??{})as Record<string,unknown>,activeStory:base.activeStory?{title:String(base.activeStory.title??''),chapterTitle:String(base.activeStory.chapterTitle??''),knownSummary:String(base.activeStory.knownSummary??'')}:null,reflection:reflectionView,recentLifeEvents:base.knownLifeEvents.slice(0,2).map((event)=>({title:event.title,summary:event.summary}))});
  const interactionQuality=classifyInteractionQuality(input.userMessage) as PromptInteractionQuality;
  const assistantMessages=recent.filter((turn)=>turn.role==='assistant').map((turn)=>turn.content);
  const antiRepetition=antiRepetitionGuidance(assistantMessages);
  const baseBrief=compileResponseBrief({message:input.userMessage,interactionQuality,relationshipStance,responseIntent:undefined,openThread:base.openThreads.find((thread)=>thread.eligible)?.displaySubject,nextCommitment:base.upcomingCommitments[0]?.title,activeStory:base.activeStory?.title,recentAssistantMessages:assistantMessages});
  const director=await runKivelleDirector({context:{...base,character:{...base.character,character_bible:version?.character_bible??{},life_config:version?.life_config??{},relationship_config:version?.relationship_config??{}},relationshipStance,characterGoals,recent,userMessage:input.userMessage},baseBrief,policy:caps.directorPolicy,interactionQuality,pendingMilestone:Boolean(base.progression),activeConflict:Number(base.relationship?.conflict??0)>=45});
  const compiled:{companionView:string;relationshipSummary:string;unresolvedTension:string[];recurringDynamics:string[];sharedReferences:string[];emotionalExpectations:string[]}={companionView:relationshipStance.summary,relationshipSummary:`${relationshipStance.summary} ${relationshipStance.conflictPosture}`.trim(),unresolvedTension:Number(base.relationship?.conflict??0)>=25?[relationshipStance.conflictPosture]:[],recurringDynamics:reflectionView.recurringDynamics??[],sharedReferences:sharedHistory.slice(0,4).map((item)=>item.title),emotionalExpectations:[relationshipStance.vulnerabilityPosture,relationshipStance.affectionBoundary]};
  const shouldRefresh=!reflection||Date.now()-new Date(String(reflection.updated_at??0)).getTime()>6*3600000;
  if(shouldRefresh)void input.db.from('together_relationship_reflections').upsert({character_instance_id:input.instance.id,user_id:input.userId,continuity_id:input.instance.continuity_id??null,companion_view:compiled.companionView,relationship_summary:compiled.relationshipSummary,unresolved_tension:compiled.unresolvedTension,recurring_dynamics:compiled.recurringDynamics,shared_references:compiled.sharedReferences,emotional_expectations:compiled.emotionalExpectations,metadata:{source:'prompt_compiler',tier:subscription.tier,promptVersion:2},updated_at:new Date().toISOString()},{onConflict:'character_instance_id'});
  return{...base,character:{...base.character,character_bible:version?.character_bible??{},life_config:version?.life_config??{},relationship_config:version?.relationship_config??{}},recent,memories,sharedHistory,relationshipStance,characterGoals,relationshipReflection:reflection??compiled,responseBrief:director.brief,interactionQuality,antiRepetition,director:{used:director.directorUsed,provider:director.provider,policy:caps.directorPolicy},subscription:{tier:subscription.tier,displayName:caps.displayName,intelligenceProfile:caps.intelligenceProfile,capabilities:caps},debug:{...base.debug,limits:{...base.debug.limits,memory:caps.memoryRetrievalBudget,recentTurns:caps.recentTurnBudget,history:caps.historyRetrievalBudget}}};
}
