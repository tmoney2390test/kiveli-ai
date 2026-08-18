import type{SupabaseClient}from'@supabase/supabase-js';
import{canonicalRequestForMedia}from'./together-media-base.ts';
import{routeCanonicalMedia,type CanonicalMediaRequest,type ProviderCompletedMedia}from'./together-media-providers.ts';
import{resolveSubscriptionState}from'./kivelle-subscription.ts';
import{track}from'./together.ts';
import{configuredWaveSpeedClient,envBoolean}from'./wavespeed.ts';
import{AppError}from'./types.ts';
import{parseMediaQualityVerdict,type MediaQualityVerdict}from'../../../packages/together-domain/src/media-quality.ts';

export type MediaQualityGateResult={action:'accept';result:ProviderCompletedMedia}|{action:'deferred'}|{action:'reject';reasonCodes:string[]};
type MediaQualityAssessment={verdict:MediaQualityVerdict;providerRequestId?:string|undefined;providerModel?:string|undefined;providerStatus?:string|undefined;providerError?:string|undefined;errorCode?:string|undefined;inferenceMs?:number|undefined;timedOut:boolean};

const QUALITY_MODEL='wavespeed-ai/molmo2/image-qa';

export async function gateGeneratedImageQuality(db:SupabaseClient,job:Record<string,any>,media:Record<string,any>,result:ProviderCompletedMedia):Promise<MediaQualityGateResult>{
  const metadata=(media.metadata??{}) as Record<string,unknown>;
  if(job.job_type!=='image'||job.provider!=='wavespeed'||metadata.source!=='user_request'||!result.outputUrl||!envBoolean('KIVELLE_MEDIA_QUALITY_GATE_ENABLED',true))return{action:'accept',result};
  const client=configuredWaveSpeedClient();if(!client)return{action:'accept',result};
  const assessment=await assessImage(client,result.outputUrl),verdict=assessment.verdict,qualityMetadata=assessmentMetadata(assessment),providerMetadata={...((job.provider_metadata??{}) as Record<string,unknown>),...qualityMetadata};
  await db.from('together_media_provider_jobs').update({provider_metadata:providerMetadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id));
  await track(db,String(media.user_id),'media_quality_checked',compactRecord({mediaId:media.id,verdict:verdict.status,retryCount:Number(providerMetadata.qualityRetryCount??0),qaProviderRequestId:assessment.providerRequestId,qaProviderModel:assessment.providerModel,qaProviderStatus:assessment.providerStatus,qaErrorCode:assessment.errorCode,qaTimedOut:assessment.timedOut,qaInferenceMs:assessment.inferenceMs}));
  if(verdict.status!=='fail')return{action:'accept',result};

  const retryCount=Number(providerMetadata.qualityRetryCount??0);
  if(retryCount>=1)return{action:'reject',reasonCodes:verdict.reasonCodes};

  const now=new Date().toISOString();
  const{data:claimed}=await db.from('together_media_provider_jobs').update({status:'submitting',provider_metadata:{...providerMetadata,qualityRetryPreparing:true,qualityVerdict:'fail',qualityReasonCodes:verdict.reasonCodes},updated_at:now}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id)).select('*').maybeSingle();
  if(!claimed)return{action:'deferred'};

  try{
    const base=await canonicalRequestForMedia(db,media),faceQualityFailure=verdict.reasonCodes.some((reason)=>['face_distortion','face_blur','face_low_detail','face_too_small','duplicate_features'].includes(reason));
    const retryComposition=faceQualityFailure?{...base.composition,shotType:base.composition.shotType==='scene'?'candid':base.composition.shotType,aspectRatio:'4:5',framing:'fresh medium-close environmental portrait with the companion as the dominant subject; render one large, crisp, naturally proportioned face with clear eyes, nose, mouth, teeth, and skin detail'}:base.composition;
    const retryRequest={...base,mediaType:'image',composition:retryComposition,qualityRetry:{reasonCodes:verdict.reasonCodes}} as CanonicalMediaRequest;
    const subscription=await resolveSubscriptionState(db,String(media.user_id));
    const routed=routeCanonicalMedia(retryRequest,{source:'user_request',userTier:subscription.tier,preferredProvider:'wavespeed'});
    const submission=await routed.provider.submit(retryRequest,routed.route.capability);
    const nextMetadata={...providerMetadata,qualityRetryPreparing:false,qualityRetryCount:1,qualityVerdict:'fail',qualityReasonCodes:verdict.reasonCodes,rejectedProviderRequestIds:[...asStrings(providerMetadata.rejectedProviderRequestIds),String(result.providerRequestId??job.provider_request_id)],routingReason:routed.route.reasonCode};
    const{data:updatedJob,error:jobError}=await db.from('together_media_provider_jobs').update({provider_request_id:submission.providerRequestId,model:routed.route.capability.model,route_id:routed.route.capability.id,status:'processing',attempt_count:Math.min(10,Number(job.attempt_count??1)+1),submitted_at:now,provider_completed_at:null,next_poll_at:new Date(Date.now()+5_000).toISOString(),last_polled_at:null,provider_metadata:nextMetadata,updated_at:now}).eq('id',job.id).eq('status','submitting').select('id').maybeSingle();
    if(jobError||!updatedJob)throw new Error('quality_retry_job_update_failed');
    const{error:mediaError}=await db.from('together_generated_media').update({provider_request_id:submission.providerRequestId,metadata:{...metadata,providerRouteId:routed.route.capability.id,providerStatus:submission.status,qualityRetryCount:1,qualityReasonCodes:verdict.reasonCodes},updated_at:now}).eq('id',media.id).eq('status','generating');
    if(mediaError)throw new Error('quality_retry_media_update_failed');
    await track(db,String(media.user_id),'media_quality_retry_started',{mediaId:media.id,reasonCodes:verdict.reasonCodes,routeId:routed.route.capability.id});
    if(submission.status==='completed'&&submission.result)return{action:'accept',result:submission.result};
    return{action:'deferred'};
  }catch{
    return{action:'reject',reasonCodes:['quality_retry_submission_failed']};
  }
}

async function assessImage(client:NonNullable<ReturnType<typeof configuredWaveSpeedClient>>,imageUrl:string):Promise<MediaQualityAssessment>{
  try{
    const run=await client.runToCompletion(Deno.env.get('WAVESPEED_MODEL_IMAGE_QUALITY')??QUALITY_MODEL,{images:[imageUrl],text:'Quality-control this single generated companion photo. Return exactly PASS when it is suitable for delivery. Otherwise return FAIL followed only by comma-separated codes from: face_distortion, face_blur, face_low_detail, face_too_small, duplicate_features, embedded_reference, rendered_text, multiple_subjects. Fail face_too_small when the primary companion face is too small to judge or recognize in a companion photo. Fail face_low_detail when eyes, nose, mouth, teeth, or facial structure are visibly mushy, smeared, flattened, or synthetic even if not severely melted. Fail face_distortion for unnatural facial anatomy. Also fail a visible source/profile image reproduced as a collage, inset, screen, poster, frame, or held photo; visible prompt/caption/instruction text; or unintended duplicate people. Do not fail natural asymmetry, makeup, expression, pose, ordinary photographic depth of field, or differences in clothing and environment.'},30_000);
    const prediction=run.prediction,base={providerRequestId:run.providerRequestId,providerModel:run.model,providerStatus:prediction?.status??'processing',providerError:prediction?.error,inferenceMs:prediction?.inferenceMs,timedOut:run.timedOut};
    if(!prediction||prediction.status!=='completed')return{...base,verdict:{status:'unavailable',reasonCodes:[]},errorCode:run.timedOut?'provider_poll_timeout':prediction?`provider_${prediction.status}`:'provider_result_unavailable'};
    const verdict=parseMediaQualityVerdict(prediction.textOutputs?.[0]);
    return{...base,verdict,...(verdict.status==='unavailable'?{errorCode:'provider_output_invalid'}:{})};
  }catch(error){return{verdict:{status:'unavailable',reasonCodes:[]},errorCode:error instanceof AppError?error.code:'provider_unknown_error',timedOut:false};}
}

function asStrings(value:unknown):string[]{return Array.isArray(value)?value.map(String).filter(Boolean):[];}
function assessmentMetadata(assessment:MediaQualityAssessment):Record<string,unknown>{return compactRecord({qualityCheckedAt:new Date().toISOString(),qualityProviderRequestId:assessment.providerRequestId,qualityProviderModel:assessment.providerModel,qualityProviderStatus:assessment.providerStatus,qualityProviderError:assessment.providerError,qualityErrorCode:assessment.errorCode,qualityTimedOut:assessment.timedOut,qualityInferenceMs:assessment.inferenceMs});}
function compactRecord(value:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));}
