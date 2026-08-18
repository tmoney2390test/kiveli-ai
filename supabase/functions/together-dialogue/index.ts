import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { ConfiguredConversationAnalysisProvider, ConfiguredDialogueProvider, ConfiguredEmbeddingProvider, ConfiguredModerationProvider, dialogueProviderName } from '../_shared/together-ai.ts';
import { classifyContent, routeDialogueProvider } from '../_shared/kivelle-intelligence.ts';
import { mergeConversationSummary, relationshipMetrics, track } from '../_shared/together.ts';
import { applyConversationEngagement, applyInteractionProposal, detectFlirtSignal, scoreConversationEngagement, selectSceneSpeakers, updateChemistry, type ChemistrySignal, type RelationshipState, type SpiceLevel } from '../../../packages/together-domain/src/index.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context.ts';
import { acknowledgeConversationScene, getActiveConversation, mergeConversationSceneMetadata, resolveActiveConversationScene } from '../_shared/together-conversation.ts';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { waitUntil } from '../_shared/background.ts';
import { writeConversationEvent } from '../_shared/together-plans.ts';
import { activeContinuity } from '../_shared/together-continuity.ts';
import { extendScheduleForConversation } from '../_shared/together-schedule.ts';
import { markMentionedMemories } from '../_shared/kivelle-memory.ts';
import { deriveEmotionalResidue, upsertEmotionalResidue } from '../_shared/kivelle-emotional-residue.ts';
import { recordChatPlaceOpinions } from '../_shared/kivelle-place-perspective.ts';
import type { PlaceContext } from '../_shared/together-place.ts';

const schema = z.object({ conversationId: z.string().uuid(), message: z.string().max(4000).default(''), attachmentIds:z.array(z.string().uuid()).max(4).default([]), clientRequestId: z.string().min(8).max(100), characterInstanceId: z.string().uuid(), focusPlanId:z.string().uuid().optional(), entryContext:z.object({entryReason:z.literal('user_drop_in'),locationId:z.string().uuid(),scheduleEventId:z.string().uuid().optional()}).optional() }).refine((value)=>value.message.trim().length>0||value.attachmentIds.length>0,{message:'Write a message or attach a photo.'});
const dialogue = new ConfiguredDialogueProvider();
const moderation = new ConfiguredModerationProvider();
const embeddings = new ConfiguredEmbeddingProvider();
const analysis = new ConfiguredConversationAnalysisProvider();
const encoder = new TextEncoder();

Deno.serve(async (request) => {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const { user, db } = await authenticated(request);
    await enforceRateLimit(db, user.id, 'together_dialogue', 80, 3600);
    const input = await parseBody(request, schema);
    const continuity=await activeContinuity(db,user.id);
    const { data: conversation } = await db.from('together_conversations').select('*,together_character_instances!inner(*,together_character_templates(*),together_character_versions(*))').eq('id', input.conversationId).eq('user_id', user.id).eq('continuity_id',continuity.id).eq('character_instance_id', input.characterInstanceId).maybeSingle();
    if (!conversation) throw new AppError('NOT_FOUND', 'That conversation is unavailable.', 404);
    const userText=input.message.trim();
    const contextText=userText||'The user shared an image without a caption.';
    const attachments=input.attachmentIds.length?(await db.from('together_conversation_attachments').select('*').in('id',input.attachmentIds).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('conversation_id',input.conversationId).eq('kind','image').eq('upload_status','uploaded').is('message_id',null)).data??[]:[];
    if(attachments.length!==input.attachmentIds.length)throw new AppError('VALIDATION_FAILED','One of those photos is no longer available to send.',422);
    const activeConversation = await getActiveConversation(db, user.id, input.characterInstanceId);
    if (conversation.archived_at || activeConversation?.id !== conversation.id) throw new AppError('CONVERSATION_ARCHIVED', 'This conversation is no longer active.', 409, true);
    if(input.focusPlanId){
      const{data:focusedPlan}=await db.from('together_shared_plans').select('id').eq('id',input.focusPlanId).eq('user_id',user.id).eq('character_instance_id',input.characterInstanceId).maybeSingle();
      if(focusedPlan){const focus={type:'plan',planId:focusedPlan.id,updatedAt:new Date().toISOString()};conversation.metadata={...(conversation.metadata??{}),focus};await db.from('together_conversations').update({metadata:conversation.metadata}).eq('id',conversation.id).eq('user_id',user.id);}
    }

    const existing = await db.from('together_messages').select('*').eq('conversation_id', input.conversationId).eq('client_request_id', input.clientRequestId).maybeSingle();
    if (existing.data) {
      const replay = await db.from('together_messages').select('*').eq('conversation_id', input.conversationId).eq('role', 'assistant').gt('created_at', existing.data.created_at).order('created_at').limit(1).maybeSingle();
      if (replay.data) return streamText(replay.data.content, replay.data, correlationId);
      throw new AppError('CONFLICT', 'That message is already being processed.', 409, true);
    }

    const inputSafety = await moderation.check(contextText);
    const contentClassification = classifyContent(userText);
    const characterName = String((conversation.together_character_instances as Record<string, any>).together_character_templates?.name ?? 'Companion');
    const scriptedBoundary = boundaryResponse(userText, characterName, contentClassification);
    if (scriptedBoundary || !inputSafety.allowed) {
      const boundary = scriptedBoundary ?? { text: `${characterName} pauses. “I’m not comfortable taking the conversation in that direction. We can change the subject.”`, storeOriginal: false, category: 'moderated_input' };
      const { data: boundaryUserMessage, error: boundaryUserError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'user', content: boundary.storeOriginal ? input.message : '[Message withheld by safety controls]', client_request_id: input.clientRequestId, delivery_status: 'complete', provider_metadata: { safety_redirected: true } }).select('*').single();
      if (boundaryUserError || !boundaryUserMessage) throw new AppError('INTERNAL_ERROR', 'Your message could not be handled safely.', 500, true);
      if(attachments.length)await db.from('together_conversation_attachments').update({message_id:boundaryUserMessage.id,updated_at:new Date().toISOString()}).in('id',input.attachmentIds).eq('user_id',user.id).is('message_id',null);
      const { data: boundaryMessage, error: boundaryError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'assistant', content: boundary.text, delivery_status: 'complete', provider_metadata: { provider: 'scripted-boundary', safety_category: boundary.category } }).select('*').single();
      if (boundaryError || !boundaryMessage) throw new AppError('INTERNAL_ERROR', `${characterName} could not respond.`, 500, true);
      await db.from('together_safety_events').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, direction: 'input', categories: [...new Set([...inputSafety.categories, boundary.category])], action: 'redirected' });
      await db.from('together_conversations').update({ last_message_at: boundaryMessage.created_at, updated_at: boundaryMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
      await acknowledgeArrival(db,user.id,conversation,String(boundaryMessage.created_at));
      await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId, safetyRedirected: true });
      await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId, safetyRedirected: true });
      return streamText(boundary.text, boundaryMessage, correlationId);
    }

    const { data: userMessage, error: insertError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: input.characterInstanceId, role: 'user', content: userText||'[Photo]', client_request_id: input.clientRequestId, delivery_status: 'complete' }).select('*').single();
    if (insertError || !userMessage) throw new AppError('INTERNAL_ERROR', 'Your message could not be saved.', 500, true);
    if(attachments.length){const{error:attachmentError}=await db.from('together_conversation_attachments').update({message_id:userMessage.id,updated_at:new Date().toISOString()}).in('id',input.attachmentIds).eq('user_id',user.id).is('message_id',null);if(attachmentError)throw new AppError('INTERNAL_ERROR','Your photo could not be attached to the message.',500,true);await track(db,user.id,'user_photo_sent',{attachmentCount:attachments.length,characterInstanceId:input.characterInstanceId});}

    const instance = conversation.together_character_instances as Record<string, any>;
    const now = new Date();
    const lifeRun = await runLifeSimulation({ db, userId:user.id, characterInstanceId:input.characterInstanceId, now, evaluateProactive:false, trigger:'conversation_continued' }).catch((error) => {
      console.error(JSON.stringify({ level:'error', correlationId, operation:'lazy_conversation_simulation', message:error instanceof Error?error.message:'unknown_error' }));
      return { state:{ locationId:instance.current_location_id, location:'Current place', activity:instance.current_activity, mood:instance.current_mood, energy:instance.current_energy, availability:'available' }, activeEvent:null };
    });
    const presence=(((lifeRun as Record<string,unknown>).presence)??{}) as Record<string,any>;
    const sceneResolution=await resolveActiveConversationScene({db,userId:user.id,conversation,characterInstanceId:input.characterInstanceId,now});
    if(sceneResolution.expired){conversation.metadata=mergeConversationSceneMetadata((conversation.metadata??{}) as Record<string,any>,null);await db.from('together_conversations').update({metadata:conversation.metadata,updated_at:now.toISOString()}).eq('id',conversation.id).eq('user_id',user.id);await track(db,user.id,'scene_expired',{characterInstanceId:input.characterInstanceId});}
    else if(sceneResolution.scene){conversation.metadata=mergeConversationSceneMetadata((conversation.metadata??{}) as Record<string,any>,sceneResolution.scene);}
    const activeScene=(conversation.metadata?.activeScene??{}) as Record<string,any>;
    const extended=await extendScheduleForConversation({db,userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,scheduleEventId:typeof activeScene.scheduleEventId==='string'?activeScene.scheduleEventId:undefined,now}).catch(()=>null);
    if(extended)await track(db,user.id,'scene_extended_past_schedule_boundary',{characterInstanceId:input.characterInstanceId,scheduleEventId:activeScene.scheduleEventId});
    const queryEmbedding = await embeddings.embed(contextText);
    const recallThreshold=/\b(remember|forgot|what was|what did we|who is|when did|where did)\b/i.test(contextText)?.48:/\b(last time|before|our first|used to|history)\b/i.test(contextText)?.54:/\b(scene|here|this place|tonight)\b/i.test(contextText)?.58:.60;
    const semanticResult = queryEmbedding ? await db.rpc('together_match_memories_server', { p_user_id:user.id, p_character_instance_id:input.characterInstanceId, p_embedding:queryEmbedding, p_limit:12, p_min_similarity:recallThreshold }) : { data:[], error:null };
    const refreshedScene=await resolveActiveConversationScene({db,userId:user.id,conversation,characterInstanceId:input.characterInstanceId,now});
    if(refreshedScene.expired){conversation.metadata=mergeConversationSceneMetadata((conversation.metadata??{}) as Record<string,any>,null);await db.from('together_conversations').update({metadata:conversation.metadata,updated_at:now.toISOString()}).eq('id',conversation.id).eq('user_id',user.id);await track(db,user.id,'scene_expired',{characterInstanceId:input.characterInstanceId});}else if(refreshedScene.scene)conversation.metadata=mergeConversationSceneMetadata((conversation.metadata??{}) as Record<string,any>,refreshedScene.scene);
    // runLifeSimulation may have moved the character after the conversation
    // query loaded its nested instance. Carry its freshly resolved passive
    // state forward so a pre-simulation row can never reclaim present reality.
    const freshLifeState=(((lifeRun as Record<string,unknown>).state)??{}) as Record<string,any>;
    const currentInstance={...instance,
      current_location_id:freshLifeState.locationId??instance.current_location_id,
      current_activity:freshLifeState.activity??instance.current_activity,
      current_mood:freshLifeState.mood??instance.current_mood,
      current_energy:freshLifeState.energy??instance.current_energy,
      current_interruptibility:freshLifeState.interruptibility??presence.interruptibility??instance.current_interruptibility,
      current_presence_source:(lifeRun as Record<string,unknown>).stateSource??instance.current_presence_source,
    };
    let dialogueContext = await buildKivelleConversationContext({ db, userId:user.id, instance:currentInstance, conversation, userMessage:contextText, lifeRun, semanticRows:semanticResult.data??[], attachments, now });
    if(dialogueContext.currentScene.sceneSessionId)await recordSceneMessage(db,{userId:user.id,continuityId:continuity.id,sceneId:dialogueContext.currentScene.sceneSessionId,message:userMessage,role:'user'});
    const speakerSelection=selectSceneSpeakers({message:contextText,candidates:(dialogueContext.sceneParticipants??[]).map((participant)=>({characterInstanceId:participant.characterInstanceId,name:participant.name,role:participant.role as 'primary_companion'|'participant'|'guest',available:true,socialEnergy:participant.socialEnergy,directness:participant.directness,topicRelevance:participant.relationshipRelevance,knowledgeRelevance:participant.relationshipRelevance})),maxSpeakers:2});
    const primarySpeakerId=speakerSelection.speakerInstanceIds[0]??input.characterInstanceId;
    const selected=await dialogueSpeaker(db,user.id,continuity.id,primarySpeakerId,dialogueContext);
    dialogueContext=selected.context;
    const profileResult = await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id', user.id).maybeSingle();
    const adultEligible = Boolean(profileResult.data?.age_verified_at) && Number(dialogueContext.character.age ?? 0) >= 18;
    const requestedMode = adultEligible ? profileResult.data?.content_preferences?.contentMode ?? 'standard' : 'standard';
    const route = routeDialogueProvider(dialogueProviderName(), requestedMode);
    dialogueContext.contentMode = route.resolvedMode;
    const relationshipResult = { data:dialogueContext.relationship };
    const characterTemplate = dialogueContext.character;
    if (dialogueProviderName() !== 'deterministic') {
      return streamDialogue({ db, user, input, conversation, instance:selected.instance, relationship: relationshipResult.data, userMessage, context: dialogueContext, correlationId,primarySpeakerId,remainingSpeakerIds:speakerSelection.speakerInstanceIds.slice(1) });
    }
    const responseText = await dialogue.generate(dialogueContext);
    const outputSafety = await moderation.check(responseText);
    const safeText = outputSafety.allowed ? responseText : "I want to answer thoughtfully, but I need to steer this conversation somewhere safer. We can talk about what you're feeling without crossing that line.";
    if (!outputSafety.allowed) await db.from('together_safety_events').insert({ user_id: user.id, character_instance_id: input.characterInstanceId, direction: 'output', categories: outputSafety.categories, action: 'replaced' });
    const { data: assistantMessage, error: assistantError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: primarySpeakerId, speaker_character_instance_id:primarySpeakerId, role: 'assistant', content: safeText, delivery_status: 'complete', provider_metadata: { provider: dialogueProviderName(), model: Deno.env.get('TOGETHER_DIALOGUE_MODEL') ?? Deno.env.get('TOGETHER_GEMINI_MODEL') ?? 'configured-default',speakerName:characterTemplate.name,speakerSlug:characterTemplate.slug } }).select('*').single();
    if (assistantError || !assistantMessage) throw new AppError('INTERNAL_ERROR', `${String(characterTemplate.name ?? 'Your companion')} replied, but the response could not be saved.`, 500, true);
    if(dialogueContext.currentScene.sceneSessionId)await recordSceneMessage(db,{userId:user.id,continuityId:continuity.id,sceneId:dialogueContext.currentScene.sceneSessionId,message:assistantMessage,role:'character',characterInstanceId:primarySpeakerId});
    await safelyApplyConversationEffects(db, user.id, primarySpeakerId, input.conversationId, userMessage.id, String(assistantMessage.id), userText, safeText, relationshipResult.data, String(selected.instance.relationship_stage), dialogueContext, correlationId);
    if(dialogueContext.currentScene.sceneSessionId)await copyWitnessedUserMemories(db,{userId:user.id,continuityId:continuity.id,sceneId:dialogueContext.currentScene.sceneSessionId,userMessageId:String(userMessage.id),sourceCharacterInstanceId:primarySpeakerId});
    await db.from('together_conversations').update({ last_message_at: assistantMessage.created_at, updated_at: assistantMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
    await acknowledgeArrival(db,user.id,conversation,String(assistantMessage.created_at));
    const generatedMedia=primarySpeakerId===input.characterInstanceId?await safelyQueueConversationPhoto(db, user.id, input, String(assistantMessage.id), safeText, correlationId,dialogueContext):null;
    await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId });
    await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId });
    const additionalMessages=await generateAdditionalSceneReplies(db,{userId:user.id,continuityId:continuity.id,conversationId:input.conversationId,userMessageId:String(userMessage.id),userText,baseContext:dialogueContext,speakerIds:speakerSelection.speakerInstanceIds.slice(1),primaryReply:safeText,sceneId:dialogueContext.currentScene.sceneSessionId});
    return streamText(safeText, assistantMessage, correlationId,additionalMessages,generatedMedia);
  } catch (error) { return errorResponse(error, correlationId); }
});

function streamText(content: string, message: Record<string, unknown>, correlationId: string,additionalMessages:Record<string,unknown>[]=[],generatedMedia:Record<string,unknown>|null=null): Response {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', messageId: message.id })}\n\n`));
      const parts = content.match(/\S+\s*/g) ?? [content];
      for (const token of parts) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`)); await new Promise((resolve) => setTimeout(resolve, 12)); }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', message,additionalMessages,generatedMedia })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Correlation-ID': correlationId } });
}

function boundaryResponse(message: string, characterName: string, classification: ReturnType<typeof classifyContent>): { text: string; storeOriginal: boolean; category: string } | null {
  if (classification.sexual && classification.minorRelated) return { text: `${characterName}’s expression turns serious. “No. I won’t engage with sexual content involving anyone under 18.”`, storeOriginal: false, category: 'sexual_minors' };
  if (classification.sexual && classification.coercive) return { text: `${characterName} pauses. “I’m not going to engage with sexual pressure, coercion, or anything without clear consent.”`, storeOriginal: false, category: 'sexual_coercion' };
  const explicit = /\b(nudes?|naked|strip|tits?|boobs?|breasts?|sex|sexual|horny|pussy|dick|cock|fuck(?:ing)?|ass)\b/i.test(message);
  if (!explicit) return null;
  const minor = /\b(minors?|children?|underage|teen(?:ager)?s?|young girls?|young boys?)\b/i.test(message);
  if (minor) return { text: `${characterName}’s expression turns serious. “No. I won’t engage with sexual content involving anyone under 18.”`, storeOriginal: false, category: 'sexual_minors' };
  return { text: `${characterName} raises an eyebrow. “Bold—but I’m not doing nude photos. You can flirt with me, but keep it non-explicit.”`, storeOriginal: true, category: 'sexual_explicit' };
}

function streamDialogue({ db, user, input, conversation, instance, relationship, userMessage, context, correlationId,primarySpeakerId,remainingSpeakerIds }: { db: any; user: { id: string }; input: z.infer<typeof schema>; conversation: Record<string, unknown>; instance: Record<string, unknown>; relationship: Record<string, unknown>; userMessage: Record<string, unknown>; context: Parameters<ConfiguredDialogueProvider['generate']>[0]; correlationId: string;primarySpeakerId:string;remainingSpeakerIds:string[] }): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        emit({ type: 'start', messageId: crypto.randomUUID() });
        let content = '';
        for await (const token of dialogue.stream(context)) {
          content += token;
          emit({ type: 'token', token });
        }
        if (!content.trim()) throw new AppError('PROVIDER_UNAVAILABLE', 'Your companion needs a moment before replying.', 503, true);

        // The configured provider applies source safety settings before tokens are emitted.
        const provider = dialogueProviderName();
        const { data: assistantMessage, error: assistantError } = await db.from('together_messages').insert({ conversation_id: input.conversationId, user_id: user.id, character_instance_id: primarySpeakerId, speaker_character_instance_id:primarySpeakerId, role: 'assistant', content, delivery_status: 'complete', provider_metadata: { provider, model: provider === 'openai' ? (Deno.env.get('KIVELLE_DIALOGUE_MODEL') ?? Deno.env.get('TOGETHER_DIALOGUE_MODEL') ?? 'configured-default') : (Deno.env.get('TOGETHER_GEMINI_MODEL') ?? Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'configured-default'), streamed: true,speakerName:context.character?.name,speakerSlug:context.character?.slug } }).select('*').single();
        if (assistantError || !assistantMessage) throw new AppError('INTERNAL_ERROR', 'Your companion replied, but the response could not be saved.', 500, true);
        if(context.currentScene?.sceneSessionId)await recordSceneMessage(db,{userId:user.id,continuityId:String(instance.continuity_id),sceneId:String(context.currentScene.sceneSessionId),message:assistantMessage,role:'character',characterInstanceId:primarySpeakerId});
        await safelyApplyConversationEffects(db, user.id, primarySpeakerId, input.conversationId, String(userMessage.id), String(assistantMessage.id), String(context.userMessage??input.message), content, relationship, String(instance.relationship_stage), context, correlationId);
        if(context.currentScene?.sceneSessionId)await copyWitnessedUserMemories(db,{userId:user.id,continuityId:String(instance.continuity_id),sceneId:String(context.currentScene.sceneSessionId),userMessageId:String(userMessage.id),sourceCharacterInstanceId:primarySpeakerId});
        await db.from('together_conversations').update({ last_message_at: assistantMessage.created_at, updated_at: assistantMessage.created_at, kind: conversation.kind === 'first_meeting' ? 'direct' : conversation.kind }).eq('id', input.conversationId);
        await acknowledgeArrival(db,user.id,conversation,String(assistantMessage.created_at));
        const generatedMedia=primarySpeakerId===input.characterInstanceId?await safelyQueueConversationPhoto(db, user.id, input, String(assistantMessage.id), content, correlationId,context):null;
        await track(db, user.id, 'message_sent', { characterInstanceId: input.characterInstanceId });
        await track(db, user.id, 'character_response_received', { characterInstanceId: input.characterInstanceId });
        const additionalMessages=await generateAdditionalSceneReplies(db,{userId:user.id,continuityId:String(instance.continuity_id),conversationId:input.conversationId,userMessageId:String(userMessage.id),userText:String(context.userMessage??input.message),baseContext:context,speakerIds:remainingSpeakerIds,primaryReply:content,sceneId:context.currentScene?.sceneSessionId});
        emit({ type: 'done', message: assistantMessage,additionalMessages,generatedMedia, delta:await collectDialogueDelta(db,user.id,input.characterInstanceId,input.conversationId) });
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', correlationId, message: error instanceof Error ? error.message : 'Unknown stream error' }));
        const appError = error instanceof AppError ? error : new AppError('PROVIDER_UNAVAILABLE', 'Your companion needs a moment before replying.', 503, true);
        emit({ type: 'error', error: { code: appError.code, message: appError.message, retryable: appError.retryable } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'X-Correlation-ID': correlationId } });
}

async function dialogueSpeaker(db:any,userId:string,continuityId:string,speakerId:string,baseContext:any):Promise<{instance:Record<string,any>;context:any}>{
  const[{data:instance},{data:relationship}]=await Promise.all([
    db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',speakerId).eq('user_id',userId).eq('continuity_id',continuityId).maybeSingle(),
    db.from('together_relationship_states').select('*').eq('character_instance_id',speakerId).eq('user_id',userId).maybeSingle(),
  ]);
  if(!instance)throw new AppError('SCENE_NO_LONGER_AVAILABLE','That character is no longer part of this scene.',409);
  const template=instance.together_character_templates??{},version=instance.together_character_versions??{};
  const context={...baseContext,character:{...template,personality_config:version.personality_config,communication_style:version.communication_style,boundaries:version.boundaries,character_bible:version.character_bible,life_config:version.life_config,relationship_config:version.relationship_config},relationship:{...(relationship??{}),relationship_stage:instance.relationship_stage},sceneSpeakerDirective:{characterInstanceId:speakerId,name:String(template.name??'Companion')}};
  return{instance,context};
}

async function generateAdditionalSceneReplies(db:any,input:{userId:string;continuityId:string;conversationId:string;userMessageId:string;userText:string;baseContext:any;speakerIds:string[];primaryReply:string;sceneId?:string}):Promise<Record<string,unknown>[]>{
  if(!input.sceneId||!input.speakerIds.length)return[];
  const replies:Record<string,unknown>[]=[];
  for(const speakerId of input.speakerIds.slice(0,1)){
    try{
      const selected=await dialogueSpeaker(db,input.userId,input.continuityId,speakerId,{...input.baseContext,recent:[...(input.baseContext.recent??[]),{role:'assistant',content:input.primaryReply}],sceneSpeakerDirective:{characterInstanceId:speakerId}});
      const generated=await dialogue.generate(selected.context);
      if(!generated.trim())continue;
      const safety=await moderation.check(generated);if(!safety.allowed)continue;
      const{data:message}=await db.from('together_messages').insert({conversation_id:input.conversationId,user_id:input.userId,character_instance_id:speakerId,speaker_character_instance_id:speakerId,role:'assistant',content:generated,delivery_status:'complete',provider_metadata:{provider:dialogueProviderName(),sharedSceneParticipant:true,speakerName:selected.context.character?.name,speakerSlug:selected.context.character?.slug}}).select('*').single();
      if(!message)continue;
      await recordSceneMessage(db,{userId:input.userId,continuityId:input.continuityId,sceneId:input.sceneId,message,role:'character',characterInstanceId:speakerId});
      await safelyApplyConversationEffects(db,input.userId,speakerId,input.conversationId,input.userMessageId,String(message.id),input.userText,generated,selected.context.relationship,String(selected.instance.relationship_stage),selected.context,crypto.randomUUID());
      await track(db,input.userId,'shared_scene_character_spoke',{sceneId:input.sceneId,characterInstanceId:speakerId});
      replies.push(message);
    }catch(error){console.warn('Shared-scene participant stayed silent',error instanceof Error?error.message:'unknown_error');}
  }
  return replies;
}

async function recordSceneMessage(db:any,input:{userId:string;continuityId:string;sceneId:string;message:Record<string,any>;role:'user'|'character';characterInstanceId?:string}){
  const{data:existing}=await db.from('together_scene_messages').select('id').eq('message_id',input.message.id).maybeSingle();if(existing)return;
  const[{data:last},{data:scene}]=await Promise.all([db.from('together_scene_messages').select('sequence').eq('scene_session_id',input.sceneId).order('sequence',{ascending:false}).limit(1).maybeSingle(),db.from('together_scene_sessions').select('state').eq('id',input.sceneId).eq('user_id',input.userId).maybeSingle()]);
  const sequence=Number(last?.sequence??0)+1;
  const{data:participants}=await db.from('together_scene_participants').select('character_instance_id,witnessed_from_sequence,witnessed_to_sequence').eq('scene_session_id',input.sceneId).lte('witnessed_from_sequence',sequence);
  const witnessed=(participants??[]).filter((item:Record<string,any>)=>item.witnessed_to_sequence==null||Number(item.witnessed_to_sequence)>=sequence).map((item:Record<string,any>)=>String(item.character_instance_id));
  await db.from('together_messages').update({scene_session_id:input.sceneId,scene_sequence:sequence,speaker_character_instance_id:input.role==='character'?input.characterInstanceId??input.message.character_instance_id:null}).eq('id',input.message.id).eq('user_id',input.userId);
  const{error}=await db.from('together_scene_messages').insert({user_id:input.userId,continuity_id:input.continuityId,scene_session_id:input.sceneId,message_id:input.message.id,role:input.role,character_instance_id:input.role==='character'?input.characterInstanceId??input.message.character_instance_id:null,sequence,witnessed_by_instance_ids:witnessed,metadata:{contextVersion:1}});
  if(error)console.warn('Scene message attribution failed',error.message);
  await db.from('together_scene_sessions').update({state:{...(scene?.state??{}),sequence},updated_at:new Date().toISOString()}).eq('id',input.sceneId).eq('user_id',input.userId);
}

async function copyWitnessedUserMemories(db:any,input:{userId:string;continuityId:string;sceneId:string;userMessageId:string;sourceCharacterInstanceId:string}){
  const[{data:sceneMessage},{data:sourceMemories}]=await Promise.all([
    db.from('together_scene_messages').select('witnessed_by_instance_ids').eq('scene_session_id',input.sceneId).eq('message_id',input.userMessageId).eq('role','user').maybeSingle(),
    db.from('together_memories').select('*').eq('user_id',input.userId).eq('character_instance_id',input.sourceCharacterInstanceId).eq('source_message_id',input.userMessageId).eq('status','active'),
  ]);
  const witnesses=(sceneMessage?.witnessed_by_instance_ids??[]).map(String).filter((id:string)=>id!==input.sourceCharacterInstanceId);
  if(!witnesses.length||!sourceMemories?.length)return;
  const rows=witnesses.flatMap((characterInstanceId:string)=>(sourceMemories as Record<string,any>[]).map((memory)=>({
    user_id:input.userId,continuity_id:input.continuityId,character_instance_id:characterInstanceId,memory_type:memory.memory_type,
    canonical_text:memory.canonical_text,dedupe_key:memory.dedupe_key,subject_key:memory.subject_key,importance:memory.importance,
    confidence:memory.confidence,pinned:false,status:'active',sensitivity_category:memory.sensitivity_category,source_message_id:input.userMessageId,
    source_type:'message',source_id:input.userMessageId,learned_via:'direct_user',shareability:'private',valid_from:memory.valid_from??new Date().toISOString(),
    world_id:memory.world_id??null,location_id:memory.location_id??null,participant_instance_ids:[input.sourceCharacterInstanceId,...witnesses],
    context_tags:[...(Array.isArray(memory.context_tags)?memory.context_tags:[]),'shared_scene_witness'],embedding:memory.embedding??null,
    metadata:{...(memory.metadata??{}),witnessedInSceneId:input.sceneId,sourceMemoryId:memory.id},
  })));
  await db.from('together_memories').upsert(rows,{onConflict:'character_instance_id,dedupe_key',ignoreDuplicates:true});
  await track(db,input.userId,'shared_scene_memory_witnessed',{sceneId:input.sceneId,witnessCount:witnesses.length,memoryCount:sourceMemories.length});
}

async function acknowledgeArrival(db:any,userId:string,conversation:Record<string,any>,at:string){
  const result=acknowledgeConversationScene((conversation.metadata??{}) as Record<string,any>,at);
  if(!result.acknowledged)return;
  conversation.metadata=result.metadata;
  await db.from('together_conversations').update({metadata:result.metadata,updated_at:at}).eq('id',conversation.id).eq('user_id',userId);
  await track(db,userId,'scene_arrival_acknowledged',{characterInstanceId:conversation.character_instance_id});
}

async function safelyApplyConversationEffects(db: any, userId: string, instanceId: string, conversationId: string, sourceMessageId: string, assistantMessageId:string, userText: string, assistantText: string, current: Record<string, unknown>, stage: string, context:Parameters<ConfiguredDialogueProvider['generate']>[0], correlationId: string): Promise<void> {
  try {
    await applyConversationEffects(db, userId, instanceId, conversationId, sourceMessageId, assistantMessageId, userText, assistantText, current, stage, context);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', correlationId, operation: 'together_continuity', message: error instanceof Error ? error.message : 'Unknown continuity error' }));
  }
}

async function safelyQueueConversationPhoto(db:any,userId:string,input:z.infer<typeof schema>,assistantMessageId:string,assistantText:string,correlationId:string,context?:Parameters<ConfiguredDialogueProvider['generate']>[0]):Promise<Record<string,unknown>|null>{
  try {
    const media=await queueMediaRequest(db,{userId,characterInstanceId:input.characterInstanceId,source:'user_request',conversationId:input.conversationId,messageId:assistantMessageId,requestText:input.message,companionResponseText:assistantText,idempotencyKey:`dialogue:${assistantMessageId}`,...(context?.currentScene?.sceneSessionId?{sceneSessionId:String(context.currentScene.sceneSessionId)}:{}),...(context?.currentScene?.activePlan?.id?{sharedPlanId:String(context.currentScene.activePlan.id)}:{})});
    if(media)waitUntil(kickMediaDispatcher());
    return media;
  } catch(error) {
    console.error(JSON.stringify({level:'warn',operation:'queue_conversation_photo',correlationId,message:error instanceof Error?error.message:'unknown_error'}));
    return null;
  }
}

async function applyConversationEffects(db: any, userId: string, instanceId: string, conversationId: string, sourceMessageId: string, assistantMessageId:string, userText: string, assistantText: string, current: Record<string, unknown>, stage: string, context:Parameters<ConfiguredDialogueProvider['generate']>[0]): Promise<void> {
  const [{ data: profile }, { data: existingThreads }, { data: conversationRow }, recentTurns,{data:instanceRow}] = await Promise.all([
    db.from('together_profiles').select('memory_categories,content_preferences').eq('user_id', userId).maybeSingle(),
    db.from('together_open_threads').select('*').eq('user_id', userId).eq('character_instance_id', instanceId).is('resolved_at', null).limit(20),
    db.from('together_conversations').select('metadata').eq('user_id',userId).eq('id',conversationId).maybeSingle(),
    db.from('together_messages').select('content').eq('user_id',userId).eq('conversation_id',conversationId).eq('role','user').gte('created_at',new Date(Date.now()-30*60000).toISOString()).order('created_at',{ascending:false}).limit(12),
    db.from('together_character_instances').select('character_version_id,continuity_id,together_character_templates(spice_level),together_character_versions(personality_config,relationship_config)').eq('id',instanceId).eq('user_id',userId).maybeSingle(),
  ]);
  const proposal = await analysis.analyze({ userMessage: userText, assistantMessage: assistantText, existingThreads: existingThreads ?? [], context });
  const analysisNow=new Date();
  const residue=deriveEmotionalResidue(userText,assistantText);
  const continuityId=context.relationship?.continuity_id??current.continuity_id;
  if(residue&&continuityId){
    await upsertEmotionalResidue({db,userId,continuityId:String(continuityId),characterInstanceId:instanceId,sourceId:assistantMessageId,residue,now:analysisNow});
    await track(db,userId,'emotional_residue_created',{characterInstanceId:instanceId,tone:residue.tone});
  }
  if(proposal.mentionedMemoryIds.length||proposal.reinforcedMemoryIds.length){
    await markMentionedMemories({db,userId,memoryIds:proposal.mentionedMemoryIds,reinforcedIds:proposal.reinforcedMemoryIds,now:analysisNow});
    if(proposal.mentionedMemoryIds.length)await track(db,userId,'memory_explicitly_mentioned',{characterInstanceId:instanceId,count:proposal.mentionedMemoryIds.length});
  } else if((context.memoryContext?.retrievedIds??[]).length) await track(db,userId,'memory_callback_suppressed',{characterInstanceId:instanceId,count:context.memoryContext.retrievedIds.length});
  const opinionPlaces=[context.place,...(context.referencedPlaces??[])].filter((item):item is PlaceContext=>Boolean(item));
  if(proposal.placeOpinionCandidates.length&&instanceRow?.character_version_id&&instanceRow?.continuity_id&&opinionPlaces.length){
    await recordChatPlaceOpinions({db,userId,continuityId:String(instanceRow.continuity_id),characterInstanceId:instanceId,characterVersionId:String(instanceRow.character_version_id),conversationId,assistantMessageId,candidates:proposal.placeOpinionCandidates,places:opinionPlaces,now:analysisNow});
  }
  const enabled = (profile?.memory_categories ?? {}) as Record<string, boolean>;
  const precedingAssistantMessage=[...(context.recent??[])].reverse().find((turn:Record<string,unknown>)=>turn.role==='assistant')?.content;const recentUserMessages=(recentTurns.data??[]).map((turn:Record<string,unknown>)=>String(turn.content??'')).reverse();if(recentUserMessages.at(-1)?.trim()===userText.trim())recentUserMessages.pop();
  const engagement=scoreConversationEngagement({message:userText,...(precedingAssistantMessage?{precedingAssistantMessage:String(precedingAssistantMessage)}:{}),recentUserMessages,memoryWorthy:proposal.memoryCandidates.length>0||proposal.newThreads.length>0,repair:Number(proposal.relationshipChanges.conflict??0)<0});const interactionQuality=engagement.quality;
  const romanceEnabled=(profile?.content_preferences as Record<string,unknown>|undefined)?.romanceEnabled!==false;
  const userFlirt=validatedChemistrySignal(proposal.chemistry?.userFlirtSignal,detectFlirtSignal(userText));const characterFlirt=validatedChemistrySignal(proposal.chemistry?.characterFlirtSignal,detectFlirtSignal(assistantText));const romanticSignal=userFlirt.strength>=.35||characterFlirt.strength>=.35;
  const recentLowSignalTurns=(recentTurns.data??[]).filter((turn:Record<string,unknown>)=>scoreConversationEngagement({message:String(turn.content??'')}).quality==='trivial').length;
  const domainCurrent=toDomainRelationship(current,stage,romanceEnabled);
  const relationshipNext=applyInteractionProposal(domainCurrent,proposal.relationshipChanges,interactionQuality,{recentLowSignalTurns,romanceEnabled,romanticSignal});const engagedNext=applyConversationEngagement(relationshipNext,engagement);const template=instanceRow?.together_character_templates as Record<string,unknown>|null;const version=instanceRow?.together_character_versions as Record<string,unknown>|null;const spiceLevel=normalizeSpiceLevel(template?.spice_level);const personality=(version?.personality_config??{}) as Record<string,unknown>;const chemistry=updateChemistry({state:engagedNext,spiceLevel,userSignal:userFlirt,characterSignal:characterFlirt,personality,contextFit:chemistryContextFit(context.currentScene),now:analysisNow});
  const domainNext={...engagedNext,chemistryHeat:chemistry.chemistryHeat,physicalTension:chemistry.physicalTension,userFlirtSignals:chemistry.userFlirtSignals,characterFlirtSignals:chemistry.characterFlirtSignals,mutualFlirtSignals:chemistry.mutualFlirtSignals,attractionAcknowledged:chemistry.attractionAcknowledged,...(chemistry.lastChemistryChangeAt?{lastChemistryChangeAt:chemistry.lastChemistryChangeAt}:{}),...(chemistry.lastFlirtSignalAt?{lastFlirtSignalAt:chemistry.lastFlirtSignalAt}:{})};const next=Object.fromEntries(relationshipMetrics.map((metric)=>[metric,domainNext[metric]]));
  const conversationCount = Number(current.interaction_turn_count ?? current.conversation_count ?? 0) + 1;
  const meaningfulCount=Number(current.meaningful_interaction_count??0)+(engagement.relationshipSignificant?1:0);
  const totalDirection = relationshipMetrics.reduce((sum,metric)=>sum+Number(next[metric]??0)-Number(current[metric]??0),0);
  const recentDirection = totalDirection > 1 ? 'improving' : totalDirection < -1 ? 'strained' : 'steady';
  await db.from('together_relationship_states').update({ ...next, conversation_count: conversationCount, interaction_turn_count:conversationCount, meaningful_interaction_count:meaningfulCount,engagement_score:domainNext.engagementScore,genuine_back_and_forth_turns:domainNext.genuineBackAndForthTurns,trivial_engagement_score:domainNext.trivialEngagementScore,chemistry_heat:chemistry.chemistryHeat,physical_tension:chemistry.physicalTension,user_flirt_signals:chemistry.userFlirtSignals,character_flirt_signals:chemistry.characterFlirtSignals,mutual_flirt_signals:chemistry.mutualFlirtSignals,attraction_acknowledged:chemistry.attractionAcknowledged,last_chemistry_change_at:chemistry.lastChemistryChangeAt??current.last_chemistry_change_at??null,last_flirt_signal_at:chemistry.lastFlirtSignalAt??current.last_flirt_signal_at??null, last_interaction_quality:interactionQuality, last_relationship_delta:Object.fromEntries(relationshipMetrics.map((metric)=>[metric,Number(next[metric]??0)-Number(current[metric]??0)])), recent_direction: recentDirection, updated_at: new Date().toISOString() }).eq('character_instance_id', instanceId);
  await db.from('together_character_instances').update({ updated_at: new Date().toISOString() }).eq('id', instanceId);
  for (const candidate of proposal.memoryCandidates) {
    if (enabled[candidate.memory_type] === false) continue;
    const embedding = await embeddings.embed(candidate.canonical_text);
    const { data: sameSubject } = await db.from('together_memories').select('*').eq('user_id', userId).eq('character_instance_id', instanceId).eq('subject_key', candidate.subject_key).eq('status', 'active').order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(10);
    const { data: exact } = sameSubject?.length ? { data: null } : await db.from('together_memories').select('*').eq('character_instance_id', instanceId).eq('dedupe_key', candidate.dedupe_key).maybeSingle();
    const existing = (sameSubject ?? []).find((item: Record<string, unknown>) => item.dedupe_key === candidate.dedupe_key) ?? sameSubject?.[0] ?? exact;
    if (existing) {
      const sameFact = existing.dedupe_key === candidate.dedupe_key;
      const now = new Date().toISOString();
      if(sameFact){
        await db.from('together_memories').update({ importance: Math.max(Number(existing.importance), candidate.importance), confidence: Math.min(1, Math.max(Number(existing.confidence), candidate.confidence) + .02), embedding: embedding ?? existing.embedding, source_message_id: sourceMessageId, source_type:'message',source_id:sourceMessageId,learned_via:'direct_user',reinforcement_count:Number(existing.reinforcement_count??0)+1,updated_at: now }).eq('id', existing.id);
      }else{
        await db.from('together_memories').update({status:'superseded',valid_to:now,updated_at:now}).eq('id',existing.id).eq('status','active');
        await db.from('together_memories').update({status:'superseded',valid_to:now,updated_at:now}).eq('user_id',userId).eq('character_instance_id',instanceId).eq('subject_key',candidate.subject_key).eq('status','active').neq('id',existing.id);
        const {data:created}=await db.from('together_memories').insert({user_id:userId,character_instance_id:instanceId,...candidate,source_message_id:sourceMessageId,source_type:'message',source_id:sourceMessageId,learned_via:'direct_user',shareability:'private',valid_from:now,supersedes_memory_id:existing.id,embedding,status:'active'}).select('id').maybeSingle();
        if(created)await track(db,userId,'memory_corrected',{memoryId:created.id,characterInstanceId:instanceId});
      }
    } else {
      const { data, error } = await db.from('together_memories').insert({ user_id: userId, character_instance_id: instanceId, ...candidate, source_message_id: sourceMessageId, source_type:'message',source_id:sourceMessageId,learned_via:'direct_user',shareability:'private',valid_from:new Date().toISOString(),embedding, status: 'active' }).select('id').single();
      if (!error && data) await track(db, userId, 'memory_created', { memoryId: data.id, type: candidate.memory_type });
    }
  }
  if (enabled.open_thread !== false) {
    for (const thread of proposal.newThreads) {
      const { data: existing } = await db.from('together_open_threads').select('id').eq('user_id', userId).eq('character_instance_id', instanceId).eq('dedupe_key', thread.dedupe_key).is('resolved_at', null).maybeSingle();
      if (existing) continue;
      const { data } = await db.from('together_open_threads').insert({ user_id: userId, character_instance_id: instanceId, ...thread, source_message_id: sourceMessageId }).select('id').single();
      if (data) await track(db, userId, 'open_thread_created', { threadId: data.id });
    }
  }
  for (const threadId of proposal.resolvedThreadIds) {
    const now = new Date().toISOString();
    const { data: resolved } = await db.from('together_open_threads').update({ resolved_at: now, follow_up_eligible: false, resolution_message_id: sourceMessageId, updated_at: now }).eq('id', threadId).eq('user_id', userId).eq('character_instance_id', instanceId).is('resolved_at', null).select('id').maybeSingle();
    if (resolved) await track(db, userId, 'open_thread_resolved', { threadId });
  }
  await db.from('together_conversation_actions').update({status:'expired',updated_at:new Date().toISOString()}).eq('user_id',userId).eq('conversation_id',conversationId).eq('status','pending').lt('expires_at',new Date().toISOString());
  for(const candidate of proposal.actionCandidates){
    const{data:created}=await db.from('together_conversation_actions').insert({user_id:userId,character_instance_id:instanceId,conversation_id:conversationId,assistant_message_id:assistantMessageId,candidate_type:candidate.type,status:'pending',payload:candidate.payload,confidence:candidate.confidence,expires_at:new Date(Date.now()+24*3600000).toISOString(),updated_at:new Date().toISOString()}).select('*').maybeSingle();
    if(created){
      await writeConversationEvent(db,{userId,characterInstanceId:instanceId,conversationId,eventType:'plan_proposed',entityType:'conversation_action',entityId:created.id,metadata:{...candidate.payload,candidateType:candidate.type,resolution:'pending'}});
      await track(db,userId,'plan_proposal_created',{type:candidate.type,conversationId,source:'chat_natural_language'});
    }
  }
  const actionFocus=proposal.actionCandidates.find((item)=>item.payload.planId||item.payload.locationId);
  const focusEntity=proposal.referencedEntities[0];
  const focus=actionFocus?.payload.planId?{type:'plan',planId:actionFocus.payload.planId,updatedAt:new Date().toISOString(),sourceMessageId}:actionFocus?.payload.locationId?{type:'location',locationId:actionFocus.payload.locationId,label:actionFocus.payload.location,updatedAt:new Date().toISOString(),sourceMessageId}:focusEntity?{type:'entity',label:focusEntity,updatedAt:new Date().toISOString(),sourceMessageId}:context.activeStory?{type:'story',label:String(context.activeStory.title),updatedAt:new Date().toISOString(),sourceMessageId}:null;
  if(focus)await db.from('together_conversations').update({metadata:{...(conversationRow?.metadata??{}),focus}}).eq('user_id',userId).eq('id',conversationId);
  await updateConversationSummary(db, userId, conversationId, conversationCount);
  // The relationship-state trigger invokes the canonical SQL evaluator. Do not
  // create milestones through a second compatibility path here.
}

async function collectDialogueDelta(db:any,userId:string,characterInstanceId:string,conversationId:string){
  const [character,relationship,conversation,memories,openThreads,milestones,actions,events,plans,dates,lifeEvents,stories,relationshipPlaces]=await Promise.all([
    db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',characterInstanceId).eq('user_id',userId).maybeSingle(),
    db.from('together_relationship_states').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).maybeSingle(),
    db.from('together_conversations').select('*').eq('id',conversationId).eq('user_id',userId).maybeSingle(),
    db.from('together_memories').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).eq('status','active').order('pinned',{ascending:false}).order('updated_at',{ascending:false}).limit(100),
    db.from('together_open_threads').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).is('resolved_at',null).limit(30),
    db.from('together_relationship_milestones').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).eq('status','pending'),
    db.from('together_conversation_actions').select('*').eq('conversation_id',conversationId).eq('character_instance_id',characterInstanceId).eq('user_id',userId).eq('status','pending'),
    db.from('together_conversation_events').select('*').eq('conversation_id',conversationId).eq('character_instance_id',characterInstanceId).eq('user_id',userId).order('created_at',{ascending:false}).limit(30),
    db.from('together_shared_plans').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).in('status',['proposed','scheduled','active']).order('starts_at').limit(20),
    db.from('together_date_sessions').select('*,together_date_templates(*)').eq('character_instance_id',characterInstanceId).eq('user_id',userId).in('status',['unlocked','upcoming','active','deferred']),
    db.from('together_life_events').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId).order('starts_at',{ascending:false}).limit(20),
    db.from('together_story_arc_instances').select('*,together_story_arc_templates(*)').eq('character_instance_id',characterInstanceId).eq('user_id',userId).eq('status','active'),
    db.from('together_relationship_places').select('*').eq('character_instance_id',characterInstanceId).eq('user_id',userId),
  ]);
  return{characterInstanceId,character:character.data,relationship:relationship.data,conversation:conversation.data,memories:memories.data??[],openThreads:openThreads.data??[],relationshipMilestones:milestones.data??[],conversationActions:actions.data??[],conversationEvents:events.data??[],sharedPlans:plans.data??[],dates:dates.data??[],lifeEvents:lifeEvents.data??[],storyArcs:stories.data??[],relationshipPlaces:relationshipPlaces.data??[]};
}

function toDomainRelationship(state:Record<string,unknown>,stage:string,romanceEnabled:boolean):RelationshipState{return{stage:stage as RelationshipState['stage'],trust:Number(state.trust??0),comfort:Number(state.comfort??0),attraction:Number(state.attraction??0),affinity:Number(state.affinity??0),familiarity:Number(state.familiarity??0),respect:Number(state.respect??0),conflict:Number(state.conflict??0),romantic_interest:Number(state.romantic_interest??0),commitment:Number(state.commitment??0),conversationCount:Number(state.interaction_turn_count??state.conversation_count??0),conversationSessionCount:Number(state.conversation_session_count??1),meaningfulInteractionCount:Number(state.meaningful_interaction_count??0),engagementScore:Number(state.engagement_score??0),genuineBackAndForthTurns:Number(state.genuine_back_and_forth_turns??0),trivialEngagementScore:Number(state.trivial_engagement_score??0),chemistryHeat:Number(state.chemistry_heat??0),physicalTension:Number(state.physical_tension??0),userFlirtSignals:Number(state.user_flirt_signals??0),characterFlirtSignals:Number(state.character_flirt_signals??0),mutualFlirtSignals:Number(state.mutual_flirt_signals??0),attractionAcknowledged:Boolean(state.attraction_acknowledged),...(state.last_chemistry_change_at?{lastChemistryChangeAt:String(state.last_chemistry_change_at)}:{}),...(state.last_flirt_signal_at?{lastFlirtSignalAt:String(state.last_flirt_signal_at)}:{}),activeMajorConflict:Boolean(state.active_major_conflict),romanceEnabled,romancePathStatus:String(state.romance_path_status??'open') as RelationshipState['romancePathStatus']};}

function normalizeSpiceLevel(value:unknown):SpiceLevel{const level=Number(value);return level===1||level===3?level:2;}
function validatedChemistrySignal(value:unknown,fallback:ChemistrySignal):ChemistrySignal{if(typeof value!=='number'||!Number.isFinite(value))return fallback;const strength=Math.max(0,Math.min(1,value));return strength>fallback.strength?{strength,kind:strength>=.8?'attraction':strength>=.5?'teasing':'interest',reasonCodes:['analysis_signal']}:fallback;}
function chemistryContextFit(scene:Record<string,unknown>|undefined):number{const activity=String(scene?.activity??'').toLowerCase(),interruptibility=String(scene?.interruptibility??scene?.availability??'open');if(interruptibility==='busy'||interruptibility==='unavailable'||/\b(work|meeting|sleep|driving|appointment|casework)\b/.test(activity))return.2;if(/\b(date|drinks|karaoke|dancing|dinner|rooftop|walk|music)\b/.test(activity))return.85;return interruptibility==='limited'?.45:.65;}

async function updateConversationSummary(db: any, userId: string, conversationId: string, conversationCount: number): Promise<void> {
  if (conversationCount !== 1 && conversationCount % 4 !== 0) return;
  const { data: conversation } = await db.from('together_conversations').select('summary,summary_through,summary_message_count').eq('id', conversationId).eq('user_id', userId).maybeSingle();
  let query = db.from('together_messages').select('id,role,content,created_at').eq('user_id', userId).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(80);
  if (conversation?.summary_through) query = query.gt('created_at', conversation.summary_through);
  const { data: messages, error } = await query;
  if (error || !messages?.length) return;
  const previous = String(conversation?.summary ?? '').trim();
  const summary = mergeConversationSummary(previous, messages);
  const through = messages.at(-1)?.created_at ?? new Date().toISOString();
  await db.from('together_conversations').update({ summary, summary_through: through, summary_message_count: Number(conversation?.summary_message_count ?? 0) + messages.length, updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', userId).is('archived_at', null);
}
