import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canRewriteMessage, messageRewriteVersion } from '../../../packages/together-domain/src/message-rewrite.ts';
import { dialogueProviderCapabilities, type DialogueRoutingDecision } from '../../../packages/together-domain/src/ai-routing.ts';
import { containsSecretLikeValue } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';
import { contextState, stageContextAuthorization } from './kivelle-context-authorization.ts';
import { buildIsolatedSpeakerContext } from './kivelle-speaker-context.ts';
import { configuredDialogueProviders, resolveDialogueRouting } from './kivelle-ai-routing.ts';
import { applyChatTestRoute } from './kivelle-chat-model-test.ts';
import { resolvePrivateDialoguePolicy, privateDialoguePolicyMetadata } from './private-adult-text-policy.ts';
import type { AdultAccessContext } from './web-adult-access.ts';
import { requestedConversationDialogueContentMode } from './conversation-content-mode.ts';
import { requireAiDataConsent } from './kivelle-ai-consent.ts';
import { enforceGenerationGuardrails } from './context.ts';
import { resolveSubscriptionAccess } from './kivelle-subscription.ts';
import { attachAuthoredDepthContext } from './kivelle-authored-depth-context.ts';
import { ConfiguredDialogueProvider, ConfiguredModerationProvider } from './together-ai.ts';
import { beginConversationTurn, activateConversationTurn, touchConversationTurn, finishConversationTurn } from './together-dialogue-turns.ts';
import { projectConversationRows } from './content-projection.ts';

type Row = Record<string, any>;
export const messageRewriteSchema = z.object({
  messageAction: z.enum(['spice', 'restore']),
  conversationId: z.string().uuid(),
  characterInstanceId: z.string().uuid().optional(),
  anchorMessageId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  clientRequestId: z.string().uuid(),
  contextQuoteId: z.string().uuid().optional(),
  contextPreference: z.literal('included').optional(),
});
export type MessageRewriteInput = z.infer<typeof messageRewriteSchema>;
const conflict = () => new AppError('CONFLICT', 'This reply changed or is no longer the latest. Refresh the conversation and try again.', 409);

export async function loadMessageRewrite(db: SupabaseClient, userId: string, access: AdultAccessContext, input: Pick<MessageRewriteInput,'conversationId'|'anchorMessageId'|'expectedRevision'>) {
  const { conversation } = await contextState(db,userId,input.conversationId);
  if(conversation.kind==='group'&&!(await resolveSubscriptionAccess(db,userId,undefined,true)).entitlementKeys.includes('group_chat'))throw new AppError('PLAN_LIMIT_REACHED','Group chats are available with Kivelle+ and Kivelle Max.',403);
  const [targetResult, tail, roster, profile] = await Promise.all([
    db.from('together_messages').select('*').eq('id',input.anchorMessageId).eq('user_id',userId).eq('conversation_id',conversation.id).single(),
    db.from('together_messages').select('*').eq('conversation_id',conversation.id).eq('user_id',userId).order('conversation_sequence',{ascending:false}).limit(32),
    conversation.kind==='group'
      ? db.from('together_conversation_participants').select('*,together_character_instances(*,together_character_templates(*),together_character_versions(*))').eq('conversation_id',conversation.id).is('left_at',null)
      : db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',conversation.character_instance_id).eq('user_id',userId),
    db.from('together_profiles').select('content_preferences,age_verified_at').eq('user_id',userId).single(),
  ]);
  if(targetResult.error||tail.error||roster.error||profile.error)throw conflict();
  const target=targetResult.data as Row;
  if(!target||!canRewriteMessage(target as any,[...(tail.data??[])].reverse())||messageRewriteVersion(target as any)!==input.expectedRevision)throw conflict();
  const speakerId=String(target.speaker_character_instance_id??target.character_instance_id);
  const participants=roster.data??[];
  const speaker=participants.map((row:Row)=>row.together_character_instances??row).find((row:Row)=>row.id===speakerId&&row.user_id===userId);
  if(!speaker||speaker.life_state==='dead')throw conflict();
  const mode:'group'|'direct'=conversation.kind==='group'?'group':'direct';
  const policy=resolvePrivateDialoguePolicy({access,requestedMode:requestedConversationDialogueContentMode(profile.data,conversation),conversationMode:mode,participants,safetyAllowed:true});
  // A manual route selection does not enroll an account or relax its boundaries.
  if(policy.effectiveMode!=='explicit'||!policy.rollout.generationAllowed)throw new AppError('FORBIDDEN','Spice is unavailable with this conversation’s current content settings.',403);
  let sourceQuery=db.from('together_messages').select('*').eq('user_id',userId).eq('conversation_id',conversation.id).eq('role','user').lt('conversation_sequence',target.conversation_sequence);
  if(target.response_to_message_id)sourceQuery=sourceQuery.eq('id',target.response_to_message_id);
  const sourceResult=await sourceQuery.order('conversation_sequence',{ascending:false}).limit(1).maybeSingle();
  const source=sourceResult.data as Row|null;
  if(sourceResult.error||!source||!source.content?.trim()||source.content==='[Photo]')throw new AppError('CONFLICT','This reply does not have a text turn that can be rewritten.',409);
  return {conversation,target,source,speakerId,policy,mode};
}
export type PreparedMessageRewrite = Awaited<ReturnType<typeof loadMessageRewrite>>;

/** The database policy trigger reads these metadata fields, not the row columns. */
export function messageRewritePolicyMetadata(prepared:PreparedMessageRewrite,access:AdultAccessContext,provider:string) {
  return {
    ...privateDialoguePolicyMetadata({policy:prepared.policy,access,conversationMode:prepared.mode,providerRoute:provider}),
    contentRating:'explicit',visibilityScope:'all',moderationVersion:'private-adult-text-v1',
  };
}

export function assertMessageRewriteChanged(previous:string,revised:string):void {
  const normalized=(text:string)=>text.normalize('NFC').replace(/\s+/gu,' ').trim();
  if(normalized(previous)===normalized(revised))throw new AppError('CONFLICT','Spice returned the same reply. Your original is unchanged, and no Kivelli credits were charged.',409,false);
}

export async function buildMessageRewriteContext(db:SupabaseClient,userId:string,access:AdultAccessContext,prepared:PreparedMessageRewrite,ceiling?:number) {
  const {conversation,target,source,speakerId}=prepared;
  const built=await buildIsolatedSpeakerContext({db,userId,continuityId:String(conversation.continuity_id),conversation,speakerCharacterInstanceId:speakerId,
    userMessage:source.content,readOnly:true,beforeConversationSequence:Number(target.conversation_sequence),contextInputCeiling:ceiling,
    authorizedPrivateAdultText:true,authorizedWebAdult:access.authorized_web_adult});
  await attachAuthoredDepthContext({db,userId,continuityId:String(conversation.continuity_id),conversationId:conversation.id,characterInstanceId:speakerId,characterVersionId:built.instance.character_version_id,context:built.context,readOnly:true});
  Object.assign(built.context,{rewriteOriginalReply:String(target.content)});
  return built;
}

export async function messageRewriteRoute(db:SupabaseClient,userId:string,prepared:PreparedMessageRewrite,context:Row):Promise<DialogueRoutingDecision> {
  const route=resolveDialogueRouting({message:prepared.source.content,recentTurns:context.recent.slice(-4),requestedMode:'explicit',ageVerified:true,adultAuthorized:true,
    characterAge:Number(context.character.age)||null,relationshipAllowsExplicit:context.relationship.romance_enabled!==false&&context.relationship.romance_path_status!=='friends_only'});
  if(route.hardBlocked||context.relationship.romance_enabled===false||context.relationship.romance_path_status==='friends_only')throw new AppError('FORBIDDEN','This reply cannot use Spice with the current conversation boundaries.',403);
  const providers=configuredDialogueProviders();
  const manual={...route,provider:'xai' as const,reason:'manual_spice' as const,explicit:true,resolvedMode:'explicit' as const,carryoverTurnsRemaining:0};
  const selected=await applyChatTestRoute(db,userId,prepared.conversation,manual);
  if(!dialogueProviderCapabilities[selected.provider].explicitSexualText||!selected.explicit||selected.provider==='xai'&&(!providers.xai||!providers.xaiEnabled||!providers.xaiExplicitEnabled))throw new AppError('PROVIDER_UNAVAILABLE','Spice is temporarily unavailable. Your original reply has not changed.',503,true);
  return {...selected,reason:'manual_spice',carryoverTurnsRemaining:0};
}

export async function runMessageRewrite(db:SupabaseClient,userId:string,access:AdultAccessContext,input:MessageRewriteInput,correlationId:string,refreshAccess?:()=>Promise<AdultAccessContext>) {
  // A completed retry is a read, never another provider call or charge.
  const {data:replay,error:replayError}=await db.from('together_message_rewrites').select('message_id,status,action,expected_version').eq('id',input.clientRequestId).eq('user_id',userId).maybeSingle();
  if(replayError)throw new AppError('INTERNAL_ERROR','The reply could not be prepared.',503,true);
  if(replay&&(replay.message_id!==input.anchorMessageId||replay.action!==input.messageAction||replay.expected_version!==input.expectedRevision))throw conflict();
  if(replay?.status==='completed'){
    const {data:message}=await db.from('together_messages').select('*').eq('id',replay.message_id).eq('conversation_id',input.conversationId).eq('user_id',userId).single();
    if(!message)throw conflict();
    // Re-evaluate current eligibility even on an idempotent response.
    const prepared=await loadMessageRewrite(db,userId,access,{...input,expectedRevision:messageRewriteVersion(message)});
    return projectConversationRows([message],{authorizedWebAdult:access.authorized_web_adult,authorizedPrivateAdultText:prepared.policy.rollout.generationAllowed})[0];
  }
  if(replay)throw new AppError('CONFLICT',replay.status==='pending'?'This reply is already being prepared.':'This attempt did not finish. Try Spice again.',409,true);
  const prepared=await loadMessageRewrite(db,userId,access,input);
  if(input.characterInstanceId&&input.characterInstanceId!==prepared.conversation.character_instance_id)throw conflict();
  if(input.messageAction==='spice'){
    await requireAiDataConsent(db,userId);
    await enforceGenerationGuardrails(db,userId,'dialogue');
  }
  const subscription=await resolveSubscriptionAccess(db,userId,undefined,true);
  stageContextAuthorization(db,userId,input.messageAction==='restore'?{...input,contextPreference:'included'}:input);
  const lease=await beginConversationTurn(db,{userId,continuityId:String(prepared.conversation.continuity_id),conversationId:input.conversationId,requestId:input.clientRequestId,kind:prepared.mode,supersedeGenerating:false});
  if(!lease.acquired)throw new AppError('CONFLICT','Wait for the current reply to finish, then try again.',409,true);
  let completed=false;
  const timer=setInterval(()=>{void touchConversationTurn(db,lease);},30_000);
  try {
    const claim=await db.rpc('kivelle_claim_message_rewrite',{p_user_id:userId,p_message_id:input.anchorMessageId,p_request_id:input.clientRequestId,p_turn_id:lease.id,p_lease_token:lease.token,p_expected_version:input.expectedRevision,p_action:input.messageAction,p_daily_limit:subscription.capabilities.dailyMessageLimit});
    if(claim.error||claim.data!=='claimed'){
      if(claim.error?.message.includes('REWRITE_DAILY_LIMIT'))throw new AppError('PLAN_LIMIT_REACHED','Your daily message allowance is used. Upgrade or try again after midnight UTC.',429);
      throw conflict();
    }
    await activateConversationTurn(db,lease,{sourceMessageId:prepared.source.id,metadata:{messageRewrite:true,anchorMessageId:input.anchorMessageId}});
    let content:string|null=null,metadata:Row|null=null;
    if(input.messageAction==='spice'){
      const {context}=await buildMessageRewriteContext(db,userId,access,prepared);
      const route=await messageRewriteRoute(db,userId,prepared,context);
      context.contentMode=route.resolvedMode;
      Object.assign(context,{dialogueRouting:route});
      const scope={db,userId,conversationId:input.conversationId,continuityId:prepared.conversation.continuity_id,characterInstanceId:prepared.speakerId,correlationId,routeReason:'manual_spice',contentMode:route.resolvedMode};
      const moderation=new ConfiguredModerationProvider();
      const inputSafety=await moderation.check(prepared.source.content,{...scope,metadata:{direction:'input'}});
      if(!inputSafety.allowed)throw new AppError('FORBIDDEN','This request cannot be rewritten. Your original reply is unchanged.',403);
      const result=await new ConfiguredDialogueProvider().generate(context,{route,strictRoute:true,usageScope:scope,operation:'dialogue_message_spice',providerAttemptBudget:{max:2,used:0},signal:AbortSignal.timeout(100_000),generationContext:{mode:prepared.mode,speakerRole:'primary',activeSpeakerCount:1}});
      if(result.metadata.provider!==route.provider||result.metadata.fallback)throw new AppError('PROVIDER_UNAVAILABLE','The selected reply route did not complete. Your original reply is unchanged.',503,true);
      const safety=await moderation.check(result.text,{...scope,metadata:{direction:'output'}});
      if(!safety.allowed||containsSecretLikeValue(result.text))throw new AppError('FORBIDDEN','This rewrite could not be delivered. Your original reply is unchanged.',403);
      assertMessageRewriteChanged(String(prepared.target.content),result.text);
      content=result.text;
      metadata={...result.metadata,...messageRewritePolicyMetadata(prepared,access,route.provider),rewriteAction:'spice',routeReason:'manual_spice',classification:route.classification};
    }
    // Consent and surface/content eligibility are checked again after generation.
    if(input.messageAction==='spice')await requireAiDataConsent(db,userId);
    if(refreshAccess)access=await refreshAccess();
    await loadMessageRewrite(db,userId,access,input);
    const commit=await db.rpc('kivelle_commit_message_rewrite',{p_user_id:userId,p_request_id:input.clientRequestId,p_lease_token:lease.token,p_content:content,p_metadata:metadata});
    if(commit.error||!commit.data)throw conflict();
    completed=true;
    const {data:message,error}=await db.from('together_messages').select('*').eq('id',commit.data).eq('user_id',userId).single();
    if(error||!message)throw new AppError('INTERNAL_ERROR','The reply was saved. Refresh the conversation to load it.',503,true);
    return projectConversationRows([message],{authorizedWebAdult:access.authorized_web_adult,authorizedPrivateAdultText:true})[0];
  } finally {
    clearInterval(timer);
    if(!completed)await db.from('together_message_rewrites').update({status:'failed'}).eq('id',input.clientRequestId).eq('user_id',userId).eq('status','pending');
    await finishConversationTurn(db,lease,completed?'completed':'failed',{messageRewrite:true});
  }
}
