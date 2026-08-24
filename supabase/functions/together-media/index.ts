import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';
import {activeContinuity,requireInstanceInActiveContinuity}from'../_shared/together-continuity.ts';
import { resolveSubscriptionState, spendCredits } from '../_shared/kivelle-subscription.ts';
import { refundCredits } from '../_shared/kivelle-subscription.ts';
import { configuredGroupImageRouteAvailable, configuredMediaRegistry } from '../_shared/together-media-providers.ts';
// Keep the Venice adapter in Supabase's remote bundle. The deploy graph can
// omit transitive sibling imports reached through the provider registry.
import '../_shared/venice.ts';
import { resolveMediaContentPolicy } from '../../../packages/together-domain/src/media-routing.ts';
import { envBoolean } from '../_shared/wavespeed.ts';
import {acceptMediaOffer} from '../_shared/together-media-offer-acceptance.ts';
import {declineMediaOffer,listPendingMediaOffers} from '../_shared/together-media-offers.ts';
import {queueMediaEdit} from '../_shared/together-media-edit.ts';
import{synchronizedGeneratedPhotoPreferences}from'../_shared/together-photo-preferences.ts';
import{isFictionalCompanion}from'../_shared/together-media-character.ts';
import{loadValidatedMediaSubjects,normalizeMediaSubjectIds}from'../_shared/together-media-subjects.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),characterInstanceId:z.string().uuid(),source:z.literal('user_request').default('user_request'),conversationId:z.string().uuid().optional(),messageId:z.string().uuid().optional(),requestText:z.string().trim().max(400).optional(),idempotencyKey:z.string().trim().min(8).max(120).optional()}),
  z.object({action:z.literal('list_pending_offers'),characterInstanceId:z.string().uuid().optional()}),
  z.object({action:z.literal('accept_offer'),offerId:z.string().uuid(),requestId:z.string().trim().min(8).max(120)}),
  z.object({action:z.literal('decline_offer'),offerId:z.string().uuid()}),
  z.object({action:z.literal('retry'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('status'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('batch_status'),mediaIds:z.array(z.string().uuid()).min(1).max(20).refine((ids)=>new Set(ids).size===ids.length,'Media IDs must be unique.')}),
  z.object({action:z.literal('list_recent'),characterInstanceId:z.string().uuid(),conversationId:z.string().uuid(),createdAfter:z.string().datetime(),limit:z.number().int().min(1).max(20).default(10)}),
  z.object({action:z.literal('feedback'),mediaId:z.string().uuid(),feedback:z.enum(['positive','negative'])}),
  z.object({action:z.literal('edit'),mediaId:z.string().uuid(),requestId:z.string().trim().min(8).max(120),instruction:z.string().trim().min(2).max(400)}),
  z.object({action:z.literal('remove'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('preferences'),companionPhotos:z.boolean(),automaticPhotos:z.boolean()}),
  z.object({action:z.literal('content_preferences'),suggestiveMediaEnabled:z.boolean(),matureMediaEnabled:z.boolean(),explicitMediaEnabled:z.boolean(),adultVideoEnabled:z.boolean()}),
  z.object({action:z.literal('animate'),mediaId:z.string().uuid(),requestId:z.string().trim().min(8).max(120),motionPrompt:z.string().trim().max(240).optional(),durationSeconds:z.number().int().min(3).max(10).default(5)}),
]);

serve(async(request,correlationId)=>{
  const {user,db}=await authenticated(request);
  const input=await parseBody(request,schema);
  if(input.action==='request'){
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    await enforceRateLimit(db,user.id,'together_media_request',15,86400);
    const requestId=input.idempotencyKey??crypto.randomUUID();
    const media=await queueMediaRequest(db,{userId:user.id,characterInstanceId:input.characterInstanceId,source:'user_request',conversationId:input.conversationId,messageId:input.messageId,requestText:input.requestText,idempotencyKey:requestId,force:true});
    if(media&&media.status==='queued')waitUntil(kickMediaDispatcher());
    const subscription=await resolveSubscriptionState(db,user.id);
    const metadata=(media?.metadata??{}) as Record<string,unknown>;
    return json({data:{media,creditCost:Number(metadata.creditCost??0),creditBalance:subscription?.creditBalance??null},correlationId},202,correlationId);
  }
  if(input.action==='preferences'){
    const{data:profile}=await db.from('together_profiles').select('photo_preferences,multimodal_preferences').eq('user_id',user.id).maybeSingle();
    const synced=synchronizedGeneratedPhotoPreferences(profile,input.companionPhotos);
    const {error}=await db.from('together_profiles').update({photo_preferences:{...synced.photoPreferences,automaticPhotos:input.companionPhotos&&input.automaticPhotos},multimodal_preferences:synced.multimodalPreferences,updated_at:new Date().toISOString()}).eq('user_id',user.id);
    if(error)throw new AppError('INTERNAL_ERROR','Photo preferences could not be saved.',500,true);
    return json({data:{saved:true},correlationId},200,correlationId);
  }
  if(input.action==='list_pending_offers'){
    const continuity=await activeContinuity(db,user.id);if(input.characterInstanceId)await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const offers=await listPendingMediaOffers(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId});
    return json({data:{offers},correlationId},200,correlationId);
  }
  if(input.action==='accept_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo offer is unavailable in this Kivelle Life.',404);
    const result=await acceptMediaOffer(db,{userId:user.id,offerId:input.offerId,requestId:input.requestId});
    return json({data:result,correlationId},result.state==='accepted'?202:200,correlationId);
  }
  if(input.action==='decline_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo offer is unavailable in this Kivelle Life.',404);
    const declined=await declineMediaOffer(db,{userId:user.id,offerId:input.offerId});return json({data:{offer:declined},correlationId},200,correlationId);
  }
  if(input.action==='content_preferences'){
    const{data:profile}=await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle();
    if((input.suggestiveMediaEnabled||input.matureMediaEnabled||input.explicitMediaEnabled||input.adultVideoEnabled)&&!profile?.age_verified_at)throw new AppError('FORBIDDEN','Age verification is required for higher-intensity media.',403);
    const next={...((profile?.content_preferences??{}) as Record<string,unknown>),suggestiveMediaEnabled:input.suggestiveMediaEnabled,matureMediaEnabled:input.matureMediaEnabled,explicitMediaEnabled:input.explicitMediaEnabled,adultVideoEnabled:input.adultVideoEnabled};
    const{error}=await db.from('together_profiles').update({content_preferences:next,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(error)throw new AppError('INTERNAL_ERROR','Media preferences could not be saved.',500,true);
    return json({data:{saved:true,preferences:next},correlationId},200,correlationId);
  }
  if(input.action==='list_recent'){
    const continuity=await activeContinuity(db,user.id);
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const{data:conversation}=await db.from('together_conversations').select('id').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable in this Kivelle Life.',404);
    const{data:rows,error}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).eq('conversation_id',input.conversationId).gte('created_at',input.createdAfter).order('created_at',{ascending:false}).limit(input.limit);
    if(error)throw new AppError('INTERNAL_ERROR','Recent photos could not be loaded.',500,true);
    const media=await signMediaRows(db,rows??[]);
    return json({data:{media},correlationId},200,correlationId);
  }
  if(input.action==='batch_status'){
    const continuity=await activeContinuity(db,user.id);
    const{data:rows,error}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).in('id',input.mediaIds);
    if(error)throw new AppError('INTERNAL_ERROR','Photo status could not be refreshed.',500,true);
    if((rows??[]).some((row)=>row.status==='queued'||row.status==='generating'))waitUntil(kickMediaDispatcher());
    return json({data:{media:await signMediaRows(db,rows??[])},correlationId},200,correlationId);
  }
  const continuity=await activeContinuity(db,user.id),{data:media}=await db.from('together_generated_media').select('*').eq('id',input.mediaId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  if(input.action==='edit'){
    await enforceRateLimit(db,user.id,'together_media_edit',24,86400);
    const result=await queueMediaEdit(db,{userId:user.id,continuityId:String(continuity.id),sourceMedia:media,requestId:input.requestId,instruction:input.instruction});
    if(result.media.status==='queued')waitUntil(kickMediaDispatcher());
    return json({data:result,correlationId},result.media.status==='ready'?200:202,correlationId);
  }
  if(input.action==='animate'){
    if(media.media_type!=='image'||media.status!=='ready'||!media.storage_path)throw new AppError('CONFLICT','Only a ready companion photo can be animated.',409);
    if(Array.isArray(media.subject_character_instance_ids)&&media.subject_character_instance_ids.length>1)throw new AppError('CONFLICT',"Two-person photo animation isn't available yet.",409);
    if(!envBoolean('KIVELLE_VIDEO_ENABLED')||!configuredMediaRegistry().some((route)=>route.enabled&&route.mediaTypes.includes('video')))throw new AppError('PROVIDER_NOT_CONFIGURED',"Video generation isn't connected yet.",503);
    const requestKey=`animate:${media.id}:${input.requestId}`;const{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('request_key',requestKey).maybeSingle();if(existing)return json({data:{media:existing},correlationId},existing.status==='ready'?200:202,correlationId);
    const[{data:profile},{data:instance}]=await Promise.all([db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle(),db.from('together_character_instances').select('*,together_character_templates(age,discovery_metadata),together_character_versions(content_boundaries,visual_identity,character_bible)').eq('id',media.character_instance_id).eq('user_id',user.id).maybeSingle()]);if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
    const preferences=(profile?.content_preferences??{}) as Record<string,unknown>,template=instance.together_character_templates as Record<string,unknown>,version=(instance.together_character_versions??{}) as Record<string,unknown>,level=String(media.content_level??'standard') as 'standard'|'romance'|'suggestive'|'mature'|'explicit';
    const boundaries=(version.content_boundaries??{}) as Record<string,unknown>,characterAllowsRequestedLevel=level==='standard'?true:level==='romance'?boundaries.allows_romance!==false:level==='suggestive'?boundaries.allows_suggestive===true||boundaries.allows_mature===true:level==='mature'?boundaries.allows_mature===true:boundaries.allows_explicit===true;
    const policy=resolveMediaContentPolicy({requestedLevel:level,source:'user_request',automatic:false,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:isFictionalCompanion(template,version),realPersonRequest:false,nonConsensualRequest:false,minorRelatedRequest:false,characterAllowsRequestedLevel,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:preferences.suggestiveMediaEnabled===true,matureMediaEnabled:preferences.matureMediaEnabled===true,explicitMediaEnabled:preferences.explicitMediaEnabled===true,adultVideoEnabled:preferences.adultVideoEnabled===true,mediaType:'video',adultMediaFeatureEnabled:envBoolean('KIVELLE_ADULT_MEDIA_ENABLED')});if(!policy.allowed)throw new AppError('FORBIDDEN','Your media preferences do not allow this video.',403);
    const charged=await spendCredits(db,{userId:user.id,action:'short_video',idempotencyKey:`media-video:${requestKey}`,referenceType:'generated_media',referenceId:String(media.id),metadata:{sourceMediaId:media.id,characterInstanceId:media.character_instance_id}});
    const metadata={...((media.metadata??{}) as Record<string,unknown>),source:'user_request',parentMediaId:media.id,motionPrompt:input.motionPrompt?.slice(0,240)??null,durationSeconds:input.durationSeconds,requestKey,creditTransactionId:charged.transactionId,creditCost:charged.cost,creditAction:'short_video',creditRefunded:false,generationIntent:{kind:'image_to_video',sourceMediaId:media.id}};
    const{data:video,error}=await db.from('together_generated_media').insert({user_id:user.id,continuity_id:continuity.id,character_instance_id:media.character_instance_id,subject_character_instance_ids:Array.isArray(media.subject_character_instance_ids)?media.subject_character_instance_ids:[media.character_instance_id],conversation_id:media.conversation_id,message_id:media.message_id,life_event_id:media.life_event_id,date_session_id:media.date_session_id,moment_id:media.moment_id,story_arc_id:media.story_arc_id,scene_session_id:media.scene_session_id,scene_action_id:media.scene_action_id,shared_plan_id:media.shared_plan_id,world_id:media.world_id,location_id:media.location_id,parent_media_id:media.id,media_type:'video',content_level:policy.resolvedLevel,status:'queued',request_key:requestKey,queue_priority:media.queue_priority??0,metadata}).select('*').single();if(error||!video){await refundCredits(db,{userId:user.id,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'video_queue_failed',sourceMediaId:media.id}});throw new AppError('INTERNAL_ERROR','The video could not be queued.',500,true);}waitUntil(kickMediaDispatcher());await track(db,user.id,'contextual_video_requested',{mediaId:video.id,sourceMediaId:media.id,characterInstanceId:media.character_instance_id});return json({data:{media:video,creditCost:charged.cost},correlationId},202,correlationId);
  }
  if(input.action==='status'){
    if(media.status==='queued'||media.status==='generating')waitUntil(kickMediaDispatcher());
    let signedUrl:string|null=null;
    if(media.status==='ready'&&media.storage_path){const {data,error}=await db.storage.from('together-user-media').createSignedUrl(media.storage_path,3600);if(error||!data?.signedUrl)throw new AppError('INTERNAL_ERROR','The photo is ready but could not be opened yet.',503,true);signedUrl=data.signedUrl;}
    return json({data:{media:{...media,signed_url:signedUrl}},correlationId},200,correlationId);
  }
  if(input.action==='feedback'){
    if(media.media_type!=='image'||media.status!=='ready')throw new AppError('CONFLICT','Only a completed photo can be rated.',409);
    const feedbackAt=new Date().toISOString();
    const{error}=await db.from('together_generated_media').update({user_feedback:input.feedback,user_feedback_at:feedbackAt,updated_at:feedbackAt}).eq('id',media.id).eq('user_id',user.id).eq('continuity_id',continuity.id);
    if(error)throw new AppError('INTERNAL_ERROR','Photo feedback could not be saved.',500,true);
    await track(db,user.id,'generated_media_feedback_submitted',{mediaId:media.id,characterInstanceId:media.character_instance_id,feedback:input.feedback,provider:media.provider??null});
    return json({data:{mediaId:media.id,userFeedback:input.feedback,userFeedbackAt:feedbackAt},correlationId},200,correlationId);
  }
  if(input.action==='retry'){
    if(media.status!=='failed')throw new AppError('CONFLICT','Only a failed photo can be retried.',409);
    if(Number(media.attempt_count)>=3)throw new AppError('RATE_LIMITED','That photo has already been retried. Ask for a new one instead.',429);
    const retrySubjectIds=normalizeMediaSubjectIds(String(media.character_instance_id),media.subject_character_instance_ids);
    if(retrySubjectIds.length>1&&!configuredGroupImageRouteAvailable(String(media.content_level)))throw new AppError('PROVIDER_NOT_CONFIGURED',"Two-person photos are not connected for this content level yet.",503);
    await loadValidatedMediaSubjects(db,{userId:user.id,characterInstanceId:String(media.character_instance_id),subjectCharacterInstanceIds:retrySubjectIds,conversationId:media.conversation_id??undefined});
    const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata;
    const requiresCharge=metadata.includedBenefit!==true&&(media.failure_code==='insufficient_credits'||typeof metadata.creditTransactionId!=='string'||metadata.creditRefunded===true);
    if(requiresCharge){await resolveSubscriptionState(db,user.id);const charged=await spendCredits(db,{userId:user.id,action:'companion_photo',idempotencyKey:`media-retry:${media.id}:${Number(media.attempt_count)+1}`,referenceType:'generated_media',referenceId:media.id,metadata:{retry:true,previousFailureCode:media.failure_code}});nextMetadata={...metadata,creditTransactionId:charged.transactionId,creditCost:charged.cost,creditRefunded:false,needsCredits:false};}
    const {data:updated,error}=await db.from('together_generated_media').update({status:'queued',failure_code:null,failure_reason_safe:null,next_attempt_at:null,claimed_at:null,metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',media.id).eq('user_id',user.id).select('*').single();
    if(error)throw new AppError('INTERNAL_ERROR','The photo could not be retried.',500,true);
    const offerId=media.media_offer_id??metadata.mediaOfferId;
    if(offerId)await db.from('together_media_offers').update({status:'accepted',failure_code:null,failure_reason_safe:null,credit_refunded:false,updated_at:new Date().toISOString()}).eq('id',String(offerId)).eq('user_id',user.id).eq('generated_media_id',media.id).eq('status','failed');
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

async function signMediaRows(db:any,rows:Array<Record<string,any>>){
  const paths=[...new Set(rows.filter((row)=>row.status==='ready'&&typeof row.storage_path==='string'&&row.storage_path).map((row)=>String(row.storage_path)))];
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls(paths,3600):{data:[]};
  const byPath=new Map((signed.data??[]).map((item:any)=>[String(item.path),item.signedUrl]));
  return rows.map((row)=>({...row,signed_url:row.storage_path?byPath.get(String(row.storage_path))??null:null}));
}
