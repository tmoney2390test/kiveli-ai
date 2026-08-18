import type{SupabaseClient}from'@supabase/supabase-js';
import{AppError}from'./types.ts';
import{refundCredits}from'./kivelle-subscription.ts';
import{track}from'./together.ts';
import type{ProviderCompletedMedia}from'./together-media-providers.ts';
import{gateGeneratedImageQuality}from'./together-media-quality.ts';

const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_VIDEO_BYTES=80*1024*1024;
const MAX_LORA_BYTES=1024*1024*1024;

export async function finalizeProviderMedia(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  let{data:job}=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).maybeSingle();
  if(!job)throw new AppError('NOT_FOUND','That media job is unavailable.',404);
  const{data:media}=await db.from('together_generated_media').select('*').eq('id',String(job.generated_media_id)).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That media request is unavailable.',404);
  if(job.finalized_at&&media.status==='ready')return media as Record<string,unknown>;
  if(job.status==='failed'||job.status==='cancelled')throw new AppError('CONFLICT','That media job has already ended.',409);

  const quality=await gateGeneratedImageQuality(db,job,media,input.result);
  if(quality.action==='deferred')return media as Record<string,unknown>;
  if(quality.action==='reject'){
    await failProviderMedia(db,{jobId:input.jobId,failureCode:'image_quality_failed',failureReasonSafe:'The photo did not come out clearly. Your credits were returned.',providerMetadata:{qualityReasonCodes:quality.reasonCodes}});
    const{data:failed}=await db.from('together_generated_media').select('*').eq('id',media.id).maybeSingle();
    return(failed??media) as Record<string,unknown>;
  }
  input={...input,result:quality.result};
  const refreshed=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).maybeSingle();if(refreshed.data)job=refreshed.data;

  const downloaded=input.result.bytes?{bytes:input.result.bytes,contentType:input.result.contentType??defaultContentType(String(media.media_type))}:await downloadProviderOutput(String(input.result.outputUrl??''),String(media.media_type));
  validateOutput(downloaded.bytes,downloaded.contentType,String(media.media_type));
  const extension=extensionFor(downloaded.contentType,String(media.media_type));
  const storagePath=`${media.user_id}/${media.character_instance_id}/${media.id}.${extension}`;
  const{error:uploadError}=await db.storage.from('together-user-media').upload(storagePath,downloaded.bytes,{contentType:downloaded.contentType,upsert:true,cacheControl:'31536000'});
  if(uploadError)throw new AppError('INTERNAL_ERROR','The generated media could not be stored.',500,true);

  const now=new Date().toISOString(),metadata=(media.metadata??{}) as Record<string,unknown>;
  const safeProviderMetadata={model:input.result.model,estimatedCost:input.result.estimatedCost??null,generationMs:input.result.generationMs??null,...sanitizeProviderMetadata(input.providerStatus??{})};
  const{data:updated,error:updateError}=await db.from('together_generated_media').update({
    status:'ready',storage_path:storagePath,content_type:downloaded.contentType,byte_size:downloaded.bytes.byteLength,
    width:input.result.width??media.width??null,height:input.result.height??media.height??null,duration_ms:input.result.durationMs??media.duration_ms??null,
    provider:String(job.provider),provider_request_id:String(job.provider_request_id??input.result.providerRequestId??'')||null,
    generation_ms:input.result.generationMs??media.generation_ms??null,failure_code:null,failure_reason_safe:null,claimed_at:null,next_attempt_at:null,
    metadata:{...metadata,providerRouteId:job.route_id,providerModel:input.result.model,providerJobId:job.id,providerStatus:'completed'},updated_at:now,
  }).eq('id',media.id).in('status',['generating','queued','ready']).select('*').single();
  if(updateError||!updated)throw new AppError('INTERNAL_ERROR','The generated media status could not be saved.',500,true);
  await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),...safeProviderMetadata},failure_code:null,failure_reason_safe:null,updated_at:now}).eq('id',job.id).is('finalized_at',null);
  await track(db,String(media.user_id),String(media.media_type)==='video'?'media_video_ready':'media_generation_completed',{mediaId:media.id,provider:job.provider,model:input.result.model,routeId:job.route_id,source:metadata.source,contentLevel:media.content_level,duration:input.result.generationMs??null,creditCost:metadata.creditCost??0});
  return updated as Record<string,unknown>;
}

export async function failProviderMedia(db:SupabaseClient,input:{jobId:string;failureCode:string;failureReasonSafe:string;providerMetadata?:Record<string,unknown>}):Promise<void>{
  const{data:job}=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).maybeSingle();if(!job||['completed','failed','cancelled'].includes(String(job.status)))return;
  const{data:media}=job.generated_media_id?await db.from('together_generated_media').select('*').eq('id',String(job.generated_media_id)).maybeSingle():{data:null};
  const now=new Date().toISOString();
  await db.from('together_media_provider_jobs').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),...sanitizeProviderMetadata(input.providerMetadata??{})},updated_at:now}).eq('id',job.id).in('status',['created','submitting','processing','submission_unknown']);
  if(job.character_media_profile_id){
    await db.from('together_character_media_profiles').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,updated_at:now}).eq('id',String(job.character_media_profile_id)).in('status',['pending','preparing','training']);
    if(job.user_id)await track(db,String(job.user_id),'character_lora_training_failed',{characterMediaProfileId:job.character_media_profile_id,provider:job.provider,model:job.model,failureCode:input.failureCode});
    return;
  }
  if(job.creator_asset_id){await failCreatorAsset(db,job,input.failureCode,input.failureReasonSafe,now);return;}
  if(!media)return;
  const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata;
  if(typeof metadata.creditTransactionId==='string'&&metadata.creditRefunded!==true){const refunded=await refundCredits(db,{userId:String(media.user_id),transactionId:String(metadata.creditTransactionId),idempotencyKey:`refund:${String(metadata.creditTransactionId)}`,metadata:{reason:'terminal_media_failure',mediaId:String(media.id),failureCode:input.failureCode}});if(refunded)nextMetadata={...metadata,creditRefunded:true,creditRefundedAt:now};}
  await db.from('together_generated_media').update({status:'failed',failure_code:input.failureCode,failure_reason_safe:input.failureReasonSafe,claimed_at:null,next_attempt_at:null,metadata:nextMetadata,updated_at:now}).eq('id',media.id).in('status',['queued','generating']);
  await track(db,String(media.user_id),'media_generation_failed',{mediaId:media.id,provider:job.provider,routeId:job.route_id,failureCode:input.failureCode,creditRefunded:nextMetadata.creditRefunded===true});
}

export async function finalizeLoraProviderJob(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const{data:job}=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).eq('job_type','lora').maybeSingle();
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
  await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),model:input.result.model,generationMs:input.result.generationMs??null,...sanitizeProviderMetadata(input.providerStatus??{})},failure_code:null,failure_reason_safe:null,updated_at:now}).eq('id',job.id).is('finalized_at',null);
  if(job.user_id)await track(db,String(job.user_id),'character_lora_training_completed',{characterMediaProfileId:profile.id,characterVersionId:profile.character_version_id,provider:job.provider,model:input.result.model,sourceRevision:profile.source_revision});
  return updated as Record<string,unknown>;
}

export async function finalizeCreatorProviderJob(db:SupabaseClient,input:{jobId:string;result:ProviderCompletedMedia;providerStatus?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const{data:job}=await db.from('together_media_provider_jobs').select('*').eq('id',input.jobId).eq('job_type','image').maybeSingle();
  if(!job?.creator_asset_id)throw new AppError('NOT_FOUND','That Creator media job is unavailable.',404);
  const{data:asset}=await db.from('together_creator_assets').select('*').eq('id',String(job.creator_asset_id)).maybeSingle();
  if(!asset)throw new AppError('NOT_FOUND','That Creator appearance is unavailable.',404);
  if(job.finalized_at&&asset.status==='ready')return asset as Record<string,unknown>;
  const downloaded=input.result.bytes?{bytes:input.result.bytes,contentType:input.result.contentType??'image/jpeg'}:await downloadProviderOutput(String(input.result.outputUrl??''),'image');
  validateOutput(downloaded.bytes,downloaded.contentType,'image');
  const storagePath=`${asset.user_id}/creator-drafts/${asset.draft_id}/appearance-${asset.id}.${extensionFor(downloaded.contentType,'image')}`;
  const upload=await db.storage.from('kivelle-character-reference').upload(storagePath,downloaded.bytes,{contentType:downloaded.contentType,upsert:true,cacheControl:'31536000'});
  if(upload.error)throw new AppError('INTERNAL_ERROR','The Creator appearance could not be stored.',500,true);
  const now=new Date().toISOString();
  const{data:updated,error}=await db.from('together_creator_assets').update({status:'ready',storage_path:storagePath,content_type:downloaded.contentType,width:input.result.width??null,height:input.result.height??null,provider:job.provider,model:input.result.model,metadata:{...((asset.metadata??{}) as Record<string,unknown>),providerJobId:job.id,providerRouteId:job.route_id},updated_at:now}).eq('id',asset.id).in('status',['generating','ready']).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','The Creator appearance could not be finalized.',500,true);
  await db.from('together_media_provider_jobs').update({status:'completed',provider_completed_at:job.provider_completed_at??now,finalized_at:now,output_storage_path:storagePath,provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),model:input.result.model,...sanitizeProviderMetadata(input.providerStatus??{})},updated_at:now}).eq('id',job.id).is('finalized_at',null);
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

async function downloadProviderOutput(url:string,mediaType:string):Promise<{bytes:Uint8Array;contentType:string}>{
  if(!isHttpsUrl(url))throw new AppError('PROVIDER_UNAVAILABLE','The media provider returned an invalid result.',503,false);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45_000);
  try{const response=await fetch(url,{signal:controller.signal,redirect:'follow'});if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','The generated media could not be collected.',503,true);const declared=Number(response.headers.get('content-length')??0),max=mediaType==='video'?MAX_VIDEO_BYTES:MAX_IMAGE_BYTES;if(declared>max)throw new AppError('PROVIDER_REQUEST_INVALID','The generated media was larger than allowed.',422,false);const bytes=new Uint8Array(await response.arrayBuffer());return{bytes,contentType:(response.headers.get('content-type')??defaultContentType(mediaType)).split(';')[0]!.toLowerCase()};}catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The generated media could not be collected yet.',503,true);}finally{clearTimeout(timeout);}
}

async function downloadProviderBinary(url:string,maxBytes:number,allowedContentTypes:string[]):Promise<{bytes:Uint8Array;contentType:string}>{
  if(!isHttpsUrl(url))throw new AppError('PROVIDER_UNAVAILABLE','The provider returned an invalid model result.',503,false);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90_000);
  try{const response=await fetch(url,{signal:controller.signal,redirect:'follow'});if(!response.ok)throw new AppError('PROVIDER_UNAVAILABLE','The trained model could not be collected.',503,true);const declared=Number(response.headers.get('content-length')??0);if(declared>maxBytes)throw new AppError('PROVIDER_REQUEST_INVALID','The trained model was larger than allowed.',422,false);const bytes=new Uint8Array(await response.arrayBuffer());if(!bytes.byteLength||bytes.byteLength>maxBytes)throw new AppError('PROVIDER_REQUEST_INVALID','The trained model was larger than allowed.',422,false);const contentType=(response.headers.get('content-type')??'application/octet-stream').split(';')[0]!.toLowerCase();if(!allowedContentTypes.includes(contentType)&&contentType!=='application/octet-stream')throw new AppError('PROVIDER_REQUEST_INVALID','The provider returned an unsupported model format.',422,false);return{bytes,contentType};}catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The trained model could not be collected yet.',503,true);}finally{clearTimeout(timeout);}
}

function validateOutput(bytes:Uint8Array,contentType:string,mediaType:string){const max=mediaType==='video'?MAX_VIDEO_BYTES:MAX_IMAGE_BYTES,allowed=mediaType==='video'?['video/mp4','video/webm']:['image/jpeg','image/png','image/webp'];if(!bytes.byteLength||bytes.byteLength>max||!allowed.includes(contentType))throw new AppError('PROVIDER_REQUEST_INVALID','The provider result did not match the expected media format.',422,false);}
function extensionFor(contentType:string,mediaType:string){if(contentType==='image/webp')return'webp';if(contentType==='image/png')return'png';if(contentType==='video/webm')return'webm';return mediaType==='video'?'mp4':'jpg';}
function defaultContentType(mediaType:string){return mediaType==='video'?'video/mp4':'image/jpeg';}
function isHttpsUrl(value:string){try{return new URL(value).protocol==='https:';}catch{return false;}}
function sanitizeProviderMetadata(value:Record<string,unknown>):Record<string,unknown>{const allowed=['status','hasNsfwContents','inferenceMs','outputCount','webhookReceivedAt'];return Object.fromEntries(allowed.filter((key)=>key in value).map((key)=>[key,value[key]]));}
