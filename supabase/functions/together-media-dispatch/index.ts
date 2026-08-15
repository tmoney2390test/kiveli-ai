import { z } from 'zod';
import { adminClient, serverEnv } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { canonicalRequestForMedia, kickMediaDispatcher, routeImageProvider } from '../_shared/together-media.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';

const schema=z.object({limit:z.number().int().min(1).max(10).default(3)});

serve(async(request,correlationId)=>{
  const expected=serverEnv('TOGETHER_MEDIA_DISPATCH_SECRET');
  if(request.headers.get('x-together-dispatch-secret')!==expected)throw new AppError('FORBIDDEN','Media dispatch authorization failed.',403);
  const {limit}=await parseBody(request,schema);
  const db=adminClient();
  await db.rpc('kivelle_recover_stale_media_jobs',{p_stale_minutes:12});
  const {data:jobs,error}=await db.rpc('kivelle_claim_media_jobs',{p_limit:limit});
  if(error)throw new AppError('INTERNAL_ERROR','Media jobs could not be claimed.',500,true);
  const results={claimed:(jobs??[]).length,ready:0,requeued:0,failed:0};
  for(const job of jobs??[]){
    const started=Date.now();
    try{
      await track(db,job.user_id,'media_generation_started',{mediaId:job.id,provider:job.provider,source:job.metadata?.source});
      const canonical=await canonicalRequestForMedia(db,job);
      const provider=routeImageProvider(canonical.contentLevel);
      const generated=await provider.generate(canonical);
      const extension=generated.contentType==='image/webp'?'webp':generated.contentType==='image/jpeg'?'jpg':'png';
      const storagePath=`${job.user_id}/${job.character_instance_id}/${job.id}.${extension}`;
      const {error:uploadError}=await db.storage.from('together-user-media').upload(storagePath,generated.bytes,{contentType:generated.contentType,upsert:true,cacheControl:'31536000'});
      if(uploadError)throw new AppError('INTERNAL_ERROR','The photo could not be stored.',500,true);
      const generationMs=Date.now()-started;
      const metadata={...(job.metadata??{}),model:generated.model,estimatedCost:generated.estimatedCost??null,identityReferenceCount:canonical.referenceImages.length,promptStructure:{identity:canonical.visualIdentity.canonicalDescription,location:canonical.context.location?.name,activity:canonical.context.activity,mood:canonical.context.mood,shotType:canonical.composition.shotType,aspectRatio:canonical.composition.aspectRatio,contentLevel:canonical.contentLevel}};
      const {error:updateError}=await db.from('together_generated_media').update({status:'ready',storage_path:storagePath,width:generated.width,height:generated.height,content_type:generated.contentType,byte_size:generated.bytes.byteLength,provider:provider.id,provider_request_id:generated.providerRequestId??null,generation_ms:generationMs,failure_code:null,failure_reason_safe:null,claimed_at:null,next_attempt_at:null,metadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','generating');
      if(updateError)throw new AppError('INTERNAL_ERROR','The photo status could not be saved.',500,true);
      results.ready+=1;
      await track(db,job.user_id,'media_generation_completed',{mediaId:job.id,provider:provider.id,model:generated.model,source:job.metadata?.source,contentLevel:job.content_level,shotType:job.metadata?.shotType,duration:generationMs});
    }catch(error){
      const retryable=error instanceof AppError&&error.retryable&&Number(job.attempt_count)<2;
      const safeReason=error instanceof AppError?error.message:'The photo could not be taken right now.';
      await db.from('together_generated_media').update(retryable?{status:'queued',failure_code:'provider_retryable',failure_reason_safe:safeReason,claimed_at:null,next_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{status:'failed',failure_code:error instanceof AppError?error.code:'provider_failure',failure_reason_safe:safeReason,claimed_at:null,next_attempt_at:null,generation_ms:Date.now()-started,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','generating');
      if(retryable)results.requeued+=1;else results.failed+=1;
      await track(db,job.user_id,'media_generation_failed',{mediaId:job.id,provider:job.provider,source:job.metadata?.source,retryable});
      console.error(JSON.stringify({level:'error',operation:'together_media_dispatch',mediaId:job.id,correlationId,message:error instanceof Error?error.message:'unknown_error'}));
    }
  }
  if(results.requeued>0)waitUntil(kickMediaDispatcher());
  return json({data:results,correlationId},200,correlationId);
});
