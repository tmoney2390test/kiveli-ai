import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';
import {activeContinuity,requireInstanceInActiveContinuity}from'../_shared/together-continuity.ts';
import{refundCredits,resolveSubscriptionState,spendCredits}from'../_shared/kivelle-subscription.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),characterInstanceId:z.string().uuid(),source:z.enum(['user_request','life_event','date','moment','story']).default('user_request'),conversationId:z.string().uuid().optional(),messageId:z.string().uuid().optional(),lifeEventId:z.string().uuid().optional(),dateSessionId:z.string().uuid().optional(),momentId:z.string().uuid().optional(),storyArcId:z.string().uuid().optional(),requestText:z.string().trim().max(400).optional(),idempotencyKey:z.string().trim().min(8).max(120).optional()}),
  z.object({action:z.literal('retry'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('status'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('remove'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('preferences'),companionPhotos:z.boolean(),automaticPhotos:z.boolean()}),
]);

serve(async(request,correlationId)=>{
  const {user,db}=await authenticated(request);
  const input=await parseBody(request,schema);
  if(input.action==='request'){
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    await enforceRateLimit(db,user.id,'together_media_request',15,86400);
    const requestId=input.idempotencyKey??crypto.randomUUID();
    const media=await queueMediaRequest(db,{userId:user.id,characterInstanceId:input.characterInstanceId,source:input.source,conversationId:input.conversationId,messageId:input.messageId,lifeEventId:input.lifeEventId,dateSessionId:input.dateSessionId,momentId:input.momentId,storyArcId:input.storyArcId,requestText:input.requestText,idempotencyKey:requestId,force:true});
    if(!media)return json({data:{media:null},correlationId},202,correlationId);
    let returned=media,creditCost=0,creditBalance:unknown=null;
    if(input.source==='user_request'){
      const metadata=(media.metadata??{}) as Record<string,unknown>;
      if(metadata.creditTransactionId){const subscription=await resolveSubscriptionState(db,user.id);creditCost=Number(metadata.creditCost??10);creditBalance=subscription.creditBalance;}
      else{
        await resolveSubscriptionState(db,user.id);
        let charged:Awaited<ReturnType<typeof spendCredits>>|null=null;
        try{
          charged=await spendCredits(db,{userId:user.id,action:'companion_photo',idempotencyKey:`media:${media.id}:${requestId}`,referenceType:'generated_media',referenceId:media.id,metadata:{requestId,characterInstanceId:input.characterInstanceId}});
          const nextMetadata={...metadata,creditTransactionId:charged.transactionId,creditRequestId:requestId,creditCost:charged.cost,creditAction:'companion_photo',creditRefunded:false};
          const{data:updated,error}=await db.from('together_generated_media').update({metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',media.id).eq('user_id',user.id).select('*').single();if(error||!updated)throw new AppError('INTERNAL_ERROR','The photo charge could not be attached safely.',500,true);returned=updated;creditCost=charged.cost;creditBalance=charged.balance;
        }catch(error){if(charged)await refundCredits(db,{userId:user.id,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'media_queue_setup_failed',mediaId:media.id}});await db.from('together_generated_media').delete().eq('id',media.id).eq('user_id',user.id).eq('status','queued');throw error;}
      }
    }
    waitUntil(kickMediaDispatcher());
    return json({data:{media:returned,creditCost,creditBalance},correlationId},202,correlationId);
  }
  if(input.action==='preferences'){
    const {error}=await db.from('together_profiles').update({photo_preferences:{companionPhotos:input.companionPhotos,automaticPhotos:input.automaticPhotos},updated_at:new Date().toISOString()}).eq('user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','Photo preferences could not be saved.',500,true);
    return json({data:{saved:true},correlationId},200,correlationId);
  }
  const continuity=await activeContinuity(db,user.id),{data:media}=await db.from('together_generated_media').select('*').eq('id',input.mediaId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  if(input.action==='status'){
    let signedUrl:string|null=null;
    if(media.status==='ready'&&media.storage_path){const {data}=await db.storage.from('together-user-media').createSignedUrl(media.storage_path,3600);signedUrl=data?.signedUrl??null;}
    return json({data:{media:{...media,signed_url:signedUrl}},correlationId},200,correlationId);
  }
  if(input.action==='retry'){
    if(media.status!=='failed')throw new AppError('CONFLICT','Only a failed photo can be retried.',409);
    if(Number(media.attempt_count)>=3)throw new AppError('RATE_LIMITED','That photo has already been retried. Ask for a new one instead.',429);
    const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata;
    if(metadata.creditTransactionId&&metadata.creditRefunded===true){await resolveSubscriptionState(db,user.id);const charged=await spendCredits(db,{userId:user.id,action:'companion_photo',idempotencyKey:`media-retry:${media.id}:${Number(media.attempt_count)+1}`,referenceType:'generated_media',referenceId:media.id,metadata:{retry:true}});nextMetadata={...metadata,creditTransactionId:charged.transactionId,creditCost:charged.cost,creditRefunded:false};}
    const {data:updated,error}=await db.from('together_generated_media').update({status:'queued',failure_code:null,failure_reason_safe:null,next_attempt_at:null,claimed_at:null,metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',media.id).eq('user_id',user.id).select('*').single();
    if(error)throw new AppError('INTERNAL_ERROR','The photo could not be retried.',500,true);
    waitUntil(kickMediaDispatcher());
    return json({data:{media:updated},correlationId},202,correlationId);
  }
  const storagePath=media.storage_path as string|null;
  const {error:deleteError}=await db.from('together_generated_media').delete().eq('id',media.id).eq('user_id',user.id);
  if(deleteError)throw new AppError('INTERNAL_ERROR','The photo could not be removed.',500,true);
  if(storagePath){const {error:storageError}=await db.storage.from('together-user-media').remove([storagePath]);if(storageError)await db.from('together_storage_cleanup_jobs').insert({user_id:user.id,bucket_id:'together-user-media',storage_path:storagePath,status:'pending',attempt_count:1,last_error:storageError.message});}
  await track(db,user.id,'media_removed',{mediaId:media.id,characterInstanceId:media.character_instance_id});
  return json({data:{removed:true},correlationId},200,correlationId);
});
