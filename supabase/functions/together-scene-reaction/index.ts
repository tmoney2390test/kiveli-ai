import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context.ts';
import { ConfiguredDialogueProvider, ConfiguredModerationProvider } from '../_shared/together-ai.ts';
import { track } from '../_shared/together.ts';
import { acknowledgeConversationScene } from '../_shared/together-conversation.ts';
import { resolveDialogueRouting } from '../_shared/kivelle-ai-routing.ts';
import { compileIntimacyStance, type DialogueContentMode } from '../../../packages/together-domain/src/index.ts';
import { conversationDialogueContentMode } from '../_shared/conversation-content-mode.ts';
import { attachAuthoredDepthContext } from '../_shared/kivelle-authored-depth-context.ts';

const schema=z.object({conversationId:z.string().uuid(),characterInstanceId:z.string().uuid(),sceneActionId:z.string().uuid(),clientRequestId:z.string().min(8).max(120)});
const dialogue=new ConfiguredDialogueProvider();
const moderation=new ConfiguredModerationProvider();
const encoder=new TextEncoder();

Deno.serve(async(request)=>{
  const correlationId=request.headers.get('x-correlation-id')??crypto.randomUUID();
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  try{
    const {user,db}=await authenticated(request);const input=await parseBody(request,schema);await enforceRateLimit(db,user.id,'together_scene_reaction',30,3600);
    const continuity=await activeContinuity(db,user.id);
    const [{data:conversation},{data:action}]=await Promise.all([
      db.from('together_conversations').select('*,together_character_instances!inner(*,together_character_templates(*),together_character_versions(*))').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).is('archived_at',null).maybeSingle(),
      db.from('together_scene_actions').select('*,together_scene_sessions!inner(*)').eq('id',input.sceneActionId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).not('completed_at','is',null).maybeSingle(),
    ]);
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);
    if(!action||action.together_scene_sessions?.conversation_id!==conversation.id)throw new AppError('NOT_FOUND','That shared action is unavailable.',404);
    const existing=await db.from('together_messages').select('*').eq('conversation_id',conversation.id).eq('role','assistant').contains('provider_metadata',{sceneActionId:input.sceneActionId}).maybeSingle();
    if(existing.data)return streamText(String(existing.data.content),existing.data,correlationId);
    const now=new Date();const instance=conversation.together_character_instances as Record<string,any>;
    const lifeRun=await runLifeSimulation({db,userId:user.id,characterInstanceId:input.characterInstanceId,now,evaluateProactive:false,trigger:'conversation_continued'}).catch(()=>({state:{locationId:instance.current_location_id,activity:instance.current_activity,mood:instance.current_mood,energy:instance.current_energy,availability:'available'},activeEvent:null}));
    const label=String(action.result?.label??action.payload?.candidate?.label??action.interaction_key).replace(/_/g,' ');
    const context=await buildKivelleConversationContext({db,userId:user.id,instance,conversation,userMessage:'React naturally to the shared action that just happened.',lifeRun,now,correlationId});
    (context as Record<string,unknown>).sceneAction={id:action.id,key:action.interaction_key,label,decision:action.decision_status??action.result?.decision??'accepted',requestedInteractionKey:action.requested_interaction_key??action.interaction_key,resolvedInteractionKey:action.resolved_interaction_key??null,result:action.result,location:context.place?.path??context.currentScene.location};
    const{data:profile}=await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle();
    const requestedMode:DialogueContentMode=conversationDialogueContentMode(profile,conversation);
    const route=resolveDialogueRouting({message:label,requestedMode,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(instance.together_character_templates?.age??instance.together_character_versions?.age??0)||null,relationshipAllowsExplicit:context.relationship?.romance_enabled!==false&&context.relationship?.romance_path_status!=='friends_only'});
    context.contentMode=route.resolvedMode;
    (context as Record<string,unknown>).dialogueRouting={provider:route.provider,reason:route.reason,classification:route.classification,requestedMode:route.requestedMode,contentMode:route.resolvedMode,explicit:route.explicit};
    const intimacyStance=compileIntimacyStance({message:label,recentTurns:context.recent,relationship:{...context.relationship,spiceLevel:context.character?.spice_level,personality:context.character?.personality_config},personality:context.character?.personality_config,interactionMode:context.currentScene?.interactionMode,availability:context.currentScene?.interruptibility??context.currentScene?.availability,requestedMode});
    (context as Record<string,unknown>).intimacyStance=intimacyStance;
    await attachAuthoredDepthContext({db,userId:user.id,continuityId:continuity.id,conversationId:conversation.id,characterInstanceId:input.characterInstanceId,characterVersionId:String(instance.character_version_id??''),context,now});
    const usageScope={db,userId:user.id,continuityId:continuity.id,conversationId:conversation.id,characterInstanceId:input.characterInstanceId,subscriptionTier:context.subscription?.tier,routeReason:route.reason,contentMode:route.resolvedMode,correlationId};
    const generated=await dialogue.generate(context,{route,usageScope,operation:route.provider==='openai'?'dialogue_openai':route.provider==='xai'?'dialogue_xai':'dialogue_gemini'});
    const safe=await moderation.check(generated.text,{...usageScope,metadata:{direction:'output',source:'scene_action'}});const reply=safe.allowed?generated.text:`${String(instance.together_character_templates?.name??'Your companion')} pauses for a second, then smiles.`;
    const {data:message,error}=await db.from('together_messages').insert({conversation_id:conversation.id,user_id:user.id,character_instance_id:input.characterInstanceId,role:'assistant',content:reply,delivery_status:'complete',provider_metadata:{...generated.metadata,...(intimacyStance.active?{intimacyOutcome:intimacyStance.outcome,intimacyDisposition:intimacyStance.disposition,intimacyInteractionScope:intimacyStance.interactionScope,intimacyReasonCodes:intimacyStance.reasonCodes}:{}),source:'scene_action',sceneActionId:input.sceneActionId,sceneSessionId:action.scene_session_id,clientRequestId:input.clientRequestId,directorUsed:context.director?.used===true}}).select('*').single();
    if(error||!message)throw new AppError('INTERNAL_ERROR','Your companion could not react to that right now.',500,true);
    const acknowledged=acknowledgeConversationScene(conversation.metadata??{},String(message.created_at));
    await db.from('together_conversations').update({metadata:acknowledged.metadata,last_message_at:message.created_at,last_assistant_message_at:message.created_at,updated_at:message.created_at}).eq('id',conversation.id).eq('user_id',user.id);
    if(acknowledged.acknowledged)await track(db,user.id,'scene_arrival_acknowledged',{characterInstanceId:input.characterInstanceId,sceneActionId:input.sceneActionId});
    await track(db,user.id,'scene_action_reaction_generated',{characterInstanceId:input.characterInstanceId,sceneActionId:input.sceneActionId,interactionKey:action.interaction_key,label});
    return streamText(reply,message,correlationId);
  }catch(error){return errorResponse(error,correlationId);}
});

function streamText(content:string,message:Record<string,unknown>,correlationId:string){const stream=new ReadableStream({async start(controller){controller.enqueue(encoder.encode(`data: ${JSON.stringify({type:'start',messageId:message.id})}\n\n`));for(const token of content.match(/\S+\s*/g)??[content]){controller.enqueue(encoder.encode(`data: ${JSON.stringify({type:'token',token})}\n\n`));await new Promise((resolve)=>setTimeout(resolve,10));}controller.enqueue(encoder.encode(`data: ${JSON.stringify({type:'done',message})}\n\n`));controller.close();}});return new Response(stream,{status:200,headers:{...corsHeaders,'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Correlation-ID':correlationId}});}
