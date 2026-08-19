import type{SupabaseClient}from'@supabase/supabase-js';
import{resolveMediaOfferPolicy,type MediaOfferSource}from'../../../packages/together-domain/src/media-economics.ts';
import{AppError}from'./types.ts';
import{resolveSubscriptionState,refundCredits}from'./kivelle-subscription.ts';
import{configuredMediaRegistry}from'./together-media-providers.ts';
import{kickMediaDispatcher,queueMediaRequest,type MediaContentLevel,type ShotType}from'./together-media.ts';
import{track}from'./together.ts';
import{waitUntil}from'./background.ts';

export type CreateMediaOfferInput={
  userId:string;characterInstanceId:string;source:MediaOfferSource;
  conversationId?:string;messageId?:string;lifeEventId?:string;dateSessionId?:string;momentId?:string;storyArcId?:string;sceneSessionId?:string;sharedPlanId?:string;
  title?:string;companionMessage?:string;contentLevel?:MediaContentLevel;shotType?:ShotType;offerKey?:string;previewMetadata?:Record<string,unknown>;
};

export async function createMediaOffer(db:SupabaseClient,input:CreateMediaOfferInput):Promise<Record<string,any>|null>{
  const[{data:instance},{data:profile},subscription]=await Promise.all([
    db.from('together_character_instances').select('id,user_id,continuity_id,together_character_templates(name,age,metadata)').eq('id',input.characterInstanceId).eq('user_id',input.userId).maybeSingle(),
    db.from('together_profiles').select('age_verified_at,photo_preferences').eq('user_id',input.userId).maybeSingle(),
    resolveSubscriptionState(db,input.userId),
  ]);
  if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const template=instance.together_character_templates as unknown as Record<string,unknown>,preferences=(profile?.photo_preferences??{}) as Record<string,unknown>;
  if(preferences.companionPhotos===false)return null;
  if(!profile?.age_verified_at||Number(template.age)<18||(template.metadata as Record<string,unknown>|undefined)?.fictional===false)return null;
  const policy=resolveMediaOfferPolicy({source:input.source,tier:subscription.tier,automaticPhotos:preferences.automaticPhotos!==false});
  if(!policy.createOffer)return null;
  const offerKey=input.offerKey??canonicalOfferKey(input);
  const expiresAt=policy.expiresInHours===null?null:new Date(Date.now()+policy.expiresInHours*3600000).toISOString();
  const title=input.title?.trim().slice(0,120)||offerTitle(input.source),name=String(template.name??'Your companion');
  const companionMessage=input.companionMessage?.trim().slice(0,500)||offerMessage(name,input.source,input.previewMetadata);
  const row={user_id:input.userId,continuity_id:String(instance.continuity_id),character_instance_id:input.characterInstanceId,conversation_id:input.conversationId??null,message_id:input.messageId??null,life_event_id:input.lifeEventId??null,date_session_id:input.dateSessionId??null,moment_id:input.momentId??null,story_arc_id:input.storyArcId??null,scene_session_id:input.sceneSessionId??null,shared_plan_id:input.sharedPlanId??null,offer_key:offerKey,source:input.source,status:'pending',content_level:normalizeOfferLevel(input.contentLevel),quality_tier:policy.qualityTier,shot_type:input.shotType??'scene',credit_action:policy.creditAction,credit_cost:policy.creditCost,title,companion_message:companionMessage,preview_metadata:{...(input.previewMetadata??{}),characterName:name,providerRequested:false},included_subscription_benefit:policy.includedSubscriptionBenefit,included_benefit_type:policy.includedBenefitType,subscription_tier_at_creation:subscription.tier,expires_at:expiresAt};
  const{data,error}=await db.from('together_media_offers').insert(row).select('*').single();
  if(error){const{data:existing}=await db.from('together_media_offers').select('*').eq('user_id',input.userId).eq('offer_key',offerKey).maybeSingle();if(existing)return existing;throw new AppError('INTERNAL_ERROR','The photo offer could not be prepared.',500,true);}
  await track(db,input.userId,'media_offer_created',{offerId:data.id,source:input.source,tier:subscription.tier,creditCost:policy.creditCost,contentLevel:row.content_level,qualityTier:row.quality_tier,characterInstanceId:input.characterInstanceId});
  if(policy.autoAccept&&configuredMediaRegistry().some((route)=>route.enabled&&route.mediaTypes.includes('image'))){
    const accepted=await acceptMediaOffer(db,{userId:input.userId,offerId:String(data.id),requestId:`included:${data.id}`});
    return accepted.offer??data;
  }
  return data;
}

export async function listPendingMediaOffers(db:SupabaseClient,input:{userId:string;continuityId?:string|null;characterInstanceId?:string|null}):Promise<Record<string,any>[]>{
  const now=new Date().toISOString();
  const{data:expired}=await db.from('together_media_offers').update({status:'expired',updated_at:now}).eq('user_id',input.userId).eq('status','pending').not('expires_at','is',null).lte('expires_at',now).select('id,source,subscription_tier_at_creation,credit_cost,character_instance_id');
  for(const offer of expired??[])await track(db,input.userId,'media_offer_expired',{offerId:offer.id,source:offer.source,tier:offer.subscription_tier_at_creation,creditCost:offer.credit_cost,characterInstanceId:offer.character_instance_id});
  let query=db.from('together_media_offers').select('*').eq('user_id',input.userId).in('status',['pending','accepted']).order('created_at',{ascending:false}).limit(40);
  if(input.continuityId)query=query.eq('continuity_id',input.continuityId);
  if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
  const{data,error}=await query;if(error)throw new AppError('INTERNAL_ERROR','Photo offers could not be loaded.',500,true);
  const unseen=(data??[]).filter((offer)=>offer.status==='pending'&&!offer.viewed_at);
  if(unseen.length){await db.from('together_media_offers').update({viewed_at:now,updated_at:now}).eq('user_id',input.userId).in('id',unseen.map((offer)=>offer.id)).is('viewed_at',null);for(const offer of unseen)await track(db,input.userId,'media_offer_viewed',{offerId:offer.id,source:offer.source,tier:offer.subscription_tier_at_creation,creditCost:offer.credit_cost,characterInstanceId:offer.character_instance_id});}
  return(data??[]).map((offer)=>unseen.some((item)=>item.id===offer.id)?{...offer,viewed_at:now}:offer);
}

export async function declineMediaOffer(db:SupabaseClient,input:{userId:string;offerId:string}):Promise<Record<string,any>>{
  const now=new Date().toISOString();
  const{data,error}=await db.from('together_media_offers').update({status:'declined',declined_at:now,updated_at:now}).eq('id',input.offerId).eq('user_id',input.userId).eq('status','pending').select('*').maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','The photo offer could not be dismissed.',500,true);
  if(!data){const{data:existing}=await db.from('together_media_offers').select('*').eq('id',input.offerId).eq('user_id',input.userId).maybeSingle();if(!existing)throw new AppError('NOT_FOUND','That photo offer is unavailable.',404);return existing;}
  await track(db,input.userId,'media_offer_declined',{offerId:data.id,source:data.source,tier:data.subscription_tier_at_creation,creditCost:data.credit_cost,characterInstanceId:data.character_instance_id});return data;
}

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

function canonicalOfferKey(input:CreateMediaOfferInput):string{
  const event=input.dateSessionId??input.lifeEventId??input.momentId??input.storyArcId??input.sceneSessionId??input.sharedPlanId;
  if(!event)throw new AppError('VALIDATION_FAILED','A canonical event is required for a photo offer.',400);return`${input.source}:${event}`;
}
function normalizeOfferLevel(value?:MediaContentLevel):'standard'|'romance'{return value==='romance'?'romance':'standard';}
function offerTitle(source:MediaOfferSource):string{return source==='date'?'A photo from your Date':source==='story'?'A photo from this chapter':source==='moment'?'A photo from this Moment':'A photo from right now';}
function offerMessage(name:string,source:MediaOfferSource,metadata?:Record<string,unknown>):string{
  const location=typeof metadata?.locationName==='string'?metadata.locationName:'';
  if(source==='date')return `${name} saved a photo from your time together. Want to see it?`;
  if(source==='story')return `${name} caught something from this part of the story that you might want to see.`;
  if(source==='moment')return `${name} kept a picture from that moment. Want it?`;
  return location?`${name} took a picture at ${location}. Want to see it?`:`${name} took a picture and thought you might want to see it.`;
}
