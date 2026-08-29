import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
// Keep video inspection in Supabase's remote upload graph.
import '../_shared/together-video-inspection.ts';
import '../_shared/kivelle-video-routes.ts';
import { AppError } from '../_shared/types.ts';
import { readRequestText } from '../_shared/body.ts';
import { normalizeWaveSpeedWebhook, verifyWaveSpeedWebhook } from '../_shared/wavespeed.ts';
import { failProviderMedia, finalizeProviderMedia } from '../_shared/together-media-finalizer.ts';
import { finalizeAuxiliaryProviderJob } from '../_shared/together-media-auxiliary.ts';
// Explicit roots keep the signed callback's finalization graph in Supabase's
// remote bundle even when compact shared modules hide a transitive import.
import '../../../packages/together-domain/src/provider-webhook.ts';
import '../../../packages/together-domain/src/media-quality.ts';
import '../_shared/kivelle-subscription.ts';
import '../_shared/together-media-base.ts';
import '../_shared/together-media-quality.ts';
import '../_shared/together-media-providers.ts';
import '../_shared/together-place.ts';
import '../_shared/together.ts';

serve(async(request,correlationId)=>{
  if(request.method!=='POST')throw new AppError('NOT_FOUND','Not found.',404);
  const rawBody=await readRequestText(request),webhookId=request.headers.get('webhook-id'),timestamp=request.headers.get('webhook-timestamp'),signature=request.headers.get('webhook-signature');
  const valid=await verifyWaveSpeedWebhook({rawBody,webhookId,timestamp,signature,secret:serverEnv('WAVESPEED_WEBHOOK_SECRET')});
  if(!valid)throw new AppError('FORBIDDEN','Webhook signature verification failed.',403);
  let payload:unknown;try{payload=JSON.parse(rawBody);}catch{throw new AppError('VALIDATION_ERROR','Invalid webhook payload.',400);}
  const prediction=normalizeWaveSpeedWebhook(payload);if(!prediction.id)throw new AppError('VALIDATION_ERROR','The webhook is missing a provider request ID.',400);
  const db=adminClient();
  const{error:receiptError}=await db.from('together_media_provider_webhook_receipts').insert({provider:'wavespeed',webhook_id:webhookId,provider_request_id:prediction.id,metadata:{status:prediction.status}});
  const duplicate=receiptError?.code==='23505';
  if(receiptError&&!duplicate)throw new AppError('INTERNAL_ERROR','The webhook could not be recorded.',500,true);
  const{data:job}=await db.from('together_media_provider_jobs').select('*').eq('provider','wavespeed').eq('provider_request_id',prediction.id).maybeSingle();
  if(!job)return json({data:{accepted:true,matched:false,duplicate},correlationId},202,correlationId);
  await db.from('together_media_provider_webhook_receipts').update({matched_at:new Date().toISOString()}).eq('provider','wavespeed').eq('webhook_id',webhookId);
  if(prediction.status==='completed'&&prediction.outputs[0]){
    const result={outputUrl:prediction.outputs[0],providerRequestId:prediction.id,model:prediction.model,generationMs:prediction.inferenceMs};
    const providerStatus={status:prediction.status,hasNsfwContents:prediction.hasNsfwContents,inferenceMs:prediction.inferenceMs,outputCount:prediction.outputs.length,webhookReceivedAt:new Date().toISOString()};
    if(job.character_media_profile_id||job.creator_asset_id)await finalizeAuxiliaryProviderJob(db,job,result,providerStatus);
    else await finalizeProviderMedia(db,{jobId:String(job.id),result,providerStatus});
  }
  else if(['failed','cancelled','timeout','deleted'].includes(prediction.status))await failProviderMedia(db,{jobId:String(job.id),failureCode:`provider_${prediction.status}`,failureReasonSafe:'The media could not be created this time.',providerMetadata:{status:prediction.status,hasNsfwContents:prediction.hasNsfwContents}});
  else await db.from('together_media_provider_jobs').update({status:'processing',last_polled_at:new Date().toISOString(),next_poll_at:new Date(Date.now()+60_000).toISOString(),provider_metadata:{...((job.provider_metadata??{}) as Record<string,unknown>),status:prediction.status},updated_at:new Date().toISOString()}).eq('id',job.id).in('status',['submitting','processing']);
  await db.from('together_media_provider_webhook_receipts').update({processed_at:new Date().toISOString()}).eq('provider','wavespeed').eq('webhook_id',webhookId);
  return json({data:{accepted:true,matched:true,duplicate,status:prediction.status},correlationId},200,correlationId);
});
