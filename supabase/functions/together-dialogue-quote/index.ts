import { attachAuthoredDepthContext } from '../_shared/kivelle-authored-depth-context.ts';
import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { requireAiDataConsent } from '../_shared/kivelle-ai-consent.ts';
import { parseBody } from '../_shared/body.ts';
import { corsHeaders, errorResponse, json } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { normalizeContextPreference, selectedContextCeiling } from '../../../packages/together-domain/src/chat-context.ts';
import { contextInputTokenCeiling } from '../../../packages/together-domain/src/context-budget.ts';
import { resolveSubscriptionAccess } from '../_shared/kivelle-subscription.ts';
import { resolveAdultAccess } from '../_shared/web-adult-access.ts';
import { resolvePrivateDialoguePolicy } from '../_shared/private-adult-text-policy.ts';
import { buildIsolatedSpeakerContext } from '../_shared/kivelle-speaker-context.ts';
import { compileCompanionPrompt } from '../_shared/kivelle-intelligence.ts';
import { applyVeniceTestRoute } from '../_shared/kivelle-venice-test.ts';
import { resolveDialogueRouting } from '../_shared/kivelle-ai-routing.ts';
import { openAIDialogueModel, xaiDialogueModel, openAIFastServiceTier } from '../_shared/together-ai.ts';
import { resolveDialogueRunGenerationProfile, chatGenerationControlsMode } from '../_shared/kivelle-chat-generation.ts';
import { contextDraftFingerprint, contextState } from '../_shared/kivelle-context-authorization.ts';
import { CONTEXT_PRICE_VERSION, CONTEXT_COMPILER_VERSION, contextCredits, assertContextPricingCurrent } from '../_shared/kivelle-context-price.ts';
import type { ContextReplyQuote } from '../_shared/kivelle-context-pricing-state.ts';

const schema=z.object({conversationId:z.string().uuid(),characterInstanceId:z.string().uuid().optional(),focusPlanId:z.string().uuid().optional(),sceneActionId:z.string().uuid().optional(),entryContext:z.object({entryReason:z.literal('user_drop_in'),locationId:z.string().uuid(),scheduleEventId:z.string().uuid().optional()}).optional(),message:z.string().trim().max(4000).default(''),attachmentIds:z.array(z.string().uuid()).max(1).default([]),mentionedCharacterInstanceIds:z.array(z.string().uuid()).max(5).default([]),replyToMessageId:z.string().uuid().optional(),manualSpeakerInstanceId:z.string().uuid().optional(),broadGroupRequest:z.boolean().default(false),letThemTalk:z.boolean().default(false),messageAction:z.literal('continue').optional(),anchorMessageId:z.string().uuid().optional()});
Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  const correlationId=crypto.randomUUID();
  try{
    const {db,user}=await authenticated(request);
    await requireAiDataConsent(db,user.id);
    const input=await parseBody(request,schema);
    assertContextPricingCurrent();
    if(!input.message&&!input.attachmentIds.length)throw new AppError('VALIDATION_FAILED','Write a message to see its price.',422);
    await enforceRateLimit(db,user.id,'context_quote',120,60);
    const [{conversation,fingerprint:stateFingerprint},subscription,adultAccess]=await Promise.all([contextState(db,user.id,input.conversationId),resolveSubscriptionAccess(db,user.id,undefined,true),resolveAdultAccess(request,user,db)]);
    const preference=normalizeContextPreference(conversation.metadata?.chatPreferences?.contextPreference);
    if(preference!=='included'&&subscription.tier==='free')throw new AppError('PLAN_LIMIT_REACHED','Expanded context is available with Kivelle+ or Max.',403);
    const group=conversation.kind==='group';
    const {data:participants,error:rosterError}=group?await db.from('together_conversation_participants').select('*,together_character_instances(*,together_character_templates(*))').eq('conversation_id',conversation.id).is('left_at',null):{data:[],error:null};
    if(rosterError)throw new AppError('INTERNAL_ERROR','The group could not be priced.',500,true);
    let speakerIds=group?(participants??[]).map((row:any)=>String(row.character_instance_id)):[String(conversation.character_instance_id)];
    if(input.manualSpeakerInstanceId){if(!speakerIds.includes(input.manualSpeakerInstanceId))throw new AppError('CONFLICT','That companion is no longer in this group.',409);speakerIds=[input.manualSpeakerInstanceId];}
    if(!group&&input.characterInstanceId!==conversation.character_instance_id)throw new AppError('CONFLICT','This conversation has changed.',409);
    const {data:directInstance}=group?{data:null}:await db.from('together_character_instances').select('*,together_character_templates(*)').eq('id',conversation.character_instance_id).eq('user_id',user.id).single();
    const policy=resolvePrivateDialoguePolicy({access:adultAccess,requestedMode:'explicit',conversationMode:group?'group':'direct',participants:group?participants??[]:directInstance?[directInstance]:[],safetyAllowed:true});
    const ceiling=selectedContextCeiling(preference,subscription.capabilities.intelligenceProfile);
    const replies:ContextReplyQuote[]=[];
    let approximateInputTokens=0;
    const {data:attachments,error:attachmentError}=input.attachmentIds.length?await db.from('together_conversation_attachments').select('*').in('id',input.attachmentIds).eq('user_id',user.id).eq('conversation_id',conversation.id):{data:[],error:null};
    if(attachmentError||(attachments?.length??0)!==input.attachmentIds.length)throw new AppError('CONFLICT','Your photo is not ready to price yet.',409);
    let sceneSessionId:string|undefined;
    for(let index=0;index<speakerIds.length&&index<6;index++){
      const speakerId=speakerIds[index]!;
      const {context,instance}=await buildIsolatedSpeakerContext({db,userId:user.id,continuityId:String(conversation.continuity_id),conversation,speakerCharacterInstanceId:speakerId,userMessage:input.message,attachments:attachments??[],...(index&&sceneSessionId?{sceneSessionId}:{}),readOnly:true,contextInputCeiling:ceiling,authorizedPrivateAdultText:policy.rollout.generationAllowed,authorizedWebAdult:adultAccess.authorized_web_adult});
      if(!group&&index===0){sceneSessionId=context.currentScene?.sceneSessionId;for(const participant of context.sceneParticipants??[])if(!speakerIds.includes(participant.characterInstanceId))speakerIds.push(participant.characterInstanceId);}
      const route=await applyVeniceTestRoute(db,user.id,conversation,resolveDialogueRouting({message:input.message,recentTurns:context.recent.slice(-4),requestedMode:'explicit',ageVerified:adultAccess.authorized_web_adult,adultAuthorized:policy.rollout.generationAllowed,characterAge:Number(context.character.age)||null,relationshipAllowsExplicit:context.relationship.romance_enabled!==false}));
      if(route.hardBlocked)throw new AppError('VALIDATION_FAILED','This message cannot use expanded context.',422);
      context.contentMode=route.resolvedMode;
      Object.assign(context,{dialogueRouting:{...route}});
      await attachAuthoredDepthContext({db,userId:user.id,continuityId:String(conversation.continuity_id),conversationId:conversation.id,characterInstanceId:speakerId,characterVersionId:instance.character_version_id,context,readOnly:true});
      const included=compileCompanionPrompt({...context,contextInputCeiling:undefined,recent:context.recent.slice(-subscription.capabilities.recentTurnBudget)});
      const expanded=compileCompanionPrompt(context);
      if(expanded.estimatedTokens>ceiling)throw new AppError('CONFLICT','This conversation cannot fit the selected context. Choose a larger size.',409);
      const paidExpansion=preference!=='included'&&expanded.prompt!==included.prompt&&expanded.estimatedTokens>included.estimatedTokens;
      const provider=route.provider;
      const model=provider==='venice'?route.experiment!.model:provider==='xai'?xaiDialogueModel(context):openAIDialogueModel(context);
      const quoteContext=context.generationPreferences.reasoningPreference==='auto'?{...context,generationPreferences:{...context.generationPreferences,reasoningPreference:subscription.capabilities.reasoningEffortMax}}:context;
      const profile=resolveDialogueRunGenerationProfile({context:quoteContext,provider:provider==='venice'?'venice':provider==='xai'?'xai':'openai',model,generationContext:{mode:group?'group':'direct',speakerRole:'primary',activeSpeakerCount:speakerIds.length}});
      // Scene/director preparation can add material after acceptance. Bound that
      // work, and reject before any provider call if it no longer fits the quote.
      const inputTokens=paidExpansion?Math.min(ceiling,Math.ceil(expanded.estimatedTokens*1.25)+2000):contextInputTokenCeiling(subscription.capabilities.intelligenceProfile);
      const maxOutputTokens=Math.max(profile.providerMaxOutputTokens,(context.conversationStyle==='paragraph'?520:380)+profile.reasoningTokenReserve);
      const maximumCredits=paidExpansion?contextCredits({provider,model,inputTokens,outputTokens:maxOutputTokens,...(provider==='openai'&&profile.latencyProfile==='fast'&&chatGenerationControlsMode()==='on'?{serviceTier:openAIFastServiceTier()}: {})}):0;
      replies.push({speakerId,provider,model,inputTokens,maxOutputTokens,maximumCredits,paidExpansion});
      approximateInputTokens=Math.max(approximateInputTokens,paidExpansion?expanded.estimatedTokens:included.estimatedTokens);
    }
    const maximumReplies=group?(input.manualSpeakerInstanceId?1:input.letThemTalk?Math.min(6,Math.max(3,replies.length+1)):Math.min(3,replies.length)):Math.min(3,replies.length);
    const maximumCredits=group?maximumReplies*Math.max(0,...replies.map(row=>row.maximumCredits)):[...replies].sort((a,b)=>b.maximumCredits-a.maximumCredits).slice(0,maximumReplies).reduce((sum,row)=>sum+row.maximumCredits,0);
    const expiresAt=new Date(Date.now()+60000).toISOString();
    const {data:quote,error}=await db.from('together_context_quotes').insert({user_id:user.id,conversation_id:conversation.id,fingerprint:await contextDraftFingerprint(input),state_fingerprint:stateFingerprint,pricing_version:CONTEXT_PRICE_VERSION,manifest:{conversationId:conversation.id,preference,ceiling,maximumReplies,replies,compilerVersion:CONTEXT_COMPILER_VERSION},maximum_credits:maximumCredits,expires_at:expiresAt}).select('id').single();
    if(error||!quote)throw new AppError('INTERNAL_ERROR','The message price could not be saved.',500,true);
    return json({data:{quoteId:quote.id,expiresAt,contextPreference:preference,approximateInputTokens,maximumCredits,maximumReplies,paidExpansion:maximumCredits>0}});
  }catch(error){return errorResponse(error,correlationId);}
});
