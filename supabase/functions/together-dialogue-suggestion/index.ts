import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { getActiveConversation } from '../_shared/together-conversation.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context-base.ts';
import { ConfiguredModerationProvider } from '../_shared/together-ai.ts';
import { ConfiguredAutoDialogueProvider } from '../_shared/together-auto-dialogue.ts';
import { deterministicAutoDialogue, type AutoDialogueInput } from '../../../packages/together-domain/src/auto-dialogue.ts';
import { track } from '../_shared/together.ts';
import { conversationDialogueContentMode } from '../_shared/conversation-content-mode.ts';
// Keep this transitive dependency visible to Supabase's function bundler.
import '../../../packages/together-domain/src/wavespeed.ts';

const schema=z.object({conversationId:z.string().uuid(),characterInstanceId:z.string().uuid(),anchorMessageId:z.string().uuid(),clientRequestId:z.string().min(8).max(120),preference:z.enum(['natural','shorter','detailed','romantic','assertive']).default('natural')});
const suggestions=new ConfiguredAutoDialogueProvider(),moderation=new ConfiguredModerationProvider();

Deno.serve(async(request)=>{
  const correlationId=request.headers.get('x-correlation-id')??crypto.randomUUID();
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  try{
    const{user,db}=await authenticated(request),input=await parseBody(request,schema);
    await enforceRateLimit(db,user.id,'together_dialogue_suggestion',80,3600);
    const continuity=await activeContinuity(db,user.id);
    const[{data:conversation},{data:latest},{data:pendingMilestone},{data:entitlement},{data:profile}]=await Promise.all([
      db.from('together_conversations').select('*,together_character_instances!inner(*,together_character_templates(*),together_character_versions(*))').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).is('archived_at',null).is('user_archived_at',null).maybeSingle(),
      db.from('together_messages').select('id,role,content,created_at,provider_metadata').eq('conversation_id',input.conversationId).eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      db.from('together_relationship_milestones').select('id').eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId).eq('status','pending').maybeSingle(),
      db.from('together_entitlements').select('tier,expires_at').eq('user_id',user.id).maybeSingle(),
      db.from('together_profiles').select('content_preferences').eq('user_id',user.id).maybeSingle(),
    ]);
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);
    const active=await getActiveConversation(db,user.id,input.characterInstanceId);
    if(active?.id!==conversation.id)throw new AppError('CONVERSATION_ARCHIVED','This conversation is no longer active.',409,true);
    if(!latest||latest.id!==input.anchorMessageId||latest.role!=='assistant')throw new AppError('STALE_SUGGESTION','The conversation moved forward. Try again for a fresh suggestion.',409,true);
    if(pendingMilestone)throw new AppError('CANONICAL_CHOICE_REQUIRED','Choose how you want to respond to this relationship moment.',409);

    const instance=conversation.together_character_instances as Record<string,any>,now=new Date();
    const lifeRun={state:{locationId:instance.current_location_id,location:'Current place',activity:instance.current_activity,mood:instance.current_mood,energy:instance.current_energy,availability:instance.current_interruptibility==='unavailable'?'unavailable':'available',interruptibility:instance.current_interruptibility,source:instance.current_presence_source??'character_state'},stateSource:instance.current_presence_source??'character_state',presence:{},activeEvent:null};
    const context=await buildKivelleConversationContext({db,userId:user.id,instance,conversation,userMessage:String(latest.content),lifeRun,now});
    const speakerName=typeof latest.provider_metadata?.speakerName==='string'?latest.provider_metadata.speakerName:String(context.character?.name??instance.together_character_templates?.name??'Companion');
    const template=relationRecord(instance.together_character_templates),chatPreferences=relationRecord(conversation.metadata?.chatPreferences),subscribed=Boolean(entitlement?.tier&&entitlement.tier!=='free'&&(!entitlement.expires_at||new Date(String(entitlement.expires_at))>now)),override=Number(chatPreferences.spiceLevel),authoredSpice=Number(template.spice_level??context.character?.spice_level??2),effectiveSpice=subscribed&&[1,2,3].includes(override)?override:[1,2,3].includes(authoredSpice)?authoredSpice:2;
    const generationInput:AutoDialogueInput={
      characterName:speakerName,latestAssistantMessage:String(latest.content),recent:context.recent,preference:input.preference,
      scene:{interactionMode:context.currentScene.interactionMode,location:context.currentScene.location,activity:context.currentScene.activity,mood:context.currentScene.mood,energy:context.currentScene.energy,availability:context.currentScene.availability,interruptibility:context.currentScene.interruptibility,departurePressure:context.currentScene.sceneBehavior.departurePressure,nextObligation:context.currentScene.nextObligation?.title,participantNames:context.sceneParticipants.map((participant)=>participant.name)},
      relationshipStage:String(context.relationship?.relationship_stage??instance.relationship_stage??'stranger'),
      contentMode:conversationDialogueContentMode(profile,conversation),intimacyOutcome:normalizeIntimacyOutcome(latest.provider_metadata?.intimacyOutcome),
      relationship:{romanceEnabled:context.relationship?.romance_enabled!==false,friendsOnly:context.relationship?.romance_path_status==='friends_only',conflict:Number(context.relationship?.conflict??0),chemistryHeat:Number(context.relationship?.chemistry_heat??0),spiceLevel:effectiveSpice,trust:Number(context.relationship?.trust??0),comfort:Number(context.relationship?.comfort??0)},
      userName:personaName(context.persona),openThread:context.openThreads.find((thread)=>thread.eligible)?.displaySubject,upcomingCommitment:context.upcomingCommitments[0]?.title,activePlan:context.currentScene.activePlan?.title,activeDate:context.currentScene.activeDate?.title,activeStory:typeof context.activeStory?.title==='string'?context.activeStory.title:undefined,conversationFocus:typeof context.conversationFocus?.title==='string'?context.conversationFocus.title:undefined,emotionalTone:context.emotionalResidue?.tone,voiceHints:voiceHints(context.persona,context.userPatterns),
    };
    const usageScope={db,userId:user.id,continuityId:continuity.id,conversationId:input.conversationId,characterInstanceId:input.characterInstanceId,subscriptionTier:String(entitlement?.tier??'free'),correlationId,contentMode:'auto_dialogue'};
    const fallback=deterministicAutoDialogue(generationInput),generated=await suggestions.generate(generationInput,{usageScope}),safety=await moderation.check(generated.text,usageScope);
    const text=safety.allowed?generated.text:fallback,source=safety.allowed?generated.source:'deterministic';
    const expiresAt=new Date(now.getTime()+10*60_000).toISOString();
    await track(db,user.id,'auto_dialogue_suggestion_generated',{characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,anchorMessageId:latest.id,source,intent:generated.intent,preference:generated.preference,clientRequestId:input.clientRequestId});
    return json({data:{suggestionId:crypto.randomUUID(),text,source,intent:generated.intent,preference:generated.preference,anchorMessageId:latest.id,expiresAt},correlationId},200,correlationId);
  }catch(error){return errorResponse(error,correlationId);}
});

function personaName(persona:Record<string,any>):string|undefined{const value=persona?.display_name??persona?.name;return typeof value==='string'&&value.trim()?value.trim():undefined;}
function normalizeIntimacyOutcome(value:unknown):AutoDialogueInput['intimacyOutcome']{return value==='accepted'||value==='pacing_delay'||value==='context_limit'||value==='declined'||value==='withdrawn'?value:undefined;}
function relationRecord(value:unknown):Record<string,any>{const row=Array.isArray(value)?value[0]:value;return row&&typeof row==='object'?row as Record<string,any>:{};}
function voiceHints(persona:Record<string,any>,patterns:Array<{category:string;summary:string;confidence:number}>):string[]{
  const communication=relationRecord(persona?.communication_config),configured=Object.entries(communication).filter(([,value])=>typeof value==='string'||typeof value==='boolean').slice(0,3).map(([key,value])=>`${key.replace(/[_-]+/g,' ')}: ${String(value)}`);
  const learned=patterns.filter((pattern)=>pattern.confidence>=.65&&['conversation_pacing','competition_play','social_energy'].includes(pattern.category)).slice(0,2).map((pattern)=>pattern.summary);
  return[...configured,...learned].slice(0,4);
}
