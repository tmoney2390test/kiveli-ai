import type{SupabaseClient}from'@supabase/supabase-js';
import{AppError}from'./types.ts';
import{queueMediaRequest as queueBase,type QueueMediaInput}from'./together-media-base.ts';
import{refundCredits,resolveSubscriptionState,spendCredits}from'./kivelle-subscription.ts';
export*from'./together-media-base.ts';

export async function queueMediaRequest(db:SupabaseClient,input:QueueMediaInput):Promise<Record<string,unknown>|null>{
  const media=await queueBase(db,input);if(!media||input.source!=='user_request')return media;
  const metadata=(media.metadata??{}) as Record<string,unknown>;
  if(typeof metadata.creditTransactionId==='string')return media;
  if(String(media.status)!=='queued')return media; // legacy ready media is never retroactively charged
  const subscription=await resolveSubscriptionState(db,input.userId);let charged:Awaited<ReturnType<typeof spendCredits>>|null=null;
  try{
    charged=await spendCredits(db,{userId:input.userId,action:'companion_photo',idempotencyKey:`media:${String(media.id)}`,referenceType:'generated_media',referenceId:String(media.id),metadata:{requestId:input.idempotencyKey??null,characterInstanceId:input.characterInstanceId,tier:subscription.tier}});
    const nextMetadata={...metadata,creditTransactionId:charged.transactionId,creditRequestId:input.idempotencyKey??null,creditCost:charged.cost,creditAction:'companion_photo',creditRefunded:false};
    const{data:updated,error}=await db.from('together_generated_media').update({metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',String(media.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
    if(error||!updated)throw new AppError('INTERNAL_ERROR','The photo charge could not be attached safely.',500,true);
    return updated;
  }catch(error){
    if(error instanceof AppError&&error.code==='INSUFFICIENT_CREDITS'){
      const nextMetadata={...metadata,creditRequestId:input.idempotencyKey??null,creditCost:10,creditAction:'companion_photo',creditRefunded:false,needsCredits:true};
      const{data:failed}=await db.from('together_generated_media').update({status:'failed',failure_code:'insufficient_credits',failure_reason_safe:'This photo uses 10 Kivelle Credits. Add credits and retry.',metadata:nextMetadata,next_attempt_at:null,claimed_at:null,updated_at:new Date().toISOString()}).eq('id',String(media.id)).eq('user_id',input.userId).eq('status','queued').select('*').single();
      return failed??media;
    }
    if(charged)await refundCredits(db,{userId:input.userId,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'media_queue_setup_failed',mediaId:String(media.id)}});
    await db.from('together_generated_media').delete().eq('id',String(media.id)).eq('user_id',input.userId).eq('status','queued');
    throw error;
  }
}
