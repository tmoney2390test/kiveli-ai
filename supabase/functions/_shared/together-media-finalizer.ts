import type{SupabaseClient}from'@supabase/supabase-js';
import{AppError}from'./types.ts';
import{refundCredits}from'./kivelle-subscription.ts';
import{track}from'./together.ts';
import type{ProviderCompletedMedia}from'./together-media-providers.ts';
import{gateGeneratedImageQuality}from'./together-media-quality.ts';
import{completeMediaUsageAttempt,markMediaOfferOutcome}from'./together-media-usage.ts';
import{imageDimensions,isSafeExternalHttpsUrl,matchesDeclaredMediaSignature}from'../../../packages/together-domain/src/index.ts';
import{consumeDailyPhotoAllowance,dailyPhotoReservationKey,releaseDailyPhotoAllowance}from'./kivelle-subscription.ts';
import{detectActualVideoAudioBehavior,normalizeMp4FastStart,stripMp4AudioTracks}from'./together-video-inspection.ts';
import{cleanupDirectVideoSourceFrame,isHiddenDirectVideoFrame}from'./together-direct-video-frame.ts';
import{gateGeneratedVideoQuality}from'./together-video-quality.ts';
import{currentAdultMediaJobAuthorized}from'./web-adult-access.ts';
import{adultVideoFeatureEnabled}from'./together-video-content.ts';

const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_VIDEO_BYTES=80*1024*1024;
const MAX_LORA_BYTES=1024*1024*1024;

type StorageUploadResult={error:{message?:string}|null};

/**
 * Storage is the last network hop after a provider has already done the
 * expensive generation work. Retry that hop locally before rerunning the
 * broader finalization pipeline or refunding the request.
 */
export async function uploadGeneratedMediaWithRetry(input:{upload:()=>PromiseLike<StorageUploadResult>;wait?:(delayMs:number)=>Promise<void>;maxAttempts?:number}):Promise<number>{
  const maxAttempts=Math.max(1,Math.min(4,input.maxAttempts??3)),wait=input.wait??((delayMs:number)=>new Promise<void>((resolve)=>setTimeout(resolve,delayMs)));
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    const result=await input.upload();
    if(!result.error)return attempt;
    if(attempt<maxAttempts)await wait(300*attempt);
  }
  throw new AppError('INTERNAL_ERROR','The generated media could not be stored.',500,true);
}

export async function finalizeProviderMedia(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const lease=await claimFinalizationLease(db,input.jobId,300);
  try{return await finalizeProviderMediaClaimed(db,input,lease.job,lease.token);}
  finally{if(lease.token)await releaseFinalizationLease(db,input.jobId,lease.token);}
}

async function finalizeProviderMediaClaimed(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>},claimedJob:Record<string,any>,leaseToken:string):Promise<Record<string,unknown>>{
  let job=claimedJob;
  const{data:media}=await db.from('together_generated_media').select('*').eq('id',String(job.generated_media_id)).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That media request is unavailable.',404);
  if(job.finalized_at&&media.status==='ready')return media as Record<string,unknown>;
  if(job.status==='failed'||job.status==='cancelled')throw new AppError('CONFLICT','That media job has already ended.',409);
  const mediaMetadata=(media.metadata??{}) as Record<string,unknown>,adultVideo=String(media.media_type)==='video'&&media.visibility_scope==='web_adult'&&mediaMetadata.adultAuthorized===true&&['suggestive','mature','explicit'].includes(String(media.content_level??''));
  if(adultVideo&&(!adultVideoFeatureEnabled()||!await currentAdultMediaJobAuthorized(db,media))){
    await failProviderMedia(db,{jobId:input.jobId,failureCode:'adult_authorization_expired',failureReasonSafe:'The authorized website session is no longer available. Your credits were returned.'});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }
  if(String(media.media_type)==='video'&&providerOutputCountInvalid(input.providerStatus)){
    await failProviderMedia(db,{jobId:input.jobId,failureCode:'provider_output_count_invalid',failureReasonSafe:'The video provider returned an invalid result. Your credits were returned.',providerMetadata:{outputCount:input.providerStatus?.outputCount}});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }
  if(String(media.media_type)==='video'&&!adultVideo&&providerSafetyViolation(input.providerStatus,input.result.providerMetadata)){
    await failProviderMedia(db,{jobId:input.jobId,failureCode:'provider_content_violation',failureReasonSafe:'The video did not pass Kivelle’s safety check. Your credits were returned.',providerMetadata:{hasNsfwContents:true}});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }

  const quality=await gateGeneratedImageQuality(db,job,media,input.result);
  if(quality.action==='deferred')return media as Record<string,unknown>;
  if(quality.action==='reject'){
    const verificationUnavailable=quality.reasonCodes.includes('adult_safety_unverified')||quality.reasonCodes.includes('world_unverified')||quality.reasonCodes.includes('requested_anatomy_unverified');
    await failProviderMedia(db,{jobId:input.jobId,failureCode:'image_quality_failed',failureReasonSafe:verificationUnavailable?'The photo could not be safely verified. Any included photo or credits used were returned.':'The photo did not pass Kivelle’s quality check. Any included photo or credits used were returned.',providerMetadata:{qualityReasonCodes:quality.reasonCodes}});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }
  input={...input,result:quality.result};
  const refreshed=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).maybeSingle();if(refreshed.data)job=refreshed.data;

  const downloaded=input.result.bytes?{bytes:input.result.bytes,contentType:input.result.contentType??defaultContentType(String(media.media_type))}:await downloadProviderOutput(String(input.result.outputUrl??''),String(media.media_type));
  validateOutput(downloaded.bytes,downloaded.contentType,String(media.media_type));
  const isVideo=String(media.media_type)==='video',providerAudioBehavior=isVideo?detectActualVideoAudioBehavior(downloaded.bytes,downloaded.contentType):null,soundRequested=media.sound_requested===true;
  const videoQuality=isVideo?await gateGeneratedVideoQuality(db,job,media,downloaded):{action:'accept' as const,reasonCodes:[],metadata:{},verificationUnavailable:false};
  if(videoQuality.action==='reject'){
    await failProviderMedia(db,{jobId:input.jobId,failureCode:videoQuality.verificationUnavailable?'video_quality_unverified':'video_quality_failed',failureReasonSafe:videoQuality.verificationUnavailable?'The video could not be safely verified. Your Kivelle Credits were restored.':'The video did not meet Kivelle’s visual quality standard. Your Kivelle Credits were restored.',providerMetadata:{qualityReasonCodes:videoQuality.reasonCodes}});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }
  const audioStrip=isVideo&&!soundRequested?stripMp4AudioTracks(downloaded.bytes,downloaded.contentType):{bytes:downloaded.bytes,stripped:false,removedTracks:0};
  if(isVideo&&!soundRequested&&providerAudioBehavior==='has_audio'&&!audioStrip.stripped)throw new AppError('MEDIA_FINALIZATION_FAILED','The provider audio track could not be removed safely. Your credits were returned.',500,false);
  const fastStart=isVideo?normalizeMp4FastStart(audioStrip.bytes,downloaded.contentType):{bytes:downloaded.bytes,fastStart:false,relocated:false,adjustedChunkOffsets:0};
  const deliveryBytes=fastStart.bytes;
  const dimensions=String(media.media_type)==='image'?imageDimensions(deliveryBytes,downloaded.contentType):null;
  const actualAudioBehavior=isVideo?detectActualVideoAudioBehavior(deliveryBytes,downloaded.contentType):null,finalSoundPresent=actualAudioBehavior==='has_audio';
  const extension=extensionFor(downloaded.contentType,String(media.media_type));
  const storagePath=`${media.user_id}/${media.character_instance_id}/${media.id}.${extension}`;
  await uploadGeneratedMediaWithRetry({upload:()=>db.storage.from('together-user-media').upload(storagePath,deliveryBytes,{contentType:downloaded.contentType,upsert:true,cacheControl:'31536000'})});

  const now=new Date().toISOString(),metadata=(media.metadata??{}) as Record<string,unknown>;
  const safeProviderMetadata={model:input.result.model,estimatedCost:input.result.estimatedCost??null,generationMs:input.result.generationMs??null,...videoQuality.metadata,...sanitizeProviderMetadata(input.result.providerMetadata??{}),...sanitizeProviderMetadata(input.providerStatus??{})};
  const{data:updated,error:updateError}=await db.from('together_generated_media').update({
    status:'ready',storage_path:storagePath,content_type:downloaded.contentType,byte_size:deliveryBytes.byteLength,
    width:input.result.width??dimensions?.width??media.width??null,height:input.result.height??dimensions?.height??media.height??null,duration_ms:input.result.durationMs??media.duration_ms??null,actual_audio_behavior:actualAudioBehavior,audio_stream_detected:providerAudioBehavior==='has_audio',audio_stripped:audioStrip.stripped,final_sound_present:finalSoundPresent,
    provider:String(job.provider),provider_request_id:String(job.provider_request_id??input.result.providerRequestId??'')||null,
    generation_ms:input.result.generationMs??media.generation_ms??null,failure_code:null,failure_reason_safe:null,claimed_at:null,next_attempt_at:null,
    metadata:{...metadata,...videoQuality.metadata,providerRouteId:job.route_id,providerModel:input.result.model,providerJobId:job.id,providerStatus:'completed',...(isVideo?{fastStart:fastStart.fastStart,fastStartNormalized:fastStart.relocated,fastStartChunkOffsetsAdjusted:fastStart.adjustedChunkOffsets,audioTrackCountRemoved:audioStrip.removedTracks,soundRequested,providerAudioMode:media.provider_audio_mode??null}:{})},updated_at:now,
  }).eq('id',media.id).in('status',['generating','queued','ready']).select('*').single();
  if(updateError||!updated)throw new AppError('INTERNAL_ERROR','The generated media status could not be saved.',500,true);
  const actualProviderCost=Number((input.result.providerMetadata??{}).actualProviderCostUsd);
  const{data:completedJob,error:completedJobError}=await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,actual_provider_cost_usd:Number.isFinite(actualProviderCost)?actualProviderCost:job.actual_provider_cost_usd??null,actual_audio_behavior:actualAudioBehavior,audio_stream_detected:providerAudioBehavior==='has_audio',audio_stripped:audioStrip.stripped,final_sound_present:finalSoundPresent,poll_lease_token:null,poll_lease_expires_at:null,finalization_lease_token:null,finalization_lease_expires_at:null,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),...safeProviderMetadata},failure_code:null,failure_reason_safe:null,updated_at:now}).eq('id',job.id).eq('finalization_lease_token',leaseToken).is('finalized_at',null).select('id').maybeSingle();
  if(completedJobError||!completedJob)throw new AppError('CONFLICT','Another worker completed this media delivery.',409,true);
  await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:Number(job.attempt_count??1),success:true,generationMs:input.result.generationMs});
  await markMediaOfferOutcome(db,{media:updated,status:'fulfilled'});
  if(metadata.includedBenefitType==='daily_companion_photo')await consumeDailyPhotoAllowance(db,{userId:String(media.user_id),reservationKey:dailyPhotoReservationKey(metadata)});
  const completionEvent=String(media.media_type)==='video'?'video_generation_completed':'media_generation_completed';
  const videoLatencies=String(media.media_type)==='video'?mediaDeliveryLatencies(job,now):{};
  await track(db,String(media.user_id),completionEvent,{mediaId:media.id,provider:job.provider,requestedModel:job.requested_model??job.model,resolvedModel:input.result.model,routeId:job.route_id,source:metadata.source,contentLevel:media.content_level,generationLatencyMs:input.result.generationMs??null,...videoLatencies,creditCost:metadata.creditCost??0,quotedProviderCostUsd:job.quoted_provider_cost_usd??null,actualProviderCostUsd:Number.isFinite(actualProviderCost)?actualProviderCost:null,soundRequested,audioStreamDetected:providerAudioBehavior==='has_audio',audioStripped:audioStrip.stripped,finalSoundPresent});
  if(String(media.media_type)==='video')await cleanupDirectVideoSourceFrame(db,updated as Record<string,unknown>);
  return updated as Record<string,unknown>;
}

export async function failProviderMedia(db:SupabaseClient,input:{jobId:string;failureCode:string;failureReasonSafe:string;providerMetadata?:Record<string,unknown>}):Promise<void>{
  const{data:job}=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).maybeSingle();if(!job||['completed','failed','cancelled'].includes(String(job.status)))return;
  const{data:media}=job.generated_media_id?await db.from('together_generated_media').select('*').eq('id',String(job.generated_media_id)).maybeSingle():{data:null};
  const now=new Date().toISOString();
  await db.from('together_media_provider_jobs').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,poll_lease_token:null,poll_lease_expires_at:null,finalization_lease_token:null,finalization_lease_expires_at:null,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),...sanitizeProviderMetadata(input.providerMetadata??{})},updated_at:now}).eq('id',job.id).in('status',['created','submitting','processing','submission_unknown']);
  await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:Number(job.attempt_count??1),success:false,failureCode:input.failureCode});
  if(job.character_media_profile_id){
    await db.from('together_character_media_profiles').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,updated_at:now}).eq('id',String(job.character_media_profile_id)).in('status',['pending','preparing','training']);
    if(job.user_id)await track(db,String(job.user_id),'character_lora_training_failed',{characterMediaProfileId:job.character_media_profile_id,provider:job.provider,model:job.model,failureCode:input.failureCode});
    return;
  }
  if(job.creator_asset_id){await failCreatorAsset(db,job,input.failureCode,input.failureReasonSafe,now);return;}
  if(!media)return;
  const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata;
  if(typeof metadata.creditTransactionId==='string'&&metadata.creditRefunded!==true){const refunded=await refundCredits(db,{userId:String(media.user_id),transactionId:String(metadata.creditTransactionId),idempotencyKey:`refund:${String(metadata.creditTransactionId)}`,metadata:{reason:'terminal_media_failure',mediaId:String(media.id),failureCode:input.failureCode}});if(refunded)nextMetadata={...metadata,creditRefunded:true,creditRefundedAt:now};}
  if(metadata.includedBenefitType==='daily_companion_photo'){const released=await releaseDailyPhotoAllowance(db,{userId:String(media.user_id),reservationKey:dailyPhotoReservationKey(metadata)});if(released)nextMetadata={...nextMetadata,dailyPhotoBenefitReleasedAt:now};}
  await db.from('together_generated_media').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,claimed_at:null,next_attempt_at:null,metadata:nextMetadata,updated_at:now}).eq('id',media.id).in('status',['queued','generating']);
  await markMediaOfferOutcome(db,{media:{...media,metadata:nextMetadata},status:'failed',failureCode:input.failureCode,failureReasonSafe:input.failureReasonSafe,creditRefunded:nextMetadata.creditRefunded===true});
  await track(db,String(media.user_id),'media_generation_failed',{mediaId:media.id,provider:job.provider,routeId:job.route_id,failureCode:input.failureCode,creditRefunded:nextMetadata.creditRefunded===true});
  if(String(media.media_type)==='video'){
    await track(db,String(media.user_id),'video_generation_failed',{mediaId:media.id,provider:job.provider,model:job.model,routeId:job.route_id,failureCode:input.failureCode,creditRefunded:nextMetadata.creditRefunded===true,quotedProviderCostUsd:job.quoted_provider_cost_usd??null,actualProviderCostUsd:job.actual_provider_cost_usd??null,...mediaDeliveryLatencies(job,now)});
    if(nextMetadata.creditRefunded===true)await track(db,String(media.user_id),'video_generation_refunded',{mediaId:media.id,provider:job.provider,routeId:job.route_id,failureCode:input.failureCode});
  }
  if(isHiddenDirectVideoFrame(media))await failDependentDirectVideo(db,media,input.failureCode);
}

/**
 * Ends a claimed media request that cannot be safely routed before a provider
 * job exists. This is deliberately separate from failProviderMedia(): missing
 * identity references and incompatible routes must never create a provider
 * request, but paid requests still need the same exact-once refund semantics.
 */
export async function failMediaBeforeProvider(db:SupabaseClient,input:{media:Record<string,unknown>;failureCode:string;failureReasonSafe:string}):Promise<void>{
  const mediaId=String(input.media.id??'');if(!mediaId)return;
  const{data:media}=await db.from('together_generated_media').select('*').eq('id',mediaId).maybeSingle();
  if(!media||!['queued','generating'].includes(String(media.status)))return;
  const now=new Date().toISOString(),metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata;
  if(typeof metadata.creditTransactionId==='string'&&metadata.creditRefunded!==true){const refunded=await refundCredits(db,{userId:String(media.user_id),transactionId:String(metadata.creditTransactionId),idempotencyKey:`refund:${String(metadata.creditTransactionId)}`,metadata:{reason:'media_rejected_before_provider',mediaId,failureCode:input.failureCode}});if(refunded)nextMetadata={...metadata,creditRefunded:true,creditRefundedAt:now};}
  if(metadata.includedBenefitType==='daily_companion_photo'){const released=await releaseDailyPhotoAllowance(db,{userId:String(media.user_id),reservationKey:dailyPhotoReservationKey(metadata)});if(released)nextMetadata={...nextMetadata,dailyPhotoBenefitReleasedAt:now};}
  const{data:updated}=await db.from('together_generated_media').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,claimed_at:null,next_attempt_at:null,metadata:nextMetadata,updated_at:now}).eq('id',mediaId).in('status',['queued','generating']).select('*').maybeSingle();
  if(!updated)return;
  await markMediaOfferOutcome(db,{media:updated,status:'failed',failureCode:input.failureCode,failureReasonSafe:input.failureReasonSafe,creditRefunded:nextMetadata.creditRefunded===true});
  await track(db,String(media.user_id),'media_generation_failed',{mediaId,provider:null,routeId:null,failureCode:input.failureCode,creditRefunded:nextMetadata.creditRefunded===true,providerRequestCreated:false});
  if(String(media.media_type)==='video'){
    await track(db,String(media.user_id),'video_generation_failed',{mediaId,provider:null,routeId:media.video_route_id??null,failureCode:input.failureCode,creditRefunded:nextMetadata.creditRefunded===true,providerRequestCreated:false,totalLatencyMs:elapsedMs(media.created_at,now)});
    if(nextMetadata.creditRefunded===true)await track(db,String(media.user_id),'video_generation_refunded',{mediaId,provider:null,routeId:media.video_route_id??null,failureCode:input.failureCode});
  }
  if(isHiddenDirectVideoFrame(media))await failDependentDirectVideo(db,media,input.failureCode);
}

async function failDependentDirectVideo(db:SupabaseClient,source:Record<string,unknown>,failureCode:string):Promise<void>{
  const{data:videos}=await db.from('together_generated_media').select('*').eq('parent_media_id',String(source.id)).eq('user_id',String(source.user_id)).eq('media_type','video').in('status',['queued','generating']);
  for(const video of videos??[])await failMediaBeforeProvider(db,{media:video,failureCode:`source_frame_${failureCode}`.slice(0,100),failureReasonSafe:'The private opening frame could not be created. Your video credits were returned.'});
}

function elapsedMs(from:unknown,to:unknown):number|null{
  const start=Date.parse(String(from??'')),end=Date.parse(String(to??''));
  return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):null;
}

function mediaDeliveryLatencies(job:Record<string,any>,finalizedAt:string){
  return{
    queueLatencyMs:elapsedMs(job.created_at,job.submitted_at),
    generationLatencyMs:elapsedMs(job.submitted_at,job.provider_completed_at),
    finalizationLatencyMs:elapsedMs(job.provider_completed_at,finalizedAt),
    totalLatencyMs:elapsedMs(job.created_at,finalizedAt),
  };
}

export async function finalizeLoraProviderJob(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const lease=await claimFinalizationLease(db,input.jobId,600);
  try{return await finalizeLoraProviderJobClaimed(db,input,lease.job,lease.token);}
  finally{if(lease.token)await releaseFinalizationLease(db,input.jobId,lease.token);}
}

async function finalizeLoraProviderJobClaimed(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>},job:Record<string,any>,leaseToken:string):Promise<Record<string,unknown>>{
  if(!job?.character_media_profile_id)throw new AppError('NOT_FOUND','That character training job is unavailable.',404);
  const{data:profile}=await db.from('together_character_media_profiles').select('*').eq('id',String(job.character_media_profile_id)).maybeSingle();
  if(!profile)throw new AppError('NOT_FOUND','That character media profile is unavailable.',404);
  if(job.finalized_at&&profile.status==='ready')return profile as Record<string,unknown>;
  const outputUrl=String(input.result.outputUrl??'');
  const downloaded=await downloadProviderBinary(outputUrl,MAX_LORA_BYTES,['application/octet-stream','binary/octet-stream','application/x-safetensors']);
  const storagePath=`characters/${profile.character_version_id}/${profile.model_family}/revision-${profile.source_revision}-${profile.id}.safetensors`;
  const uploaded=await db.storage.from('kivelle-model-assets').upload(storagePath,downloaded.bytes,{contentType:'application/octet-stream',upsert:false,cacheControl:'31536000'});
  if(uploaded.error&&!/already exists|duplicate/i.test(uploaded.error.message))throw new AppError('INTERNAL_ERROR','The trained character identity could not be stored.',500,true);
  const now=new Date().toISOString();
  const{data:updated,error}=await db.from('together_character_media_profiles').update({status:'ready',provider_training_id:String(job.provider_request_id??input.result.providerRequestId??'')||null,provider_model_id:input.result.model,model_storage_bucket:'kivelle-model-assets',model_storage_path:storagePath,trained_at:now,failure_code:null,failure_reason_safe:null,metadata:{...((profile.metadata??{}) as Record<string,unknown>),providerStatus:sanitizeProviderMetadata(input.providerStatus??{})},updated_at:now}).eq('id',profile.id).in('status',['preparing','training','ready']).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','The trained character identity could not be activated.',500,true);
  const{data:completedJob,error:completedJobError}=await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,poll_lease_token:null,poll_lease_expires_at:null,finalization_lease_token:null,finalization_lease_expires_at:null,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),model:input.result.model,generationMs:input.result.generationMs??null,...sanitizeProviderMetadata(input.providerStatus??{})},failure_code:null,failure_reason_safe:null,updated_at:now}).eq('id',job.id).eq('finalization_lease_token',leaseToken).is('finalized_at',null).select('id').maybeSingle();
  if(completedJobError||!completedJob)throw new AppError('CONFLICT','Another worker completed this character identity.',409,true);
  await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:Number(job.attempt_count??1),success:true,generationMs:input.result.generationMs});
  if(job.user_id)await track(db,String(job.user_id),'character_lora_training_completed',{characterMediaProfileId:profile.id,characterVersionId:profile.character_version_id,provider:job.provider,model:input.result.model,sourceRevision:profile.source_revision});
  return updated as Record<string,unknown>;
}

export async function finalizeCreatorProviderJob(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const lease=await claimFinalizationLease(db,input.jobId,180);
  try{return await finalizeCreatorProviderJobClaimed(db,input,lease.job,lease.token);}
  finally{if(lease.token)await releaseFinalizationLease(db,input.jobId,lease.token);}
}

async function finalizeCreatorProviderJobClaimed(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>},job:Record<string,any>,leaseToken:string):Promise<Record<string,unknown>>{
  if(!job?.creator_asset_id)throw new AppError('NOT_FOUND','That Creator media job is unavailable.',404);
  const{data:asset}=await db.from('together_creator_assets').select('*').eq('id',String(job.creator_asset_id)).maybeSingle();
  if(!asset)throw new AppError('NOT_FOUND','That Creator appearance is unavailable.',404);
  if(job.finalized_at&&asset.status==='ready')return asset as Record<string,unknown>;
  const downloaded=input.result.bytes?{bytes:input.result.bytes,contentType:input.result.contentType??'image/jpeg'}:await downloadProviderOutput(String(input.result.outputUrl??''),'image');
  validateOutput(downloaded.bytes,downloaded.contentType,'image');
  const dimensions=imageDimensions(downloaded.bytes,downloaded.contentType);
  const storagePath=`${asset.user_id}/creator-drafts/${asset.draft_id}/appearance-${asset.id}.${extensionFor(downloaded.contentType,'image')}`;
  const upload=await db.storage.from('kivelle-character-reference').upload(storagePath,downloaded.bytes,{contentType:downloaded.contentType,upsert:true,cacheControl:'31536000'});
  if(upload.error)throw new AppError('INTERNAL_ERROR','The Creator appearance could not be stored.',500,true);
  const now=new Date().toISOString();
  const{data:updated,error}=await db.from('together_creator_assets').update({status:'ready',storage_path:storagePath,content_type:downloaded.contentType,width:input.result.width??dimensions?.width??null,height:input.result.height??dimensions?.height??null,provider:job.provider,model:input.result.model,metadata:{...((asset.metadata??{}) as Record<string,unknown>),providerJobId:job.id,providerRouteId:job.route_id},updated_at:now}).eq('id',asset.id).in('status',['generating','ready']).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','The Creator appearance could not be finalized.',500,true);
  const{data:completedJob,error:completedJobError}=await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,poll_lease_token:null,poll_lease_expires_at:null,finalization_lease_token:null,finalization_lease_expires_at:null,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),model:input.result.model,...sanitizeProviderMetadata(input.providerStatus??{})},updated_at:now}).eq('id',job.id).eq('finalization_lease_token',leaseToken).is('finalized_at',null).select('id').maybeSingle();
  if(completedJobError||!completedJob)throw new AppError('CONFLICT','Another worker completed this Creator appearance.',409,true);
  await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:Number(job.attempt_count??1),success:true,generationMs:input.result.generationMs});
  await track(db,String(asset.user_id),'custom_companion_appearance_candidate_ready',{creatorDraftId:asset.draft_id,creatorAssetId:asset.id,provider:job.provider,model:input.result.model});
  return updated as Record<string,unknown>;
}

async function failCreatorAsset(db:SupabaseClient,job:Record<string,unknown>,failureCode:string,failureReasonSafe:string,now:string){
  const current=await db.from('together_creator_assets').select('*').eq('id',String(job.creator_asset_id)).maybeSingle();
  if(!current.data||!['queued','generating'].includes(String(current.data.status)))return;
  const{data:asset}=await db.from('together_creator_assets').update({status:'failed',metadata:{...((current.data.metadata??{}) as Record<string,unknown>),failureCode,failureReasonSafe},updated_at:now}).eq('id',String(job.creator_asset_id)).in('status',['queued','generating']).select('*').maybeSingle();
  if(!asset)return;
  const{data:group}=await db.from('together_creator_assets').select('id,status,metadata').eq('draft_id',asset.draft_id).eq('group_request_id',asset.group_request_id);
  const finished=(group??[]).every((item)=>['ready','failed','archived'].includes(String(item.status))),anyReady=(group??[]).some((item)=>item.status==='ready');
  const transactionId=String((asset.metadata as Record<string,unknown>|null)?.creditTransactionId??'');
  if(finished&&!anyReady&&transactionId){await refundCredits(db,{userId:String(asset.user_id),transactionId,idempotencyKey:`refund:${transactionId}`,metadata:{reason:'creator_draft_appearance_failed',creatorDraftId:asset.draft_id}});}
  await track(db,String(asset.user_id),'custom_companion_appearance_candidate_failed',{creatorDraftId:asset.draft_id,creatorAssetId:asset.id,provider:job.provider,failureCode});
}

async function claimFinalizationLease(db:SupabaseClient,jobId:string,leaseSeconds:number):Promise<{job:Record<string,any>;token:string}>{
  const{data,error}=await db.rpc('kivelle_claim_media_finalization',{p_job_id:jobId,p_lease_seconds:leaseSeconds});
  const claimed=Array.isArray(data)?data[0]:data;
  if(error)throw new AppError('INTERNAL_ERROR','The media delivery lease could not be acquired.',500,true);
  if(claimed)return{job:claimed as Record<string,any>,token:String(claimed.finalization_lease_token)};
  const{data:current}=await db.from('together_media_provider_jobs').select('*').eq('id',jobId).maybeSingle();
  if(!current)throw new AppError('NOT_FOUND','That media job is unavailable.',404);
  if(current.finalized_at)return{job:current as Record<string,any>,token:''};
  if(['failed','cancelled'].includes(String(current.status)))throw new AppError('CONFLICT','That media job has already ended.',409);
  throw new AppError('PROVIDER_UNAVAILABLE','That media result is already being delivered.',503,true);
}

async function releaseFinalizationLease(db:SupabaseClient,jobId:string,token:string):Promise<void>{
  const{error}=await db.rpc('kivelle_release_media_finalization',{p_job_id:jobId,p_lease_token:token});
  if(error)console.warn(JSON.stringify({level:'warn',operation:'release_media_finalization_lease',jobId,errorCode:error.code??'rpc_failed'}));
}

async function downloadProviderOutput(url:string,mediaType:string):Promise<{bytes:Uint8Array;contentType:string}>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45_000);
  try{const response=await fetchProviderOutput(url,controller.signal);if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','The generated media could not be collected.',503,true);const declared=Number(response.headers.get('content-length')??0),max=mediaType==='video'?MAX_VIDEO_BYTES:MAX_IMAGE_BYTES;if(declared>max)throw new AppError('PROVIDER_REQUEST_INVALID','The generated media was larger than allowed.',422,false);const bytes=await readResponseBytes(response,max);return{bytes,contentType:(response.headers.get('content-type')??defaultContentType(mediaType)).split(';')[0]!.toLowerCase()};}catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The generated media could not be collected yet.',503,true);}finally{clearTimeout(timeout);}
}

async function downloadProviderBinary(url:string,maxBytes:number,allowedContentTypes:string[]):Promise<{bytes:Uint8Array;contentType:string}>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90_000);
  try{const response=await fetchProviderOutput(url,controller.signal);if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','The trained model could not be collected.',503,true);const declared=Number(response.headers.get('content-length')??0);if(declared>maxBytes)throw new AppError('PROVIDER_REQUEST_INVALID','The trained model was larger than allowed.',422,false);const bytes=await readResponseBytes(response,maxBytes);const contentType=(response.headers.get('content-type')??'application/octet-stream').split(';')[0]!.toLowerCase();if(!allowedContentTypes.includes(contentType)&&contentType!=='application/octet-stream')throw new AppError('PROVIDER_REQUEST_INVALID','The provider returned an unsupported model format.',422,false);return{bytes,contentType};}catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The trained model could not be collected yet.',503,true);}finally{clearTimeout(timeout);}
}

async function fetchProviderOutput(value:string,signal:AbortSignal):Promise<Response>{
  let current=value;
  for(let redirect=0;redirect<=3;redirect+=1){
    if(!isSafeExternalHttpsUrl(current))throw new AppError('PROVIDER_UNAVAILABLE','The media provider returned an invalid result.',503,false);
    const response=await fetch(current,{signal,redirect:'manual'});
    if(![301,302,303,307,308].includes(response.status))return response;
    if(redirect===3)throw new AppError('PROVIDER_UNAVAILABLE','The media provider returned too many redirects.',503,false);
    const location=response.headers.get('location');
    if(!location)throw new AppError('PROVIDER_UNAVAILABLE','The media provider returned an invalid redirect.',503,false);
    await response.body?.cancel();
    current=new URL(location,current).toString();
  }
  throw new AppError('PROVIDER_UNAVAILABLE','The media provider returned an invalid result.',503,false);
}

async function readResponseBytes(response:Response,maxBytes:number):Promise<Uint8Array>{
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new AppError('PROVIDER_REQUEST_INVALID','The provider result was larger than allowed.',422,false);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}

function validateOutput(bytes:Uint8Array,contentType:string,mediaType:string){const max=mediaType==='video'?MAX_VIDEO_BYTES:MAX_IMAGE_BYTES,allowed=mediaType==='video'?['video/mp4','video/webm']:['image/jpeg','image/png','image/webp'];if(!bytes.byteLength||bytes.byteLength>max||!allowed.includes(contentType)||!matchesDeclaredMediaSignature(bytes,contentType))throw new AppError('PROVIDER_REQUEST_INVALID','The provider result did not match the expected media format.',422,false);}
function extensionFor(contentType:string,mediaType:string){if(contentType==='image/webp')return'webp';if(contentType==='image/png')return'png';if(contentType==='video/webm')return'webm';return mediaType==='video'?'mp4':'jpg';}
function defaultContentType(mediaType:string){return mediaType==='video'?'video/mp4':'image/jpeg';}
function sanitizeProviderMetadata(value:Record<string,unknown>):Record<string,unknown>{const allowed=['status','hasNsfwContents','inferenceMs','outputCount','webhookReceivedAt'];return Object.fromEntries(allowed.filter((key)=>key in value).map((key)=>[key,value[key]]));}
function providerSafetyViolation(...values:Array<Record<string,unknown>|undefined>):boolean{return values.some((value)=>{const flag=value?.hasNsfwContents??value?.has_nsfw_contents??value?.providerSafetyFlag;return flag===true||(Array.isArray(flag)&&flag.some(Boolean));});}
function providerOutputCountInvalid(value:Record<string,unknown>|undefined):boolean{const count=Number(value?.outputCount);return Number.isFinite(count)&&count!==1;}
