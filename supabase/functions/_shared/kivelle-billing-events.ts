import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingProvider } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';

type BillingEventProvider=Extract<BillingProvider,'stripe'|'revenuecat'|'apple'|'google_play'|'configured'>;
type BillingEventStatus='processed'|'ignored'|'failed';

/**
 * Claims an at-least-once provider event. Payloads stay out of this ledger;
 * only content-free lifecycle summaries are retained for support and replay.
 */
export async function beginBillingEvent(db:SupabaseClient,provider:BillingEventProvider,eventId:string,eventType:string):Promise<{idempotent:boolean}>{
  const{data:existing,error:lookupError}=await db.from('together_billing_events').select('status,attempts,last_attempt_at').eq('provider',provider).eq('event_id',eventId).maybeSingle();
  if(lookupError)throw new AppError('INTERNAL_ERROR','Billing event state could not be loaded.',500,true);
  if(existing&&['processed','ignored'].includes(existing.status))return{idempotent:true};
  if(existing){
    const stale=existing.status==='processing'&&new Date(existing.last_attempt_at??0).getTime()<Date.now()-5*60_000;
    if(existing.status==='processing'&&!stale)throw new AppError('CONFLICT','That billing event is already being processed.',409,true);
    const{data:claimed,error}=await db.from('together_billing_events').update({status:'processing',attempts:Number(existing.attempts??1)+1,last_attempt_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId).in('status',stale?['processing','failed']:['failed']).select('id').maybeSingle();
    if(error)throw new AppError('INTERNAL_ERROR','Billing event retry could not be claimed.',500,true);
    if(!claimed)throw new AppError('CONFLICT','That billing event is already being processed.',409,true);
    return{idempotent:false};
  }
  const{error}=await db.from('together_billing_events').insert({provider,event_id:eventId,event_type:eventType,status:'processing',attempts:1,last_attempt_at:new Date().toISOString(),payload_summary:{eventType}});
  if(error){
    if(error.code==='23505')throw new AppError('CONFLICT','That billing event is already being processed.',409,true);
    throw new AppError('INTERNAL_ERROR','Billing event could not be recorded.',500,true);
  }
  return{idempotent:false};
}

export async function finishBillingEvent(db:SupabaseClient,provider:BillingEventProvider,eventId:string,status:BillingEventStatus,userId:string|null,summary:Record<string,unknown>,errorCode?:string):Promise<void>{
  const{error}=await db.from('together_billing_events').update({status,user_id:userId,payload_summary:summary,error_code:errorCode??null,processed_at:status==='failed'?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('provider',provider).eq('event_id',eventId);
  if(error)console.error(JSON.stringify({level:'error',operation:'finish_billing_event',provider,eventId,status,code:error.code}));
}
