import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaQualityVerdict } from '../../../packages/together-domain/src/media-quality.ts';
import { veniceModelCostUsd } from '../../../packages/together-domain/src/venice-media.ts';
import { refineAdultGroupFinalEdit, VENICE_GROUP_ADULT_ROUTE_ID, type CanonicalMediaRequest, type ProviderCompletedMedia } from './together-media-providers.ts';
import { configuredVeniceClient, type VeniceImageClient } from './venice.ts';
import { completeMediaUsageAttempt, recordMediaUsageAttempt } from './together-media-usage.ts';
import { resolveSubscriptionState } from './kivelle-subscription.ts';
import { track } from './together.ts';
import { AppError } from './types.ts';

const DETAIL_REASONS = new Set(['face_blur', 'face_low_detail', 'face_distortion', 'identity_mismatch', 'identity_swap', 'duplicate_features', 'anatomy_low_detail', 'non_photorealistic']);
const SAFETY_REASONS = new Set(['adult_safety_violation', 'adult_safety_unverified', 'ambiguous_age', 'sexual_content']);
const MAX_RETRY_SHARE = .25;
const MAX_AVERAGE_EXTRA_EDIT_USD = .01;

export function adultGroupDetailRetryRate(model:string,configuredRate=.25):number{
  const editCost=veniceModelCostUsd(model);
  if(editCost<=0||editCost>.05)return 0;
  return Math.max(0,Math.min(MAX_RETRY_SHARE,MAX_AVERAGE_EXTRA_EDIT_USD/editCost,Number.isFinite(configuredRate)?configuredRate:0));
}

export function shouldRetryAdultGroupDetail(input:{mediaId:string;routeId:string;pipeline:unknown;baseSourceUrl:unknown;model:string;estimatedCost:unknown;originalBytes?:Uint8Array;reasonCodes:string[];alreadyAttempted:boolean;enabled:boolean;configuredRate?:number}):boolean{
  if(!input.enabled||input.alreadyAttempted||input.routeId!==VENICE_GROUP_ADULT_ROUTE_ID||input.pipeline!=='clothed_group_identity_base_then_adult_edit')return false;
  if(typeof input.baseSourceUrl!=='string'||!input.baseSourceUrl.startsWith('https://')||!input.originalBytes?.byteLength)return false;
  if(typeof input.estimatedCost!=='number'||!Number.isFinite(input.estimatedCost)||input.estimatedCost>.12)return false;
  if(!input.reasonCodes.some((reason)=>DETAIL_REASONS.has(reason))||input.reasonCodes.some((reason)=>SAFETY_REASONS.has(reason)))return false;
  const rate=adultGroupDetailRetryRate(input.model,input.configuredRate);
  return stableBucket(input.mediaId)<Math.floor(rate*10_000);
}

export function isBetterAdultGroupDetailCandidate(first:MediaQualityVerdict,next:MediaQualityVerdict,allowWarningImprovement:boolean):boolean{
  if(next.reasonCodes.some((reason)=>SAFETY_REASONS.has(reason)))return false;
  if(next.status==='pass')return true;
  if(!allowWarningImprovement||first.status!=='fail'||next.status!=='fail')return false;
  const previous=new Set(first.reasonCodes);
  if(next.reasonCodes.some((reason)=>!previous.has(reason)))return false;
  const initialDefects=first.reasonCodes.filter((reason)=>DETAIL_REASONS.has(reason)).length;
  const remainingDefects=next.reasonCodes.filter((reason)=>DETAIL_REASONS.has(reason)).length;
  return remainingDefects<initialDefects;
}

/** A paid detail edit is optional. A provider or QA failure never discards the first candidate. */
export async function tryAdultGroupDetailRefinement(input:{db:SupabaseClient;job:Record<string,any>;media:Record<string,any>;original:ProviderCompletedMedia;request:CanonicalMediaRequest;firstVerdict:MediaQualityVerdict;providerMetadata:Record<string,unknown>;assess:(candidate:ProviderCompletedMedia)=>Promise<MediaQualityVerdict>;allowWarningImprovement?:boolean;client?:VeniceImageClient;subscriptionTier?:string;emit?:(name:string,properties:Record<string,unknown>)=>Promise<void>}):Promise<ProviderCompletedMedia|null>{
  const {db,job,media,original,request,firstVerdict}=input;
  if(firstVerdict.status!=='fail'||request.subjects?.length!==2||request.adultPipelineAuthorized!==true)return null;
  const baseSourceUrl=original.providerMetadata?.groupBaseSourceUrl;
  if(!shouldRetryAdultGroupDetail({mediaId:String(media.id),routeId:String(job.route_id),pipeline:original.providerMetadata?.pipeline,baseSourceUrl,model:original.model,estimatedCost:original.estimatedCost,originalBytes:original.bytes,reasonCodes:firstVerdict.reasonCodes,alreadyAttempted:input.providerMetadata.groupDetailRetryAttempted===true,enabled:envEnabled('KIVELLE_ADULT_GROUP_DETAIL_RETRY_ENABLED',true),configuredRate:envRate('KIVELLE_ADULT_GROUP_DETAIL_RETRY_RATE',.25)}))return null;
  const client=input.client??configuredVeniceClient(),leaseToken=job.finalization_lease_token;
  if(!client||!leaseToken||typeof baseSourceUrl!=='string')return null;
  const claimedMetadata={...input.providerMetadata,groupDetailRetryAttempted:true,groupDetailRetrySelected:false};
  const{data:claimed,error:claimError}=await db.from('together_media_provider_jobs').update({provider_metadata:claimedMetadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id)).eq('finalization_lease_token',String(leaseToken)).select('id').maybeSingle();
  if(claimError||!claimed)return null;
  Object.assign(input.providerMetadata,claimedMetadata);
  const attemptNumber=Math.max(1,Number(job.attempt_count??1))+1,model=original.model,routeId=String(job.route_id),estimatedCost=veniceModelCostUsd(model);
  let providerSucceeded=false;
  try{
    const candidate=await refineAdultGroupFinalEdit({client,request,baseSourceUrl,model,reasonCodes:firstVerdict.reasonCodes});
    providerSucceeded=true;
    const subscription=input.subscriptionTier?{tier:input.subscriptionTier}:await resolveSubscriptionState(db,String(media.user_id)).catch(()=>null);
    await recordMediaUsageAttempt(db,{job,media,subscriptionTier:subscription?.tier??'free',routeId,model,provider:'venice',attemptNumber,qualityRetry:true,generationMs:candidate.generationMs,estimatedCost:candidate.estimatedCost,attemptMetadata:{pipelineStage:'adult_group_detail_refinement',providerRequestId:candidate.providerRequestId}});
    await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber,success:true,generationMs:candidate.generationMs});
    original.estimatedCost=Number(original.estimatedCost??0)+candidate.estimatedCost;
    const next:ProviderCompletedMedia={bytes:candidate.bytes,contentType:candidate.contentType,providerRequestId:candidate.providerRequestId,model:candidate.model,estimatedCost:candidate.estimatedCost,generationMs:candidate.generationMs};
    const verdict=await input.assess(next);
    const selected=isBetterAdultGroupDetailCandidate(firstVerdict,verdict,input.allowWarningImprovement===true);
    const nextMetadata={...claimedMetadata,groupDetailRetrySelected:selected,groupDetailRetryReasonCodes:verdict.reasonCodes,groupDetailRetryProviderRequestId:candidate.providerRequestId,groupDetailRetryEstimatedCostUsd:estimatedCost,...(selected?{qualityVerdict:verdict.status,qualityReasonCodes:verdict.reasonCodes,qualityCheckedAt:new Date().toISOString()}:{})};
    const{data:updated}=await db.from('together_media_provider_jobs').update({provider_metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id)).eq('finalization_lease_token',String(leaseToken)).select('id').maybeSingle();
    if(updated)Object.assign(input.providerMetadata,nextMetadata);
    await (input.emit?.('media_group_detail_retry_completed',{mediaId:media.id,selected:Boolean(selected&&updated),firstReasonCodes:firstVerdict.reasonCodes,retryReasonCodes:verdict.reasonCodes,estimatedCostUsd:estimatedCost})??track(db,String(media.user_id),'media_group_detail_retry_completed',{mediaId:media.id,selected:Boolean(selected&&updated),firstReasonCodes:firstVerdict.reasonCodes,retryReasonCodes:verdict.reasonCodes,estimatedCostUsd:estimatedCost})).catch(()=>{});
    if(!selected||!updated)return null;
    const safeMetadata={...(original.providerMetadata??{})};delete safeMetadata.groupBaseSourceUrl;
    return{...next,estimatedCost:original.estimatedCost,generationMs:Number(original.generationMs??0)+candidate.generationMs,providerMetadata:{...safeMetadata,groupDetailRetryAttempted:true,groupDetailRetrySelected:true,groupDetailRetryEstimatedCostUsd:estimatedCost,...(verdict.status==='fail'?{qualityAcceptedWithWarnings:true,qualityWarningReasonCodes:verdict.reasonCodes}:{})}};
  }catch(error){
    const code=error instanceof AppError?error.code:'group_detail_retry_failed';
    if(!providerSucceeded){
      const subscription=input.subscriptionTier?{tier:input.subscriptionTier}:await resolveSubscriptionState(db,String(media.user_id)).catch(()=>null);
      await recordMediaUsageAttempt(db,{job,media,subscriptionTier:subscription?.tier??'free',routeId,model,provider:'venice',attemptNumber,qualityRetry:true,estimatedCost,attemptMetadata:{pipelineStage:'adult_group_detail_refinement'}});
      await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber,success:false,failureCode:code});
    }
    const failureMetadata={...claimedMetadata,groupDetailRetryErrorCode:code};
    await db.from('together_media_provider_jobs').update({provider_metadata:failureMetadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('finalization_lease_token',String(leaseToken));
    Object.assign(input.providerMetadata,failureMetadata);
    await (input.emit?.('media_group_detail_retry_failed',{mediaId:media.id,errorCode:code,estimatedCostUsd:estimatedCost})??track(db,String(media.user_id),'media_group_detail_retry_failed',{mediaId:media.id,errorCode:code,estimatedCostUsd:estimatedCost})).catch(()=>{});
    return null;
  }
}

function stableBucket(value:string):number{let hash=2166136261;for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0)%10_000;}
function envEnabled(name:string,fallback:boolean):boolean{const value=Deno.env.get(name);return value==null?fallback:['1','true','yes','on'].includes(value.toLowerCase());}
function envRate(name:string,fallback:number):number{const raw=Deno.env.get(name);if(raw==null||raw.trim()==='')return fallback;const value=Number(raw);return Number.isFinite(value)?value:fallback;}
