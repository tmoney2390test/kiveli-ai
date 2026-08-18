import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { queueMediaRequest as queueBase, type QueueMediaInput } from './together-media-base.ts';
import { configuredMediaRegistry } from './together-media-providers.ts';
import { refundCredits, resolveSubscriptionState, spendCredits } from './kivelle-subscription.ts';
export * from './together-media-base.ts';

export async function queueMediaRequest(db:SupabaseClient,input:QueueMediaInput):Promise<Record<string,unknown>|null>{
  const media=await queueBase(db,input);if(!media)return media;
  if(String(media.status)!=='queued')return media; // legacy ready media is never retroactively charged or reprioritized
  if(!configuredMediaRegistry().some((route)=>route.enabled&&route.mediaTypes.includes('image'))){
    const metadata=(media.metadata??{}) as Record<string,unknown>;
    const{data:unavailable}=await db.from('together_generated_media').update({status:'failed',failure_code:'provider_not_configured',failure_reason_safe:"Photo generation isn't connected yet.",next_attempt_at:null,claimed_at:null,metadata:{...metadata,providerStatus:'not_configured'},updated_at:new Date().toISOString()}).eq('id',String(media.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
    return unavailable??media;
  }
  const subscription=await resolveSubscriptionState(db,input.userId),priority=subscription.capabilities.mediaQueue==='highest'?20:subscription.capabilities.mediaQueue==='priority'?10:0;
  const{data:prioritized,error:priorityError}=await db.from('together_generated_media').update({queue_priority:priority,updated_at:new Date().toISOString()}).eq('id',String(media.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
  if(priorityError||!prioritized)throw new AppError('INTERNAL_ERROR','The photo queue could not be prioritized safely.',500,true);
  if(input.source!=='user_request')return prioritized;
  const metadata=(prioritized.metadata??{}) as Record<string,unknown>;
  if(typeof metadata.creditTransactionId==='string')return prioritized;
  let charged:Awaited<ReturnType<typeof spendCredits>>|null=null;
  try{
    charged=await spendCredits(db,{userId:input.userId,action:'companion_photo',idempotencyKey:`media:${String(prioritized.id)}`,referenceType:'generated_media',referenceId:String(prioritized.id),metadata:{requestId:input.idempotencyKey??null,characterInstanceId:input.characterInstanceId,tier:subscription.tier,queuePriority:priority}});
    const nextMetadata={...metadata,creditTransactionId:charged.transactionId,creditRequestId:input.idempotencyKey??null,creditCost:charged.cost,creditAction:'companion_photo',creditRefunded:false};
    const{data:updated,error}=await db.from('together_generated_media').update({metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',String(prioritized.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
    if(error||!updated)throw new AppError('INTERNAL_ERROR','The photo charge could not be attached safely.',500,true);
    return updated;
  }catch(error){
    if(error instanceof AppError&&error.code==='INSUFFICIENT_CREDITS'){
      const nextMetadata={...metadata,creditRequestId:input.idempotencyKey??null,creditCost:10,creditAction:'companion_photo',creditRefunded:false,needsCredits:true};
      const{data:failed}=await db.from('together_generated_media').update({status:'failed',failure_code:'insufficient_credits',failure_reason_safe:'This photo uses 10 Kivelle Credits. Add credits and retry.',metadata:nextMetadata,next_attempt_at:null,claimed_at:null,updated_at:new Date().toISOString()}).eq('id',String(prioritized.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
      return failed??prioritized;
    }
    if(charged)await refundCredits(db,{userId:input.userId,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'media_queue_setup_failed',mediaId:String(prioritized.id)}});
    await db.from('together_generated_media').delete().eq('id',String(prioritized.id)).eq('user_id',input.userId).eq('status','queued');
    throw error;
  }
}
