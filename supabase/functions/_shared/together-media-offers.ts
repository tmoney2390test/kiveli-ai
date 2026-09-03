import type{SupabaseClient}from'@supabase/supabase-js';
import{resolveMediaOfferPolicy,type MediaOfferSource}from'../../../packages/together-domain/src/media-economics.ts';
import{capabilitiesForTier,normalizeSubscriptionTier,type SubscriptionTier}from'../../../packages/together-domain/src/entitlements.ts';
import type{MediaContentLevel,MediaShotType}from'../../../packages/together-domain/src/media-routing.ts';
import{AppError}from'./types.ts';
import{track}from'./together.ts';
import{generatedPhotosEnabled}from'./together-photo-preferences.ts';
import{isFictionalCompanion}from'./together-media-character.ts';
import{loadValidatedMediaSubjects,normalizeMediaSubjectIds}from'./together-media-subjects.ts';
import{dailyPhotoAllowanceStatus,dailyPhotoReservationKey,releaseDailyPhotoAllowance}from'./kivelle-subscription.ts';
import{resolveCanonicalMediaWorld}from'./together-media-world.ts';
import{resolveProductionSafePhotoRequest}from'../../../packages/together-domain/src/media.ts';

export type CreateMediaOfferInput={
  userId:string;characterInstanceId:string;source:MediaOfferSource;
  subjectCharacterInstanceIds?:string[];
  conversationId?:string;messageId?:string;lifeEventId?:string;dateSessionId?:string;momentId?:string;storyArcId?:string;sceneSessionId?:string;sharedPlanId?:string;
  title?:string;companionMessage?:string;contentLevel?:MediaContentLevel;shotType?:MediaShotType;offerKey?:string;previewMetadata?:Record<string,unknown>;
  adultPipelineAuthorized?:boolean;
};

export async function createMediaOffer(db:SupabaseClient,input:CreateMediaOfferInput):Promise<Record<string,any>|null>{
  const originalPreview=input.previewMetadata??{},productionRequest=resolveProductionSafePhotoRequest({requestText:typeof originalPreview.requestText==='string'?originalPreview.requestText:undefined,requestedContentLevel:input.contentLevel,fallbackLevel:input.source==='date'?'romance':'standard',adultPipelineAuthorized:input.adultPipelineAuthorized===true});
  const subjectIds=normalizeMediaSubjectIds(input.characterInstanceId,input.subjectCharacterInstanceIds);
  const[subjects,profileResult,tier]=await Promise.all([
    loadValidatedMediaSubjects(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,subjectCharacterInstanceIds:subjectIds,conversationId:input.conversationId}),
    db.from('together_profiles').select('age_verified_at,photo_preferences,multimodal_preferences').eq('user_id',input.userId).maybeSingle(),
    resolveOfferSubscriptionTier(db,input.userId),
  ]);
  if(profileResult.error)throw new AppError('INTERNAL_ERROR','Your photo settings could not be checked.',500,true);
  const instance=subjects[0]!,profile=profileResult.data;
  const template=instance.together_character_templates as unknown as Record<string,unknown>,version=(instance.together_character_versions??{}) as unknown as Record<string,unknown>,preferences=(profile?.photo_preferences??{}) as Record<string,unknown>;
  if(!generatedPhotosEnabled(profile))return null;
  if(!profile?.age_verified_at||subjects.some((subject)=>{const subjectTemplate=subject.together_character_templates as Record<string,unknown>,subjectVersion=(subject.together_character_versions??{}) as Record<string,unknown>;return Number(subjectTemplate.age)<18||!isFictionalCompanion(subjectTemplate,subjectVersion);} ))return null;
  const canonicalPresence=originalPreview.canonicalPresence&&typeof originalPreview.canonicalPresence==='object'?originalPreview.canonicalPresence as Record<string,unknown>:null,{data:offerConversation}=input.conversationId?await db.from('together_conversations').select('group_world_id').eq('id',input.conversationId).eq('user_id',input.userId).maybeSingle():{data:null};
  const worldContainment=await resolveCanonicalMediaWorld({db,characterVersionIds:subjects.map((subject)=>String(subject.character_version_id)),requestText:input.source==='user_request'&&typeof originalPreview.requestText==='string'?originalPreview.requestText:undefined,authoritativeLocationId:input.source==='user_request'?undefined:String(input.previewMetadata?.locationId??'')||undefined,presenceLocationId:input.source==='user_request'?String(canonicalPresence?.locationId??'')||undefined:undefined,groupWorldId:String(offerConversation?.group_world_id??'')||undefined});
  const safeProviderRequest=productionRequest.requestText?`${productionRequest.requestText}${worldContainment.locationName?` Set the environment only at ${worldContainment.locationName}, inside ${worldContainment.worldName}.`:''}`.slice(0,400):undefined;
  const preview={...originalPreview,...(safeProviderRequest?{requestText:safeProviderRequest}:{}),productionMediaDowngraded:productionRequest.downgraded,productionMediaReason:productionRequest.reasonCode};
  let includedDatePhotosUsed=0;
  if(input.source==='date'&&tier!=='free'){
    if(!input.dateSessionId)throw new AppError('VALIDATION_FAILED','A completed Date is required for its souvenir photo.',400);
    const limit=capabilitiesForTier(tier).includedDatePhotoMonthlyLimit;
    const{data:claimed,error:claimError}=await db.rpc('kivelle_claim_included_date_photo',{p_user_id:input.userId,p_date_session_id:input.dateSessionId,p_monthly_limit:limit});
    if(claimError)throw new AppError('INTERNAL_ERROR','Your included Date photo allowance could not be checked.',500,true);
    includedDatePhotosUsed=claimed?0:limit;
  }
  const policy=resolveMediaOfferPolicy({source:input.source,tier,automaticPhotos:preferences.automaticPhotos!==false,includedDatePhotosUsed});
  if(!policy.createOffer)return null;
  const dailyAllowance=input.source==='user_request'?await dailyPhotoAllowanceStatus(db,{userId:input.userId,limit:capabilitiesForTier(tier).includedCompanionPhotoDailyLimit}):null;
  const offerKey=input.offerKey??canonicalOfferKey(input);
  const expiresAt=policy.expiresInHours===null?null:new Date(Date.now()+policy.expiresInHours*3600000).toISOString();
  const title=input.title?.trim().slice(0,120)||offerTitle(input.source),subjectNames=subjects.map((subject)=>String((subject.together_character_templates as Record<string,unknown>).name??'Companion')),name=subjectNames.join(' & ');
  const companionMessage=input.companionMessage?.trim().slice(0,500)||offerMessage(name,input.source,input.previewMetadata);
  const row={user_id:input.userId,continuity_id:String(instance.continuity_id),character_instance_id:input.characterInstanceId,subject_character_instance_ids:subjectIds,conversation_id:input.conversationId??null,message_id:input.messageId??null,life_event_id:input.lifeEventId??null,date_session_id:input.dateSessionId??null,moment_id:input.momentId??null,story_arc_id:input.storyArcId??null,scene_session_id:input.sceneSessionId??null,shared_plan_id:input.sharedPlanId??null,offer_key:offerKey,source:input.source,status:'pending',content_level:productionRequest.contentLevel,quality_tier:policy.qualityTier,shot_type:input.shotType??(input.source==='user_request'?'selfie':'scene'),credit_action:policy.creditAction,credit_cost:policy.creditCost,title,companion_message:companionMessage,preview_metadata:{...preview,characterName:name,subjectNames,subjectCount:subjectIds.length,providerRequested:false,autoAcceptIncludedBenefit:policy.autoAccept,resolvedWorldId:worldContainment.worldId,resolvedWorldName:worldContainment.worldName,resolvedLocationId:worldContainment.locationId??null,resolvedLocationName:worldContainment.locationName??null,requestedSetting:worldContainment.requestedSetting??null,sceneResolutionReason:worldContainment.resolutionReason,...(dailyAllowance?{dailyPhotoAllowanceLimit:dailyAllowance.limit,dailyPhotoAllowanceRemaining:dailyAllowance.remaining,dailyPhotoBenefitDate:dailyAllowance.benefitDate}:{})},included_subscription_benefit:policy.includedSubscriptionBenefit,included_benefit_type:policy.includedBenefitType,subscription_tier_at_creation:tier,expires_at:expiresAt};
  const{data,error}=await db.from('together_media_offers').insert(row).select('*').single();
  if(error){const{data:existing}=await db.from('together_media_offers').select('*').eq('user_id',input.userId).eq('offer_key',offerKey).maybeSingle();if(existing)return existing;throw new AppError('INTERNAL_ERROR','The photo offer could not be prepared.',500,true);}
  await track(db,input.userId,'media_offer_created',{offerId:data.id,source:input.source,tier,creditCost:policy.creditCost,contentLevel:row.content_level,qualityTier:row.quality_tier,characterInstanceId:input.characterInstanceId,subjectCount:subjectIds.length});
  return data;
}

export async function listPendingMediaOffers(db:SupabaseClient,input:{userId:string;continuityId?:string|null;characterInstanceId?:string|null;adultPipelineAuthorized?:boolean}):Promise<Record<string,any>[]>{
  const now=new Date().toISOString();
  const{data:expired}=await db.from('together_media_offers').update({status:'expired',updated_at:now}).eq('user_id',input.userId).eq('status','pending').not('expires_at','is',null).lte('expires_at',now).select('id,source,subscription_tier_at_creation,credit_cost,character_instance_id,included_benefit_type,preview_metadata');
  for(const offer of expired??[]){if(offer.included_benefit_type==='daily_companion_photo')await releaseDailyPhotoAllowance(db,{userId:input.userId,reservationKey:dailyPhotoReservationKey(offer.preview_metadata)});await track(db,input.userId,'media_offer_expired',{offerId:offer.id,source:offer.source,tier:offer.subscription_tier_at_creation,creditCost:offer.credit_cost,characterInstanceId:offer.character_instance_id});}
  // Keep recent failed requests in the chat snapshot so the inline card can
  // explain what happened and offer a retry instead of disappearing silently.
  let query=db.from('together_media_offers').select('*').eq('user_id',input.userId).in('status',['pending','accepted','failed']).in('content_level',input.adultPipelineAuthorized?['standard','romance','suggestive','mature','explicit']:['standard','romance']).order('created_at',{ascending:false}).limit(40);
  if(input.continuityId)query=query.eq('continuity_id',input.continuityId);
  if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
  const{data,error}=await query;if(error)throw new AppError('INTERNAL_ERROR','Photo offers could not be loaded.',500,true);
  const unseen=(data??[]).filter((offer)=>offer.status==='pending'&&!offer.viewed_at);
  if(unseen.length){await db.from('together_media_offers').update({viewed_at:now,updated_at:now}).eq('user_id',input.userId).in('id',unseen.map((offer)=>offer.id)).is('viewed_at',null);for(const offer of unseen)await track(db,input.userId,'media_offer_viewed',{offerId:offer.id,source:offer.source,tier:offer.subscription_tier_at_creation,creditCost:offer.credit_cost,characterInstanceId:offer.character_instance_id});}
  const presented=(data??[]).map((raw)=>unseen.some((item)=>item.id===raw.id)?{...raw,viewed_at:now}:raw);
  if(!presented.some((offer)=>offer.source==='user_request'&&offer.status==='pending'))return presented;
  const tier=await resolveOfferSubscriptionTier(db,input.userId),allowance=await dailyPhotoAllowanceStatus(db,{userId:input.userId,limit:capabilitiesForTier(tier).includedCompanionPhotoDailyLimit});
  return presented.map((offer)=>{
    if(offer.source!=='user_request'||offer.status!=='pending')return offer;
    return{...offer,preview_metadata:{...((offer.preview_metadata??{}) as Record<string,unknown>),dailyPhotoAllowanceLimit:allowance.limit,dailyPhotoAllowanceRemaining:allowance.remaining,dailyPhotoBenefitDate:allowance.benefitDate}};
  });
}

export async function declineMediaOffer(db:SupabaseClient,input:{userId:string;offerId:string}):Promise<Record<string,any>>{
  const now=new Date().toISOString();
  const{data,error}=await db.from('together_media_offers').update({status:'declined',declined_at:now,updated_at:now}).eq('id',input.offerId).eq('user_id',input.userId).eq('status','pending').select('*').maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','The photo offer could not be dismissed.',500,true);
  if(!data){const{data:existing}=await db.from('together_media_offers').select('*').eq('id',input.offerId).eq('user_id',input.userId).maybeSingle();if(!existing)throw new AppError('NOT_FOUND','That photo offer is unavailable.',404);return existing;}
  if(data.included_benefit_type==='daily_companion_photo')await releaseDailyPhotoAllowance(db,{userId:input.userId,reservationKey:dailyPhotoReservationKey(data.preview_metadata)});
  await track(db,input.userId,'media_offer_declined',{offerId:data.id,source:data.source,tier:data.subscription_tier_at_creation,creditCost:data.credit_cost,characterInstanceId:data.character_instance_id});return data;
}

function canonicalOfferKey(input:CreateMediaOfferInput):string{
  const event=input.source==='user_request'?input.messageId:input.dateSessionId??input.lifeEventId??input.momentId??input.storyArcId??input.sceneSessionId??input.sharedPlanId;
  if(!event)throw new AppError('VALIDATION_FAILED','A canonical event is required for a photo offer.',400);return`${input.source}:${event}`;
}
async function resolveOfferSubscriptionTier(db:SupabaseClient,userId:string,now=new Date()):Promise<SubscriptionTier>{
  const{data,error}=await db.from('together_entitlements').select('tier,expires_at').eq('user_id',userId).maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Subscription status could not be loaded.',500,true);
  if(data?.expires_at&&new Date(data.expires_at).getTime()<=now.getTime())return'free';
  return normalizeSubscriptionTier(data?.tier);
}
function offerTitle(source:MediaOfferSource):string{return source==='user_request'?'Picture request':source==='date'?'A photo from your Date':source==='story'?'A photo from this chapter':source==='moment'?'A photo from this Moment':'A photo from right now';}
function offerMessage(name:string,source:MediaOfferSource,metadata?:Record<string,unknown>):string{
  const location=typeof metadata?.locationName==='string'?metadata.locationName:'';
  if(source==='user_request')return `${name} wants to send you a picture`;
  if(source==='date')return `${name} saved a photo from your time together. Want to see it?`;
  if(source==='story')return `${name} caught something from this part of the story that you might want to see.`;
  if(source==='moment')return `${name} kept a picture from that moment. Want it?`;
  return location?`${name} took a picture at ${location}. Want to see it?`:`${name} took a picture and thought you might want to see it.`;
}
