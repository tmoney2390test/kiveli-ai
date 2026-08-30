import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { kickMediaDispatcher, queueMediaRequest } from '../_shared/together-media.ts';
import { track } from '../_shared/together.ts';
import { waitUntil } from '../_shared/background.ts';
import {activeContinuity,requireInstanceInActiveContinuity}from'../_shared/together-continuity.ts';
import { resolveSubscriptionState } from '../_shared/kivelle-subscription.ts';
import { refundCredits, spendCredits } from '../_shared/kivelle-subscription.ts';
import { configuredGroupImageRouteAvailable } from '../_shared/together-media-providers.ts';
// Keep the Venice adapter in Supabase's remote bundle. The deploy graph can
// omit transitive sibling imports reached through the provider registry.
import '../_shared/venice.ts';
// Keep newly introduced video modules in Supabase's remote upload graph. The
// API bundler can omit transitive sibling imports in this large function tree.
import '../_shared/kivelle-video-routes.ts';
import { resolveMediaContentPolicy } from '../../../packages/together-domain/src/media-routing.ts';
import {acceptMediaOffer} from '../_shared/together-media-offer-acceptance.ts';
import {declineMediaOffer,listPendingMediaOffers} from '../_shared/together-media-offers.ts';
import {queueMediaEdit} from '../_shared/together-media-edit.ts';
import{synchronizedGeneratedPhotoPreferences}from'../_shared/together-photo-preferences.ts';
import{isFictionalCompanion}from'../_shared/together-media-character.ts';
import{loadValidatedMediaSubjects,normalizeMediaSubjectIds}from'../_shared/together-media-subjects.ts';
import{claimDailyPhotoAllowance,dailyPhotoReservationKey}from'../_shared/kivelle-subscription.ts';
import{assertVideoQuoteWithinCeiling,buildVideoProviderPayload,canSelectVideoRoute,configuredVideoRouteCatalog,defaultVideoRouteId,MOTION_PRESETS,resolveVideoRoute,safeVideoRouteOption,sourceVideoAspectRatio,videoCreditCost,VIDEO_DURATIONS,VIDEO_ROUTE_IDS,videoSelectorMode,type VideoDurationSeconds,type VideoMotionPreset}from'../_shared/kivelle-video-routes.ts';
import{canonicalRequestForMedia,snapshotReferenceAssets}from'../_shared/together-media-base.ts';
import{configuredWaveSpeedClient}from'../_shared/wavespeed.ts';

const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),characterInstanceId:z.string().uuid(),source:z.literal('user_request').default('user_request'),conversationId:z.string().uuid().optional(),messageId:z.string().uuid().optional(),requestText:z.string().trim().max(400).optional(),idempotencyKey:z.string().trim().min(8).max(120).optional()}),
  z.object({action:z.literal('list_pending_offers'),characterInstanceId:z.string().uuid().optional()}),
  z.object({action:z.literal('accept_offer'),offerId:z.string().uuid(),requestId:z.string().trim().min(8).max(120),paymentMethod:z.enum(['credits','daily_included']).default('credits')}),
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
  z.object({action:z.literal('video_options'),sourceMediaId:z.string().uuid()}),
  z.object({action:z.literal('video_direct_options'),characterInstanceId:z.string().uuid()}),
  z.object({action:z.literal('video_event'),sourceMediaId:z.string().uuid(),event:z.enum(['option_sheet_opened','model_selected','motion_selected']),videoRouteId:z.enum(VIDEO_ROUTE_IDS).optional(),motionPreset:z.enum(MOTION_PRESETS).optional()}).strict(),
  z.object({action:z.literal('animate'),sourceMediaId:z.string().uuid(),videoRouteId:z.string().trim().min(8).max(100),motionPreset:z.enum(MOTION_PRESETS),durationSeconds:z.number().int().refine((value)=>VIDEO_DURATIONS.includes(value as VideoDurationSeconds)),requestId:z.string().trim().min(8).max(120)}).strict(),
  z.object({action:z.literal('video_direct_generate'),characterInstanceId:z.string().uuid(),conversationId:z.string().uuid().optional(),videoRouteId:z.string().trim().min(8).max(100),motionPreset:z.enum(MOTION_PRESETS),durationSeconds:z.number().int().refine((value)=>VIDEO_DURATIONS.includes(value as VideoDurationSeconds)),aspectRatio:z.enum(['9:16','16:9']).default('9:16'),requestText:z.string().trim().min(2).max(400),requestId:z.string().trim().min(8).max(120)}).strict(),
  z.object({action:z.literal('video_feedback'),mediaId:z.string().uuid(),verdict:z.enum(['looks_good','needs_work']),reasonCodes:z.array(z.enum(['face_changed','body_or_hands_distorted','motion_unnatural','outfit_changed','background_changed','extra_person','framing_changed','took_too_long','audio_problem','other'])).max(10).default([]),otherText:z.string().trim().max(500).optional()}),
  z.object({action:z.literal('video_playback'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('video_diagnostics'),mediaId:z.string().uuid()}),
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
    const result=await acceptMediaOffer(db,{userId:user.id,offerId:input.offerId,requestId:input.requestId,paymentMethod:input.paymentMethod});
    return json({data:result,correlationId},result.state==='accepted'?202:200,correlationId);
  }
  if(input.action==='decline_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo offer is unavailable in this Kivelle Life.',404);
    const declined=await declineMediaOffer(db,{userId:user.id,offerId:input.offerId});return json({data:{offer:declined},correlationId},200,correlationId);
  }
  if(input.action==='content_preferences'){
    const{data:profile}=await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle();
    const next={...((profile?.content_preferences??{}) as Record<string,unknown>),suggestiveMediaEnabled:false,matureMediaEnabled:false,explicitMediaEnabled:false,adultVideoEnabled:false};
    const{error}=await db.from('together_profiles').update({content_preferences:next,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(error)throw new AppError('INTERNAL_ERROR','Media preferences could not be saved.',500,true);
    return json({data:{saved:true,preferences:next},correlationId},200,correlationId);
  }
  if(input.action==='video_direct_options'){
    const continuity=await activeContinuity(db,user.id);await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    if(!canSelectVideoRoute(user.id,user.email))return json({data:{available:false,selectorMode:videoSelectorMode(),sourceMode:'canonical_references',sourceAspectRatio:'9:16',routes:[],motionPresets:[],creditBalance:null},correlationId},200,correlationId);
    const draft=await directVideoDraft(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,requestText:'A natural moment grounded in the companion’s current location.'});
    await validateDirectVideoContext(db,user.id,String(continuity.id),draft.instance);
    const canonical=await canonicalRequestForMedia(db,draft.media),identityReferenceCount=canonical.referenceImages.filter((item)=>item.role==='character_identity'&&item.signedUrl).length;
    const routes=configuredVideoRouteCatalog().filter((route)=>route.enabled&&route.sourceModes.includes('canonical_references')&&route.referenceImageRequirements.canonicalCharacterMin<=identityReferenceCount).map(safeVideoRouteOption);
    const[subscription,activeQuery]=await Promise.all([resolveSubscriptionState(db,user.id),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').in('status',['queued','generating']).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
    return json({data:{available:routes.length>0,selectorMode:videoSelectorMode(),testingPriceLabel:'Price',sourceMode:'canonical_references',sourceAspectRatio:'9:16',defaultRouteId:routes[0]?.id??null,routes,motionPresets:motionPresetOptions(),creditBalance:subscription.creditBalance.total,activeVideo:Boolean(activeQuery.data),activeVideoId:activeQuery.data?.id??null,activeVideoStatus:activeQuery.data?.status??null,referenceSummary:{identity:identityReferenceCount,location:canonical.referenceImages.some((item)=>item.role==='location_environment'),locationName:canonical.context.place?.location.name??canonical.context.location?.name??null}},correlationId},200,correlationId);
  }
  if(input.action==='video_direct_generate'){
    const continuity=await activeContinuity(db,user.id);await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const requestKey=`direct-video:${input.characterInstanceId}:${input.requestId}`,{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('request_key',requestKey).maybeSingle();if(existing)return json({data:{media:existing,creditCost:Number((existing.metadata as Record<string,unknown>|null)?.creditCost??0),creditBalance:null,route:null},correlationId},existing.status==='ready'?200:202,correlationId);
    await enforceRateLimit(db,user.id,'together_video_submit',3,86400);
    const route=resolveVideoRoute(input.videoRouteId,user.id,user.email);if(!route.sourceModes.includes('canonical_references'))throw new AppError('VALIDATION_ERROR','Choose a direct-video model.',422);
    const creditCost=videoCreditCost(route,input.durationSeconds),draft=await directVideoDraft(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,requestText:input.requestText,aspectRatio:input.aspectRatio});
    await validateDirectVideoContext(db,user.id,String(continuity.id),draft.instance);
    const canonical=await canonicalRequestForMedia(db,draft.media),approvedPrompt=canonical.generationIntent?.requestText;if(!approvedPrompt)throw new AppError('FORBIDDEN','That video prompt cannot be used. Try a fictional, non-explicit scene.',403);
    const canonicalReferences=canonical.referenceImages.filter((item)=>item.signedUrl&&['character_identity','location_environment','world_environment','outfit_continuity'].includes(item.role)).map((item)=>({url:String(item.signedUrl),role:item.role as 'character_identity'|'location_environment'|'world_environment'|'outfit_continuity'}));
    const payload=buildVideoProviderPayload(route,{canonicalReferences,sourceAspectRatio:input.aspectRatio,motionPreset:input.motionPreset,durationSeconds:input.durationSeconds,userPrompt:approvedPrompt,context:{companionName:canonical.companion.name,locationName:canonical.context.place?.location.name??canonical.context.location?.name,activity:canonical.context.activity}});
    const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Video generation is not connected yet.',503);const quote=await client.quote(route.model,payload);assertVideoQuoteWithinCeiling(route,quote.amountUsd);
    const{data:reserved,error:reserveError}=await db.rpc('kivelle_reserve_direct_video_generation',{p_user_id:user.id,p_continuity_id:String(continuity.id),p_character_instance_id:input.characterInstanceId,p_conversation_id:input.conversationId??null,p_request_key:requestKey,p_route_id:route.id,p_motion_preset:input.motionPreset,p_provider:route.provider,p_model:route.model,p_credit_cost:creditCost,p_quote_usd:quote.amountUsd,p_duration_seconds:input.durationSeconds,p_resolution:route.resolution,p_audio_behavior:route.audioBehavior,p_aspect_ratio:input.aspectRatio,p_user_prompt:approvedPrompt,p_reference_assets:draft.referenceAssets,p_route_concurrency_limit:route.concurrencyLimit});if(reserveError)throw videoReservationError(reserveError);
    const mediaId=String((reserved as Record<string,unknown>)?.mediaId??''),{data:video}=await db.from('together_generated_media').select('*').eq('id',mediaId).eq('user_id',user.id).single();if(!video)throw new AppError('INTERNAL_ERROR','The direct video reservation could not be loaded.',500,true);
    waitUntil(kickMediaDispatcher());await track(db,user.id,'direct_video_generation_submitted',{mediaId:video.id,characterInstanceId:input.characterInstanceId,routeId:route.id,durationSeconds:input.durationSeconds,aspectRatio:input.aspectRatio,creditCost,quotedProviderCostUsd:quote.amountUsd,idempotent:Boolean((reserved as Record<string,unknown>)?.idempotent)});
    return json({data:{media:video,creditCost,creditBalance:Number((reserved as Record<string,unknown>)?.total??0),route:safeVideoRouteOption(route)},correlationId},202,correlationId);
  }
  if(input.action==='list_recent'){
    const continuity=await activeContinuity(db,user.id);
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const{data:conversation}=await db.from('together_conversations').select('id').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable in this Kivelle Life.',404);
    const{data:rows,error}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).eq('conversation_id',input.conversationId).in('content_level',['standard','romance']).gte('created_at',input.createdAfter).order('created_at',{ascending:false}).limit(input.limit);
    if(error)throw new AppError('INTERNAL_ERROR','Recent photos could not be loaded.',500,true);
    const media=await signMediaRows(db,rows??[]);
    return json({data:{media},correlationId},200,correlationId);
  }
  if(input.action==='batch_status'){
    const continuity=await activeContinuity(db,user.id);
    const{data:rows,error}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).in('id',input.mediaIds).in('content_level',['standard','romance']);
    if(error)throw new AppError('INTERNAL_ERROR','Photo status could not be refreshed.',500,true);
    if((rows??[]).some((row)=>row.status==='queued'||row.status==='generating'))waitUntil(kickMediaDispatcher());
    return json({data:{media:await signMediaRows(db,rows??[])},correlationId},200,correlationId);
  }
  const continuity=await activeContinuity(db,user.id),targetMediaId='sourceMediaId' in input?input.sourceMediaId:input.mediaId,{data:media}=await db.from('together_generated_media').select('*').eq('id',targetMediaId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  if(!['standard','romance'].includes(String(media.content_level??'standard'))&&input.action!=='remove')throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  if(input.action==='edit'){
    await enforceRateLimit(db,user.id,'together_media_edit',24,86400);
    const result=await queueMediaEdit(db,{userId:user.id,continuityId:String(continuity.id),sourceMedia:media,requestId:input.requestId,instruction:input.instruction});
    if(result.media.status==='queued')waitUntil(kickMediaDispatcher());
    return json({data:result,correlationId},result.media.status==='ready'?200:202,correlationId);
  }
  if(input.action==='video_options'){
    if(!canSelectVideoRoute(user.id,user.email))return json({data:{available:false,selectorMode:videoSelectorMode(),routes:[],motionPresets:[],creditBalance:null},correlationId},200,correlationId);
    await validateVideoSource(db,user.id,String(continuity.id),media);
    const canonical=await canonicalRequestForMedia(db,media),identityReferenceCount=canonical.referenceImages.filter((item)=>item.role==='character_identity'&&item.signedUrl).length;
    const routes=configuredVideoRouteCatalog().filter((route)=>route.enabled&&route.sourceModes.includes('existing_photo')&&route.referenceImageRequirements.canonicalCharacterMin<=identityReferenceCount).map(safeVideoRouteOption);
    const[subscription,activeQuery,latestQuery]=await Promise.all([resolveSubscriptionState(db,user.id),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').in('status',['queued','generating']).order('created_at',{ascending:false}).limit(1).maybeSingle(),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').eq('parent_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle()]),activeVideo=activeQuery.data,latestVideo=latestQuery.data;
    return json({data:{available:routes.length>0,selectorMode:videoSelectorMode(),testingPriceLabel:'Testing price',sourceAspectRatio:sourceVideoAspectRatio(media.width,media.height),defaultRouteId:routes.some((route)=>route.id===defaultVideoRouteId())?defaultVideoRouteId():routes[0]?.id??null,routes,motionPresets:motionPresetOptions(),creditBalance:subscription.creditBalance.total,activeVideo:Boolean(activeVideo),activeVideoId:activeVideo?.id??null,activeVideoStatus:activeVideo?.status??null,latestVideoId:latestVideo?.id??null,latestVideoStatus:latestVideo?.status??null},correlationId},200,correlationId);
  }
  if(input.action==='video_event'){
    if(!canSelectVideoRoute(user.id,user.email))throw new AppError('FORBIDDEN','Video model testing is not available for this account.',403);
    await validateVideoSource(db,user.id,String(continuity.id),media);
    if(input.event==='model_selected'){if(!input.videoRouteId)throw new AppError('VALIDATION_ERROR','A video route is required.',422);resolveVideoRoute(input.videoRouteId,user.id,user.email);}
    if(input.event==='motion_selected'&&!input.motionPreset)throw new AppError('VALIDATION_ERROR','A motion preset is required.',422);
    await track(db,user.id,`video_${input.event}`,{sourceMediaId:media.id,routeId:input.videoRouteId??null,motionPreset:input.motionPreset??null,selectorMode:videoSelectorMode()});
    return json({data:{recorded:true},correlationId},200,correlationId);
  }
  if(input.action==='animate'){
    await validateVideoSource(db,user.id,String(continuity.id),media);
    const requestKey=`animate:${media.id}:${input.requestId}`,{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('request_key',requestKey).maybeSingle();if(existing)return json({data:{media:existing,creditCost:Number((existing.metadata as Record<string,unknown>|null)?.creditCost??125),creditBalance:null,route:null},correlationId},existing.status==='ready'?200:202,correlationId);
    await enforceRateLimit(db,user.id,'together_video_submit',3,86400);
    const route=resolveVideoRoute(input.videoRouteId,user.id,user.email);if(!route.sourceModes.includes('existing_photo'))throw new AppError('VALIDATION_ERROR','Choose a model that animates an existing photo.',422);const creditCost=videoCreditCost(route,input.durationSeconds),canonical=await canonicalRequestForMedia(db,media),sourceAspectRatio=sourceVideoAspectRatio(media.width,media.height);
    const{data:sourceSigned}=await db.storage.from('together-user-media').createSignedUrl(String(media.storage_path),900);if(!sourceSigned?.signedUrl)throw new AppError('INTERNAL_ERROR','The source photo could not be prepared.',500,true);
    const canonicalReferences=canonical.referenceImages.filter((item)=>item.signedUrl&&['character_identity','location_environment','world_environment','outfit_continuity'].includes(item.role)).map((item)=>({url:String(item.signedUrl),role:item.role as 'character_identity'|'location_environment'|'world_environment'|'outfit_continuity'}));
    const payload=buildVideoProviderPayload(route,{sourceImageUrl:sourceSigned.signedUrl,canonicalReferences,sourceAspectRatio,motionPreset:input.motionPreset,durationSeconds:input.durationSeconds,context:{companionName:canonical.companion.name,locationName:canonical.context.place?.location.name??canonical.context.location?.name,activity:canonical.context.activity}});
    const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Video generation is not connected yet.',503);
    const quote=await client.quote(route.model,payload);assertVideoQuoteWithinCeiling(route,quote.amountUsd);
    await track(db,user.id,'video_generation_confirmed',{sourceMediaId:media.id,routeId:route.id,provider:route.provider,model:route.model,motionPreset:input.motionPreset,durationSeconds:input.durationSeconds,creditCost,quotedProviderCostUsd:quote.amountUsd});
    const{data:reserved,error:reserveError}=await db.rpc('kivelle_reserve_video_generation',{p_user_id:user.id,p_continuity_id:String(continuity.id),p_source_media_id:media.id,p_request_key:requestKey,p_route_id:route.id,p_motion_preset:input.motionPreset,p_provider:route.provider,p_model:route.model,p_credit_cost:creditCost,p_quote_usd:quote.amountUsd,p_duration_seconds:input.durationSeconds,p_resolution:route.resolution,p_audio_behavior:route.audioBehavior,p_aspect_ratio:sourceAspectRatio,p_testing_selection:true,p_route_concurrency_limit:route.concurrencyLimit});
    if(reserveError)throw videoReservationError(reserveError);
    const mediaId=String((reserved as Record<string,unknown>)?.mediaId??''),{data:video}=await db.from('together_generated_media').select('*').eq('id',mediaId).eq('user_id',user.id).single();if(!video)throw new AppError('INTERNAL_ERROR','The video reservation could not be loaded.',500,true);
    waitUntil(kickMediaDispatcher());
    await track(db,user.id,'video_generation_submitted',{mediaId:video.id,sourceMediaId:media.id,routeId:route.id,provider:route.provider,model:route.model,motionPreset:input.motionPreset,durationSeconds:input.durationSeconds,creditCost,quotedProviderCostUsd:quote.amountUsd,idempotent:Boolean((reserved as Record<string,unknown>)?.idempotent)});
    return json({data:{media:video,creditCost,creditBalance:Number((reserved as Record<string,unknown>)?.total??0),route:safeVideoRouteOption(route)},correlationId},202,correlationId);
  }
  if(input.action==='status'){
    if(media.status==='queued'||media.status==='generating')waitUntil(kickMediaDispatcher());
    let signedUrl:string|null=null;
    if(media.status==='ready'&&media.storage_path){const {data,error}=await db.storage.from('together-user-media').createSignedUrl(media.storage_path,3600);if(error||!data?.signedUrl)throw new AppError('INTERNAL_ERROR','The photo is ready but could not be opened yet.',503,true);signedUrl=data.signedUrl;}
    const progressState=media.media_type==='video'?await videoProgressState(db,media):undefined;
    return json({data:{media:{...media,signed_url:signedUrl},progressState},correlationId},200,correlationId);
  }
  if(input.action==='video_playback'){
    if(media.media_type!=='video'||media.status!=='ready')throw new AppError('CONFLICT','Only a completed video can be played.',409);
    await track(db,user.id,'video_playback_started',{mediaId:media.id,routeId:media.video_route_id,provider:media.provider});
    return json({data:{recorded:true},correlationId},200,correlationId);
  }
  if(input.action==='video_feedback'){
    if(media.media_type!=='video'||media.status!=='ready')throw new AppError('CONFLICT','Only a completed video can be rated.',409);
    if(input.verdict==='looks_good'&&input.reasonCodes.length)throw new AppError('VALIDATION_ERROR','A positive rating cannot include problem reasons.',422);
    if(input.verdict==='needs_work'&&!input.reasonCodes.length)throw new AppError('VALIDATION_ERROR','Choose at least one reason.',422);
    const now=new Date().toISOString(),{data:feedback,error}=await db.from('together_video_feedback').upsert({user_id:user.id,video_media_id:media.id,verdict:input.verdict,reason_codes:input.reasonCodes,other_text:input.reasonCodes.includes('other')?input.otherText??null:null,updated_at:now},{onConflict:'user_id,video_media_id'}).select('*').single();if(error||!feedback)throw new AppError('INTERNAL_ERROR','Video feedback could not be saved.',500,true);
    await track(db,user.id,'video_feedback_submitted',{mediaId:media.id,routeId:media.video_route_id,provider:media.provider,model:(media.metadata as Record<string,unknown>|null)?.providerModel??null,verdict:input.verdict,reasonCodes:input.reasonCodes});
    return json({data:{feedback},correlationId},200,correlationId);
  }
  if(input.action==='video_diagnostics'){
    if(media.media_type!=='video'||!canSelectVideoRoute(user.id,user.email))throw new AppError('NOT_FOUND','Video diagnostics are unavailable.',404);
    const[{data:job},{data:feedback}]=await Promise.all([db.from('together_media_provider_jobs').select('provider,model,route_id,provider_request_id,status,submitted_at,provider_completed_at,finalized_at,failure_code,quoted_provider_cost_usd,actual_provider_cost_usd,requested_duration_seconds,requested_resolution,requested_audio_behavior,actual_audio_behavior,source_aspect_ratio,motion_preset,created_at,updated_at').eq('generated_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),db.from('together_video_feedback').select('verdict,reason_codes,updated_at').eq('user_id',user.id).eq('video_media_id',media.id).maybeSingle()]);
    return json({data:{diagnostics:safeVideoDiagnostics(media,job,feedback)},correlationId},200,correlationId);
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
    const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=metadata,chargedForRetry:Awaited<ReturnType<typeof spendCredits>>|null=null;
    const dailyBenefit=metadata.includedBenefitType==='daily_companion_photo';
    let dailyReclaimed=false;
    if(dailyBenefit){
      const subscription=await resolveSubscriptionState(db,user.id),reservationKey=dailyPhotoReservationKey(metadata)??`offer:${String(media.media_offer_id??metadata.mediaOfferId??media.id)}`;
      const claim=await claimDailyPhotoAllowance(db,{userId:user.id,reservationKey,dailyLimit:subscription.capabilities.includedCompanionPhotoDailyLimit,tier:subscription.tier});
      dailyReclaimed=claim.claimed;
      nextMetadata={...metadata,dailyPhotoReservationKey:reservationKey,dailyPhotoBenefitReleasedAt:null,includedBenefit:dailyReclaimed,includedBenefitType:dailyReclaimed?'daily_companion_photo':null,creditCost:dailyReclaimed?0:10,creditRefunded:false,needsCredits:false};
    }
    const requiresCharge=dailyBenefit?!dailyReclaimed:metadata.includedBenefit!==true&&(media.failure_code==='insufficient_credits'||typeof metadata.creditTransactionId!=='string'||metadata.creditRefunded===true);
    if(requiresCharge){chargedForRetry=await spendCredits(db,{userId:user.id,action:'companion_photo',idempotencyKey:`media-retry:${media.id}:${Number(media.attempt_count)+1}`,referenceType:'generated_media',referenceId:media.id,metadata:{retry:true,previousFailureCode:media.failure_code}});nextMetadata={...nextMetadata,creditTransactionId:chargedForRetry.transactionId,creditCost:chargedForRetry.cost,creditRefunded:false,needsCredits:false,includedBenefit:false,includedBenefitType:null};}
    const {data:updated,error}=await db.from('together_generated_media').update({status:'queued',failure_code:null,failure_reason_safe:null,next_attempt_at:null,claimed_at:null,metadata:nextMetadata,updated_at:new Date().toISOString()}).eq('id',media.id).eq('user_id',user.id).select('*').single();
    if(error){if(chargedForRetry)await refundCredits(db,{userId:user.id,transactionId:chargedForRetry.transactionId,idempotencyKey:`refund:${chargedForRetry.transactionId}`,metadata:{reason:'media_retry_queue_failed',mediaId:media.id}});throw new AppError('INTERNAL_ERROR','The photo could not be retried.',500,true);}
    const offerId=media.media_offer_id??metadata.mediaOfferId;
    if(offerId)await db.from('together_media_offers').update({status:'accepted',failure_code:null,failure_reason_safe:null,credit_refunded:false,credit_cost:Number(nextMetadata.creditCost??0),credit_transaction_id:chargedForRetry?.transactionId??null,included_subscription_benefit:nextMetadata.includedBenefit===true,included_benefit_type:typeof nextMetadata.includedBenefitType==='string'?nextMetadata.includedBenefitType:null,updated_at:new Date().toISOString()}).eq('id',String(offerId)).eq('user_id',user.id).eq('generated_media_id',media.id).eq('status','failed');
    waitUntil(kickMediaDispatcher());
    return json({data:{media:updated},correlationId},202,correlationId);
  }
  const storagePath=media.storage_path as string|null;
  if(media.status==='queued'||media.status==='generating')throw new AppError('CONFLICT','A queued or generating video cannot be removed.',409);
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

async function validateVideoSource(db:any,userId:string,continuityId:string,media:Record<string,any>){
  if(media.media_type!=='image'||media.status!=='ready'||!media.storage_path)throw new AppError('CONFLICT','Only a ready Kivelle companion photo can be animated.',409);
  const subjectIds=normalizeMediaSubjectIds(String(media.character_instance_id),media.subject_character_instance_ids);if(subjectIds.length!==1)throw new AppError('CONFLICT','Video testing currently supports exactly one companion.',409);
  const[{data:profile},{data:instance}]=await Promise.all([db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',userId).maybeSingle(),db.from('together_character_instances').select('*,together_character_templates(age,discovery_metadata),together_character_versions(content_boundaries,visual_identity,character_bible)').eq('id',media.character_instance_id).eq('user_id',userId).eq('continuity_id',continuityId).maybeSingle()]);if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const preferences=(profile?.content_preferences??{}) as Record<string,unknown>,template=instance.together_character_templates as Record<string,unknown>,version=(instance.together_character_versions??{}) as Record<string,unknown>,level=String(media.content_level??'standard');
  if(!['standard','romance'].includes(level))throw new AppError('FORBIDDEN','Only standard and romantic images can be animated.',403);
  const boundaries=(version.content_boundaries??{}) as Record<string,unknown>,policy=resolveMediaContentPolicy({requestedLevel:level as 'standard'|'romance',source:'user_request',automatic:false,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:isFictionalCompanion(template,version),realPersonRequest:false,nonConsensualRequest:false,minorRelatedRequest:false,characterAllowsRequestedLevel:level==='standard'||boundaries.allows_romance!==false,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:false,matureMediaEnabled:false,explicitMediaEnabled:false,adultVideoEnabled:false,mediaType:'video',adultMediaFeatureEnabled:false});
  if(!policy.allowed)throw new AppError('FORBIDDEN','This photo is not eligible for video generation.',403);
  return{profile,instance,policy};
}

async function directVideoDraft(db:any,input:{userId:string;continuityId:string;characterInstanceId:string;conversationId?:string;requestText:string;aspectRatio?:'9:16'|'16:9'}){
  const{data:instance}=await db.from('together_character_instances').select('*,together_character_templates(age,discovery_metadata,name),together_character_versions(id,content_boundaries,visual_identity,character_bible)').eq('id',input.characterInstanceId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle();if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const locationId=String(instance.current_location_id??'')||null,{data:location}=locationId?await db.from('together_locations').select('id,world_id,name').eq('id',locationId).maybeSingle():{data:null};
  const versionId=String(instance.character_version_id),[characterAssets,environmentAssets]=await Promise.all([snapshotReferenceAssets(db,{characterVersionId:versionId}),snapshotReferenceAssets(db,{characterVersionIds:[versionId],locationId:locationId??undefined,worldId:location?.world_id?String(location.world_id):undefined})]);
  const identityRoles=new Set(['character_identity','character_training','outfit_continuity']),referenceCandidates:Array<Record<string,unknown>>=[...characterAssets.filter((asset)=>identityRoles.has(String(asset.role))).map((asset)=>({...asset,subjectCharacterInstanceId:input.characterInstanceId})),...environmentAssets.filter((asset)=>!identityRoles.has(String(asset.role)))],referenceAssets=referenceCandidates.filter((asset,index,all)=>all.findIndex((candidate)=>String(candidate.assetId)===String(asset.assetId))===index).slice(0,9);
  return{instance,referenceAssets,media:{id:crypto.randomUUID(),user_id:input.userId,continuity_id:input.continuityId,character_instance_id:input.characterInstanceId,subject_character_instance_ids:[input.characterInstanceId],conversation_id:input.conversationId??null,location_id:locationId,world_id:location?.world_id??null,media_type:'video',content_level:'standard',metadata:{source:'user_request',videoSourceMode:'canonical_references',locationId,activity:instance.current_activity,mood:instance.current_mood,aspectRatio:input.aspectRatio??'9:16',referenceAssets,generationIntent:{requestText:input.requestText,requestedContentLevel:'standard'}}}};
}

async function validateDirectVideoContext(db:any,userId:string,continuityId:string,instance:Record<string,any>){
  const{data:profile}=await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',userId).maybeSingle(),template=instance.together_character_templates as Record<string,unknown>,version=instance.together_character_versions as Record<string,unknown>,preferences=(profile?.content_preferences??{}) as Record<string,unknown>,boundaries=(version.content_boundaries??{}) as Record<string,unknown>;
  if(String(instance.user_id)!==userId||String(instance.continuity_id)!==continuityId)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const policy=resolveMediaContentPolicy({requestedLevel:'standard',source:'user_request',automatic:false,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:isFictionalCompanion(template,version),realPersonRequest:false,nonConsensualRequest:false,minorRelatedRequest:false,characterAllowsRequestedLevel:boundaries.allows_standard!==false,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:false,matureMediaEnabled:false,explicitMediaEnabled:false,adultVideoEnabled:false,mediaType:'video',adultMediaFeatureEnabled:false});
  if(!policy.allowed)throw new AppError('FORBIDDEN','Direct video generation is unavailable for this companion.',403);
  return{profile,instance,policy};
}

function motionPresetOptions(){return[
  {id:'subtle',displayName:'Subtle',description:'Breathing, blink, micro-expression, and nearly locked camera.'},
  {id:'playful',displayName:'Playful',description:'Brief smile or side glance with small natural movement.'},
  {id:'cinematic',displayName:'Cinematic',description:'Gentle push-in or parallax with restrained environmental motion.'},
] satisfies Array<{id:VideoMotionPreset;displayName:string;description:string}>;}

function videoReservationError(error:{message?:string;details?:string}|null){
  const message=`${error?.message??''} ${error?.details??''}`;
  if(message.includes('INSUFFICIENT_KIVELLE_CREDITS'))return new AppError('INSUFFICIENT_CREDITS','You do not have enough Kivelle Credits for this video.',402);
  if(message.includes('ACTIVE_VIDEO_EXISTS'))return new AppError('CONFLICT','Finish your active video before starting another.',409);
  if(message.includes('VIDEO_DAILY_LIMIT'))return new AppError('RATE_LIMITED','You have reached the three-video testing limit for today.',429);
  if(message.includes('VIDEO_SOURCE_NOT_READY'))return new AppError('CONFLICT','The source photo is no longer ready.',409);
  if(message.includes('VIDEO_CHARACTER_UNAVAILABLE')||message.includes('VIDEO_CONVERSATION_UNAVAILABLE'))return new AppError('NOT_FOUND','That companion conversation is unavailable.',404);
  if(message.includes('VIDEO_CONTENT_LEVEL_BLOCKED')||message.includes('VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED'))return new AppError('FORBIDDEN','This photo is not eligible for video generation.',403);
  return new AppError('INTERNAL_ERROR','The video could not be reserved safely.',500,true);
}

async function videoProgressState(db:any,media:Record<string,any>):Promise<'Queued'|'Creating video'|'Finalizing'|'Ready'|'Failed'>{
  if(media.status==='ready')return'Ready';if(media.status==='failed')return'Failed';if(media.status==='queued')return'Queued';
  const{data:job}=await db.from('together_media_provider_jobs').select('provider_completed_at,finalized_at,status').eq('generated_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  return job?.provider_completed_at&&!job?.finalized_at?'Finalizing':'Creating video';
}

function safeVideoDiagnostics(media:Record<string,any>,job:Record<string,any>|null,feedback:Record<string,any>|null){
  const at=(value:unknown)=>value?new Date(String(value)).getTime():NaN,start=at(job?.created_at),submitted=at(job?.submitted_at),completed=at(job?.provider_completed_at),finalized=at(job?.finalized_at);
  const duration=(from:number,to:number)=>Number.isFinite(from)&&Number.isFinite(to)?Math.max(0,to-from):null;
  const route=configuredVideoRouteCatalog().find((item)=>item.id===media.video_route_id);
  return{routeId:media.video_route_id,routeDisplayName:route?.displayName??null,provider:job?.provider??media.provider??null,model:job?.model??null,status:job?.status??media.status,providerRequestStatus:job?.status??null,requested:{durationSeconds:job?.requested_duration_seconds??media.requested_duration_seconds,resolution:job?.requested_resolution??media.requested_resolution,audioBehavior:job?.requested_audio_behavior??media.requested_audio_behavior,aspectRatio:job?.source_aspect_ratio??media.source_aspect_ratio,motionPreset:job?.motion_preset??media.motion_preset},actualAudioBehavior:job?.actual_audio_behavior??media.actual_audio_behavior??null,latencyMs:{queue:duration(start,submitted),generation:duration(submitted,completed),finalization:duration(completed,finalized),total:duration(start,finalized)},quotedProviderCostUsd:job?.quoted_provider_cost_usd??media.provider_quote_usd??null,actualProviderCostUsd:job?.actual_provider_cost_usd??null,failureCode:job?.failure_code??media.failure_code??null,feedback:feedback??null};
}
