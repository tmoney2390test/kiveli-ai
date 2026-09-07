import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeContextPreference } from '../../../packages/together-domain/src/chat-context.ts';
import { contextReservation, setContextReservation, type ContextReservation } from './kivelle-context-pricing-state.ts';
import { CONTEXT_PRICE_VERSION } from './kivelle-context-price.ts';
import { AppError } from './types.ts';

type Row=Record<string,any>;
export async function contextDigest(value:unknown):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),(b)=>b.toString(16).padStart(2,'0')).join('');
}
export function contextDraftFingerprint(input:Row):Promise<string>{
  return contextDigest({conversationId:input.conversationId,characterInstanceId:input.characterInstanceId??null,message:String(input.message??'').trim(),focusPlanId:input.focusPlanId??null,sceneActionId:input.sceneActionId??null,entryContext:input.entryContext??null,attachmentIds:input.attachmentIds??[],mentionedCharacterInstanceIds:input.mentionedCharacterInstanceIds??[],replyToMessageId:input.replyToMessageId??null,manualSpeakerInstanceId:input.manualSpeakerInstanceId??null,broadGroupRequest:input.broadGroupRequest===true,letThemTalk:input.letThemTalk===true,messageAction:input.messageAction??null,anchorMessageId:input.anchorMessageId??null});
}
export async function contextState(db:SupabaseClient,userId:string,conversationId:string):Promise<{conversation:Row;fingerprint:string}>{
  const [conversationResult,last,participants,entitlement,profile]=await Promise.all([
    db.from('together_conversations').select('*').eq('id',conversationId).eq('user_id',userId).single(),
    db.from('together_messages').select('id,conversation_sequence').eq('conversation_id',conversationId).order('conversation_sequence',{ascending:false}).limit(1),
    db.from('together_conversation_participants').select('*').eq('conversation_id',conversationId).order('character_instance_id'),
    db.from('together_entitlements').select('*').eq('user_id',userId).maybeSingle(),
    db.from('together_profiles').select('active_continuity_id,age_verified_at,content_preferences').eq('user_id',userId).maybeSingle(),
  ]);
  if(conversationResult.error||!conversationResult.data)throw new AppError('NOT_FOUND','This conversation could not be found.',404);
  if(last.error||participants.error||entitlement.error||profile.error)throw new AppError('INTERNAL_ERROR','The message price could not be prepared.',500,true);
  const conversation=conversationResult.data;
  if(profile.data?.active_continuity_id!==conversation.continuity_id||conversation.archived_at||conversation.user_archived_at)throw new AppError('CONFLICT','This conversation is no longer active.',409);
  return{conversation,fingerprint:await contextDigest({conversation,last:last.data,participants:participants.data,entitlement:entitlement.data,profile:profile.data})};
}
const pending=new WeakMap<SupabaseClient,{userId:string;input:Row}>();
export function stageContextAuthorization(db:SupabaseClient,userId:string,input:Row):void{pending.set(db,{userId,input});}
export async function reserveStagedContext(db:SupabaseClient,turnId:string,requestId:string):Promise<void>{
  const staged=pending.get(db);if(!staged)return;
  const {userId,input}=staged;
  if(input.contextPreference==='included')return;
  const {data:conversation,error:conversationError}=await db.from('together_conversations').select('metadata').eq('id',input.conversationId).eq('user_id',userId).single();
  if(conversationError)throw new AppError('NOT_FOUND','This conversation could not be found.',404);
  if(normalizeContextPreference(conversation?.metadata?.chatPreferences?.contextPreference)==='included')return;
  const state=await contextState(db,userId,String(input.conversationId));
  const preference=normalizeContextPreference(state.conversation.metadata?.chatPreferences?.contextPreference);
  if(preference==='included'||input.contextPreference==='included')return;
  if(!input.contextQuoteId)throw new AppError('CONFLICT','Your message needs a current context price. Wait for the price, then send again.',409,true);
  const {data:quote,error:quoteError}=await db.from('together_context_quotes').select('*').eq('id',input.contextQuoteId).eq('user_id',userId).single();
  if(quoteError||!quote||quote.pricing_version!==CONTEXT_PRICE_VERSION)throw new AppError('CONFLICT','The context price has expired. Please send again with the refreshed price.',409,true);
  const {error}=await db.rpc('kivelle_reserve_context',{p_user_id:userId,p_quote_id:quote.id,p_request_id:requestId,p_turn_id:turnId,p_fingerprint:await contextDraftFingerprint(input),p_state_fingerprint:state.fingerprint});
  if(error){if(String(error.message).includes('INSUFFICIENT'))throw new AppError('INSUFFICIENT_CREDITS',`This message needs up to ${quote.maximum_credits} credits. Add credits or choose Included context.`,402);throw new AppError('CONFLICT','The conversation or price changed. Review the refreshed price and send again.',409,true);}
  const manifest=quote.manifest as Omit<ContextReservation,'usedReplies'>;
  setContextReservation(db,{...manifest,quoteId:quote.id,userId,requestId,usedReplies:new Set()});
}
export async function closeContextReservation(db:SupabaseClient):Promise<void>{
  const reservation=contextReservation(db);if(!reservation)return;
  const {error}=await db.rpc('kivelle_close_context',{p_quote_id:reservation.quoteId});
  if(error)console.error('Context hold queued for recovery',{quoteId:reservation.quoteId,code:error.code});
}
