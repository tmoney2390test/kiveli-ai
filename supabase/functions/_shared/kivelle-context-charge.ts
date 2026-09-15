import { compileCompanionPrompt } from './kivelle-intelligence.ts';
import { contextReservation, type ContextReplyQuote } from './kivelle-context-pricing-state.ts';
import { contextCredits } from './kivelle-context-price.ts';
import { AppError } from './types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ContextCharge={quoteId:string;replyKey:string;credits:number;contextPreference:string;approximateInputTokens:number};
export type ContextPayment={quoteId:string;replyKey:string;preference:string;slot:ContextReplyQuote;estimatedTokens:number;paid:boolean};
export class ContextPricingError extends AppError{constructor(){super('CONFLICT','This reply needs a new context price. Review the refreshed price and send again.',409,true);}}
export async function pricedCompanionPrompt(input:{context:any;db?:SupabaseClient;speakerId?:string;provider:string;model:string;maxOutputTokens:number;payment?:ContextPayment;serviceTier?:string}):Promise<{prompt:string;payment?:ContextPayment}>{
  const reservation=contextReservation(input.db);
  if(!reservation)return{prompt:compileCompanionPrompt({...input.context,contextInputCeiling:undefined}).prompt};
  if(reservation.automatic){
    if(!input.db||!input.speakerId||reservation.usedReplies.size>=reservation.maximumReplies&&!input.payment)throw new ContextPricingError();
    const included=compileCompanionPrompt({...input.context,contextInputCeiling:undefined,recent:(input.context.recent??[]).slice(-(input.context.subscription?.capabilities?.recentTurnBudget??10))});
    const expanded=compileCompanionPrompt({...input.context,contextInputCeiling:reservation.ceiling});
    const paid=expanded.prompt!==included.prompt&&expanded.estimatedTokens>included.estimatedTokens;
    const result=paid?expanded:included;
    if(result.estimatedTokens>result.ceilingTokens)throw new ContextPricingError();
    const slot:ContextReplyQuote={speakerId:input.speakerId,provider:input.provider,model:input.model,inputTokens:Math.min(reservation.ceiling,Math.ceil(result.estimatedTokens*1.25)+2000),maxOutputTokens:input.maxOutputTokens,maximumCredits:0,paidExpansion:paid};
    slot.maximumCredits=paid?contextCredits({provider:slot.provider,model:slot.model,inputTokens:slot.inputTokens,outputTokens:slot.maxOutputTokens,serviceTier:input.serviceTier}):0;
    const {error}=await input.db.rpc('kivelle_prepare_context_reply',{p_quote_id:reservation.quoteId,p_slot:slot});
    if(error){if(String(error.message).includes('INSUFFICIENT'))throw new AppError('INSUFFICIENT_CREDITS','Not enough credits for this memory setting. Add credits or choose Included.',402);throw new ContextPricingError();}
    const replyKey=input.payment?.replyKey??crypto.randomUUID();
    reservation.usedReplies.add(replyKey);
    return{prompt:result.prompt,payment:{quoteId:reservation.quoteId,replyKey,preference:reservation.preference,slot,estimatedTokens:result.estimatedTokens,paid}};
  }
  const slot=reservation.replies.find((row)=>row.speakerId===input.speakerId);
  if(!slot||reservation.usedReplies.size>=reservation.maximumReplies&&!input.payment)throw new ContextPricingError();
  const includedContext={...input.context,contextInputCeiling:undefined,recent:(input.context.recent??[]).slice(-(input.context.subscription?.capabilities?.recentTurnBudget??10))};
  const included=compileCompanionPrompt(includedContext);
  const expanded=slot.paidExpansion?compileCompanionPrompt(input.context):included;
  const paid=slot.paidExpansion&&expanded.prompt!==included.prompt&&expanded.estimatedTokens>included.estimatedTokens;
  const result=paid?expanded:included;
  if(result.estimatedTokens>result.ceilingTokens||paid&&(input.provider!==slot.provider||input.model!==slot.model||result.estimatedTokens>slot.inputTokens||input.maxOutputTokens>slot.maxOutputTokens))throw new ContextPricingError();
  const replyKey=input.payment?.replyKey??crypto.randomUUID();
  reservation.usedReplies.add(replyKey);
  return{prompt:result.prompt,payment:{quoteId:reservation.quoteId,replyKey,preference:reservation.preference,slot,estimatedTokens:result.estimatedTokens,paid}};
}
export function contextChargeForUsage(payment:ContextPayment|undefined,usage:{inputTokens:number;outputTokens:number;cachedInputTokens:number}|null,fallback:boolean,serviceTier?:string):ContextCharge|undefined{
  if(!payment)return undefined;
  const credits=!payment.paid||fallback?0:usage&&usage.inputTokens>0?Math.min(payment.slot.maximumCredits,contextCredits({provider:payment.slot.provider,model:payment.slot.model,serviceTier,...usage})):payment.slot.maximumCredits;
  return{quoteId:payment.quoteId,replyKey:payment.replyKey,credits,contextPreference:payment.preference,approximateInputTokens:payment.estimatedTokens};
}
