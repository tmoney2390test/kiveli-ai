import type{SupabaseClient}from'@supabase/supabase-js';
import type{MediaOfferSource}from'../../../packages/together-domain/src/media-economics.ts';
import{waitUntil}from'./background.ts';
import{resolveSubscriptionState,refundCredits}from'./kivelle-subscription.ts';
import{kickMediaDispatcher,queueMediaRequest,type ShotType}from'./together-media.ts';
import{configuredMediaRegistry}from'./together-media-providers.ts';
import{track}from'./together.ts';
import{AppError}from'./types.ts';

export async function acceptMediaOffer(db:SupabaseClient,input:{userId:string;offerId:string;requestId:string}):Promise<{state:'accepted'|'needs_credits'|'expired';offer:Record<string,any>;media?:Record<string,unknown>;creditBalance:number;required?:number}>{
  const{data:offer}=await db.from('together_media_offers').select('*').eq('id',input.offerId).eq('user_id',input.userId).maybeSingle();
  if(!offer)throw new AppError('NOT_FOUND','That photo offer is unavailable.',404);
  if(offer.generated_media_id){const{data:media}=await db.from('together_generated_media').select('*').eq('id',offer.generated_media_id).eq('user_id',input.userId).maybeSingle();const state=await resolveSubscriptionState(db,input.userId);return{state:'accepted',offer,media:media??undefined,creditBalance:state.creditBalance.total};}
  if(!configuredMediaRegistry().some((route)=>route.enabled&&route.mediaTypes.includes('image')))throw new AppError('PROVIDER_NOT_CONFIGURED',"Photo generation isn't connected yet.",503);
  const{data:accepted,error}=await db.rpc('kivelle_accept_media_offer',{p_user_id:input.userId,p_offer_id:input.offerId,p_request_id:input.requestId});
  if(error)throw new AppError(String(error.message).includes('NOT_PENDING')?'CONFLICT':'INTERNAL_ERROR',String(error.message).includes('NOT_PENDING')?'That photo offer is no longer available.':'The photo offer could not be accepted.',String(error.message).includes('NOT_PENDING')?409:500,true);
  const state=String(accepted?.state);
  if(state==='needs_credits'){await track(db,input.userId,'media_offer_insufficient_credits',{offerId:offer.id,source:offer.source,tier:offer.subscription_tier_at_creation,creditCost:offer.credit_cost,characterInstanceId:offer.character_instance_id});return{state:'needs_credits',offer,creditBalance:Number(accepted.creditBalance??0),required:Number(accepted.required??offer.credit_cost)};}
  if(state==='expired'){const{data:expired}=await db.from('together_media_offers').select('*').eq('id',input.offerId).single();return{state:'expired',offer:expired,creditBalance:Number(accepted.creditBalance??0)};}
  const{data:fresh}=await db.from('together_media_offers').select('*').eq('id',input.offerId).eq('user_id',input.userId).single();
  try{
    const media=await queueMediaRequest(db,{userId:input.userId,characterInstanceId:String(fresh.character_instance_id),source:String(fresh.source) as MediaOfferSource,conversationId:fresh.conversation_id??undefined,messageId:fresh.message_id??undefined,lifeEventId:fresh.life_event_id??undefined,dateSessionId:fresh.date_session_id??undefined,momentId:fresh.moment_id??undefined,storyArcId:fresh.story_arc_id??undefined,sceneSessionId:fresh.scene_session_id??undefined,sharedPlanId:fresh.shared_plan_id??undefined,idempotencyKey:`offer:${fresh.id}`,force:true,qualityTierOverride:String(fresh.quality_tier) as 'economy'|'standard'|'premium',shotTypeOverride:String(fresh.shot_type) as ShotType,economicAuthorization:{kind:fresh.included_subscription_benefit?'included_benefit':'accepted_offer',mediaOfferId:String(fresh.id),creditTransactionId:fresh.credit_transaction_id??null,creditCost:Number(fresh.credit_cost),creditAction:'companion_photo',includedBenefit:Boolean(fresh.included_subscription_benefit),includedBenefitType:fresh.included_benefit_type??null,subscriptionTier:String(fresh.subscription_tier_at_creation)}});
    if(!media)throw new AppError('FORBIDDEN','That photo is no longer allowed by the current media preferences.',403);
    const now=new Date().toISOString();const{data:linked,error:linkError}=await db.from('together_media_offers').update({generated_media_id:media.id,updated_at:now}).eq('id',fresh.id).eq('user_id',input.userId).select('*').single();if(linkError)throw new AppError('INTERNAL_ERROR','The generated photo could not be linked safely.',500,true);
    await track(db,input.userId,'media_offer_accepted',{offerId:fresh.id,source:fresh.source,tier:fresh.subscription_tier_at_creation,creditCost:fresh.credit_cost,contentLevel:fresh.content_level,qualityTier:fresh.quality_tier,characterInstanceId:fresh.character_instance_id});
    if(fresh.included_subscription_benefit)await track(db,input.userId,'included_date_photo_generated',{offerId:fresh.id,tier:fresh.subscription_tier_at_creation,dateSessionId:fresh.date_session_id,characterInstanceId:fresh.character_instance_id});
    waitUntil(kickMediaDispatcher());return{state:'accepted',offer:linked,media,creditBalance:Number(accepted.creditBalance??0)};
  }catch(error){
    if(fresh.credit_transaction_id){await refundCredits(db,{userId:input.userId,transactionId:String(fresh.credit_transaction_id),idempotencyKey:`refund:media-offer:${fresh.id}`,metadata:{reason:'offer_queue_setup_failed',offerId:fresh.id}});}
    const now=new Date().toISOString();await db.from('together_media_offers').update({status:'failed',credit_refunded:Boolean(fresh.credit_transaction_id),failure_code:'queue_setup_failed',failure_reason_safe:'The photo could not be created. Any credits used were returned.',updated_at:now}).eq('id',fresh.id).eq('user_id',input.userId);throw error;
  }
}
