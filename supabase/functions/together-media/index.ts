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
// Supabase's remote deploy graph can otherwise omit this late direct import
// from the unusually large media bundle.
import '../_shared/web-adult-access.ts';
import '../_shared/web-billing-policy.ts';
import '../_shared/together-ai.ts';
// Keep the Venice adapter in Supabase's remote bundle. The deploy graph can
// omit transitive sibling imports reached through the provider registry.
import '../_shared/venice.ts';
// Keep newly introduced video modules in Supabase's remote upload graph. The
// API bundler can omit transitive sibling imports in this large function tree.
import '../_shared/kivelle-video-routes.ts';
import '../_shared/kivelle-video-admission.ts';
import '../_shared/kivelle-video-queue.ts';
import '../_shared/together-video-content.ts';
// Keep the private P-Video opening-frame cleanup in the remote upload graph.
import '../_shared/together-direct-video-frame.ts';
import { resolveMediaContentPolicy } from '../../../packages/together-domain/src/media-routing.ts';
import {acceptMediaOffer} from '../_shared/together-media-offer-acceptance.ts';
import {declineMediaOffer,dismissMediaOffer,listPendingMediaOffers} from '../_shared/together-media-offers.ts';
import {queueMediaEdit} from '../_shared/together-media-edit.ts';
import{synchronizedGeneratedPhotoPreferences}from'../_shared/together-photo-preferences.ts';
import{isCustomCharacterTemplate,isFictionalCompanion}from'../_shared/together-media-character.ts';
import{loadValidatedMediaSubjects,normalizeMediaSubjectIds}from'../_shared/together-media-subjects.ts';
import{claimDailyPhotoAllowance,dailyPhotoReservationKey}from'../_shared/kivelle-subscription.ts';
import{buildVideoProviderPayload,canSelectVideoRoute,configuredVideoRouteCatalog,defaultVideoPublicRouteId,MOTION_PRESETS,publicVideoRoutes,resolveVideoRoute,safeVideoRouteOption,sourceVideoAspectRatio,validateVideoSettings,videoCreditCost,videoModelPickerExposed,videoProviderBaselineCostUsd,VIDEO_RESOLUTIONS,VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT,videoSelectorMode,type VideoMotionPreset,type VideoResolution,type VideoSettings}from'../_shared/kivelle-video-routes.ts';
import{canonicalRequestForMedia,mediaPolicyMessage,snapshotReferenceAssets}from'../_shared/together-media-base.ts';
import{configuredWaveSpeedClient}from'../_shared/wavespeed.ts';
import{quoteVideoWithAdmission}from'../_shared/kivelle-video-admission.ts';
import{estimatedVideoQueueWaitSeconds,orderedVideoQueue,videoQueueProgressLabel}from'../_shared/kivelle-video-queue.ts';
import{placeContextSnapshot,resolveCharacterHomeContext,resolveCharacterPlaceContext,resolvePlaceContext,resolveWorldAccess,type PlaceContext}from'../_shared/together-place.ts';
import{cleanupDirectVideoSourceFrame}from'../_shared/together-direct-video-frame.ts';
import{resolveCompanionPresence}from'../_shared/together-schedule.ts';
import{issueAdultAssetUrl,resolveAdultAccess,type AdultAccessContext}from'../_shared/web-adult-access.ts';
import{ConfiguredModerationProvider}from'../_shared/together-ai.ts';
import{classifyPhotoIntent,classifyUserAuthoredMediaSafety,resolvePhotoComposition}from'../../../packages/together-domain/src/media.ts';
import{adultVideoFeatureEnabled,configuredVideoPromptEnhancer,directVideoOpeningFrameRequest,resolveAnimatedVideoContentLevel,resolveDirectVideoContentDecision,resolveSourcePhotoVideoDecision,type DirectVideoContentDecision}from'../_shared/together-video-content.ts';

const videoSettingsSchema=z.object({model:z.string().trim().min(3).max(100),sound:z.boolean(),resolution:z.enum(VIDEO_RESOLUTIONS),duration:z.number().int().min(1).max(20)}).strict();
const videoPromptEnhancementSchema=z.object({action:z.literal('enhance_video_prompt'),sourceMode:z.enum(['existing_photo','generated_first_frame']),sourceMediaId:z.string().uuid().optional(),characterInstanceId:z.string().uuid().optional(),conversationId:z.string().uuid().optional(),routeId:z.string().trim().min(3).max(100),settings:videoSettingsSchema,aspectRatio:z.enum(['9:16','16:9']).default('9:16'),locationSource:z.enum(['current','home','place']).default('current'),locationId:z.string().uuid().optional(),prompt:z.string().trim().min(2).max(400),requestId:z.string().trim().min(8).max(120)}).strict();
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),characterInstanceId:z.string().uuid(),source:z.literal('user_request').default('user_request'),conversationId:z.string().uuid().optional(),messageId:z.string().uuid().optional(),requestText:z.string().trim().max(400).optional(),idempotencyKey:z.string().trim().min(8).max(120).optional()}),
  z.object({action:z.literal('list_pending_offers'),characterInstanceId:z.string().uuid().optional()}),
  z.object({action:z.literal('accept_offer'),offerId:z.string().uuid(),requestId:z.string().trim().min(8).max(120),paymentMethod:z.enum(['credits','daily_included']).default('credits')}),
  z.object({action:z.literal('decline_offer'),offerId:z.string().uuid()}),
  z.object({action:z.literal('dismiss_offer'),offerId:z.string().uuid()}),
  z.object({action:z.literal('retry'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('status'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('batch_status'),mediaIds:z.array(z.string().uuid()).min(1).max(20).refine((ids)=>new Set(ids).size===ids.length,'Media IDs must be unique.')}),
  z.object({action:z.literal('list_recent'),characterInstanceId:z.string().uuid(),conversationId:z.string().uuid(),createdAfter:z.string().datetime(),limit:z.number().int().min(1).max(20).default(10)}),
  z.object({action:z.literal('list_library'),characterInstanceId:z.string().uuid().optional(),before:z.string().datetime().optional(),limit:z.number().int().min(1).max(200).default(120)}),
  z.object({action:z.literal('list_conversation_gallery'),conversationId:z.string().uuid(),limit:z.number().int().min(1).max(200).default(120)}),
  z.object({action:z.literal('feedback'),mediaId:z.string().uuid(),feedback:z.enum(['positive','negative'])}),
  z.object({action:z.literal('edit'),mediaId:z.string().uuid(),requestId:z.string().trim().min(8).max(120),instruction:z.string().trim().min(2).max(400)}),
  z.object({action:z.literal('remove'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('preferences'),companionPhotos:z.boolean(),automaticPhotos:z.boolean()}),
  z.object({action:z.literal('content_preferences'),suggestiveMediaEnabled:z.boolean(),matureMediaEnabled:z.boolean(),explicitMediaEnabled:z.boolean(),adultVideoEnabled:z.boolean()}),
  z.object({action:z.literal('video_options'),sourceMediaId:z.string().uuid()}),
  z.object({action:z.literal('video_direct_options'),characterInstanceId:z.string().uuid()}),
  z.object({action:z.literal('video_event'),sourceMediaId:z.string().uuid(),event:z.enum(['option_sheet_opened','model_selected','motion_selected']),videoRouteId:z.string().trim().min(3).max(100).optional(),motionPreset:z.enum(MOTION_PRESETS).optional()}).strict(),
  z.object({action:z.literal('animate'),sourceMediaId:z.string().uuid(),settings:videoSettingsSchema,videoRouteId:z.string().trim().min(3).max(100).optional(),motionPreset:z.enum(MOTION_PRESETS).optional(),prompt:z.string().trim().min(2).max(400).default('Continue this photo with natural motion.'),requestId:z.string().trim().min(8).max(120)}).strict(),
  z.object({action:z.literal('video_direct_generate'),characterInstanceId:z.string().uuid(),conversationId:z.string().uuid().optional(),settings:videoSettingsSchema,videoRouteId:z.string().trim().min(3).max(100).optional(),motionPreset:z.enum(MOTION_PRESETS).optional(),aspectRatio:z.enum(['9:16','16:9']).default('9:16'),locationSource:z.enum(['current','home','place']).default('current'),locationId:z.string().uuid().optional(),requestText:z.string().trim().min(2).max(400),requestId:z.string().trim().min(8).max(120)}).strict(),
  videoPromptEnhancementSchema,
  z.object({action:z.literal('video_feedback'),mediaId:z.string().uuid(),verdict:z.enum(['looks_good','needs_work']),reasonCodes:z.array(z.enum(['face_changed','body_or_hands_distorted','motion_unnatural','outfit_changed','background_changed','extra_person','framing_changed','took_too_long','audio_problem','other'])).max(10).default([]),otherText:z.string().trim().max(500).optional()}),
  z.object({action:z.literal('video_playback'),mediaId:z.string().uuid()}),
  z.object({action:z.literal('video_diagnostics'),mediaId:z.string().uuid()}),
]);
const adultInputModeration=new ConfiguredModerationProvider();
const videoPromptEnhancer=configuredVideoPromptEnhancer();

serve(async(request,correlationId)=>{
  const {user,db}=await authenticated(request);
  const adultAccess=await resolveAdultAccess(request,user,db);
  const input=await parseBody(request,schema);
  if(input.action==='request'){
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    await enforceRateLimit(db,user.id,'together_media_request',15,86400);
    await requireModeratedAdultMediaInput(input.requestText,adultAccess,{db,userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,correlationId});
    const requestId=input.idempotencyKey??crypto.randomUUID();
    const media=await queueMediaRequest(db,{userId:user.id,characterInstanceId:input.characterInstanceId,source:'user_request',conversationId:input.conversationId,messageId:input.messageId,requestText:input.requestText,idempotencyKey:requestId,force:true,adultPipelineAuthorized:adultAccess.authorized_web_adult,adultWebSessionId:adultAccess.web_session_id});
    if(media&&media.status==='queued')waitUntil(kickMediaDispatcher());
    const subscription=await resolveSubscriptionState(db,user.id);
    const metadata=(media?.metadata??{}) as Record<string,unknown>;
    const visibleMedia=media?(await signMediaRows(request,db,user.id,adultAccess,[media]))[0]??null:null;
    return json({data:{media:visibleMedia,creditCost:Number(metadata.creditCost??0),creditBalance:subscription?.creditBalance??null},correlationId},202,correlationId);
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
    const offers=await listPendingMediaOffers(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,adultPipelineAuthorized:adultAccess.authorized_web_adult});
    return json({data:{offers:offers.filter((offer)=>adultAccess.authorized_web_adult||!['suggestive','mature','explicit'].includes(String(offer.content_level)))},correlationId},200,correlationId);
  }
  if(input.action==='accept_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id,conversation_id,preview_metadata').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo offer is unavailable in this Kivelle Life.',404);
    const offerPreview=(offer.preview_metadata??{}) as Record<string,unknown>;
    await requireModeratedAdultMediaInput(typeof offerPreview.requestText==='string'?offerPreview.requestText:undefined,adultAccess,{db,userId:user.id,conversationId:offer.conversation_id??undefined,correlationId},'photo',{trustedModerationApproval:offerPreview.inputModerationApproved===true});
    const result=await acceptMediaOffer(db,{userId:user.id,offerId:input.offerId,requestId:input.requestId,paymentMethod:input.paymentMethod,adultPipelineAuthorized:adultAccess.authorized_web_adult,adultWebSessionId:adultAccess.web_session_id});
    if(result.media)result.media=(await signMediaRows(request,db,user.id,adultAccess,[result.media as Record<string,any>]))[0];
    return json({data:result,correlationId},result.state==='accepted'?202:200,correlationId);
  }
  if(input.action==='decline_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo offer is unavailable in this Kivelle Life.',404);
    const declined=await declineMediaOffer(db,{userId:user.id,offerId:input.offerId});return json({data:{offer:declined},correlationId},200,correlationId);
  }
  if(input.action==='dismiss_offer'){
    const continuity=await activeContinuity(db,user.id),{data:offer}=await db.from('together_media_offers').select('continuity_id').eq('id',input.offerId).eq('user_id',user.id).maybeSingle();
    if(!offer||String(offer.continuity_id)!==String(continuity.id))throw new AppError('NOT_FOUND','That photo request is unavailable in this Kivelle Life.',404);
    const dismissed=await dismissMediaOffer(db,{userId:user.id,offerId:input.offerId});
    return json({data:dismissed,correlationId},200,correlationId);
  }
  if(input.action==='content_preferences'){
    const{data:profile}=await db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',user.id).maybeSingle();
    const requestedAdult=input.suggestiveMediaEnabled||input.matureMediaEnabled||input.explicitMediaEnabled||input.adultVideoEnabled;
    if(requestedAdult&&!adultAccess.authorized_web_adult)throw new AppError('FORBIDDEN','Those media preferences are unavailable for this session.',403,false);
    const next={...((profile?.content_preferences??{}) as Record<string,unknown>),suggestiveMediaEnabled:adultAccess.authorized_web_adult&&input.suggestiveMediaEnabled,matureMediaEnabled:adultAccess.authorized_web_adult&&input.matureMediaEnabled,explicitMediaEnabled:adultAccess.authorized_web_adult&&input.explicitMediaEnabled,adultVideoEnabled:adultAccess.authorized_web_adult&&adultVideoFeatureEnabled()&&input.adultVideoEnabled};
    const{error}=await db.from('together_profiles').update({content_preferences:next,updated_at:new Date().toISOString()}).eq('user_id',user.id);if(error)throw new AppError('INTERNAL_ERROR','Media preferences could not be saved.',500,true);
    return json({data:{saved:true,preferences:next},correlationId},200,correlationId);
  }
  if(input.action==='enhance_video_prompt'){
    const enhanced=await enhanceVideoPromptDraft(db,{id:user.id,email:user.email},adultAccess,input,correlationId);
    return json({data:enhanced,correlationId},200,correlationId);
  }
  if(input.action==='video_direct_options'){
    const continuity=await activeContinuity(db,user.id);await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    if(!canSelectVideoRoute(user.id,user.email))return json({data:{available:false,selectorMode:videoSelectorMode(),sourceMode:'generated_first_frame',sourceAspectRatio:'9:16',routes:[],motionPresets:[],creditBalance:null},correlationId},200,correlationId);
    const draft=await directVideoDraft(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,requestText:'A natural moment grounded in the companion’s current location.'});
    await validateDirectVideoContext(db,user.id,String(continuity.id),draft.instance);
    const canonical=await canonicalRequestForMedia(db,draft.media),identityReferenceCount=canonical.referenceImages.filter((item)=>item.role==='character_identity'&&item.signedUrl).length;
    const adultVideo=adultAccess.authorized_web_adult&&adultVideoFeatureEnabled();
    const routes=publicVideoRoutes(configuredVideoRouteCatalog().filter((route)=>route.enabled&&route.sourceModes.includes('generated_first_frame')&&identityReferenceCount>0),{includeAdultCapable:adultVideo});
    const defaultRouteId=defaultVideoPublicRouteId(routes);
    const[subscription,activeQuery]=await Promise.all([resolveSubscriptionState(db,user.id),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').in('status',['queued','generating']).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
    return json({data:{available:routes.length>0,selectorMode:videoSelectorMode(),rawModelNamesExposed:videoModelPickerExposed(),testingPriceLabel:'Price',sourceMode:'generated_first_frame',sourceAspectRatio:'9:16',defaultRouteId,routes,motionPresets:motionPresetOptions(adultVideo),creditBalance:subscription.creditBalance.total,activeVideo:Boolean(activeQuery.data),activeVideoId:activeQuery.data?.id??null,activeVideoStatus:activeQuery.data?.status??null,referenceSummary:{identity:identityReferenceCount,location:Boolean(draft.place),locationName:draft.place.location.name},locationOptions:draft.locationOptions},correlationId},200,correlationId);
  }
  if(input.action==='video_direct_generate'){
    const continuity=await activeContinuity(db,user.id);await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const requestKey=`direct-video:${input.characterInstanceId}:${input.requestId}`,{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('request_key',requestKey).maybeSingle();if(existing){const visible=(await signMediaRows(request,db,user.id,adultAccess,[existing]))[0];return json({data:{media:visible,creditCost:Number((existing.metadata as Record<string,unknown>|null)?.creditCost??0),creditBalance:null,route:null},correlationId},existing.status==='ready'?200:202,correlationId);}
    await enforceVideoSubmissionAbuseLimit(db,user.id);
    const contentDecision=resolveDirectVideoContentDecision({requestText:input.requestText,authorizedWebAdult:adultAccess.authorized_web_adult,adultVideoFeatureEnabled:adultVideoFeatureEnabled()});
    if(!contentDecision.allowed)throw new AppError('FORBIDDEN',contentDecision.reasonCode==='adult_video_disabled'?'That kind of video is not available right now.':'That video request is unavailable for this session.',403,false);
    if(contentDecision.adult)await requireModeratedAdultMediaInput(input.requestText,adultAccess,{db,userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,correlationId},'video');
    const route=resolveVideoRoute(input.settings.model,user.id,user.email,{preferredContentClass:contentDecision.adult?'adult_capable':'sfw'}),settings=validateVideoSettings(route,{resolution:input.settings.resolution,duration:input.settings.duration,sound:input.settings.sound});if(!route.sourceModes.includes('generated_first_frame'))throw new AppError('VALIDATION_ERROR','Choose a direct-video model.',422);
    if(route.contentClass==='adult_capable'&&!adultAccess.authorized_web_adult)throw new AppError('FORBIDDEN','That video model is unavailable for this session.',403,false);
    if(contentDecision.adult&&route.contentClass!=='adult_capable')throw new AppError('VALIDATION_ERROR','Choose an Adult-capable video model for that request.',422,false);
    const motionPreset=input.motionPreset??'subtle',creditCost=videoCreditCost(route,settings),baselineCostUsd=videoProviderBaselineCostUsd(route,settings),draft=await directVideoDraft(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,requestText:input.requestText,contentDecision,adultWebSessionId:adultAccess.web_session_id,aspectRatio:input.aspectRatio,locationSource:input.locationSource,locationId:input.locationId});
    await validateDirectVideoContext(db,user.id,String(continuity.id),draft.instance,contentDecision,adultAccess,input.requestText);
    const canonical=await canonicalRequestForMedia(db,draft.media),approvedPrompt=canonical.generationIntent?.requestText;if(!approvedPrompt)throw new AppError('FORBIDDEN','That video prompt cannot be used. Try a fictional, non-explicit scene.',403);
    const canonicalReferences=canonical.referenceImages.filter((item)=>item.signedUrl&&['character_identity','location_environment','world_environment','outfit_continuity'].includes(item.role)).map((item)=>({url:String(item.signedUrl),role:item.role as 'character_identity'|'location_environment'|'world_environment'|'outfit_continuity'}));
    const sourceImageUrl=canonicalReferences.find((item)=>item.role==='character_identity')?.url;if(!sourceImageUrl)throw new AppError('CHARACTER_REFERENCE_REQUIRED','An approved companion reference is needed to prepare the opening frame.',409,true);
    const payload=buildVideoProviderPayload(route,{sourceImageUrl,canonicalReferences,sourceAspectRatio:input.aspectRatio,motionPreset,...settings,userPrompt:approvedPrompt,contentLevel:contentDecision.contentLevel,adultAuthorized:contentDecision.adult,anonymousAdultPartner:contentDecision.anonymousAdultPartner,context:{companionName:canonical.companion.name,locationName:draft.place.location.name,activity:canonical.context.activity}});
    const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Video generation is not connected yet.',503);const quote=await quoteVideoWithAdmission(db,client,{route,payload,sourceMode:'generated_first_frame',durationSeconds:settings.duration,resolution:settings.resolution,sound:settings.sound,aspectRatio:input.aspectRatio,referenceCount:canonicalReferences.length});
    const shotType=classifyPhotoIntent(approvedPrompt).shotPreference??(contentDecision.adult?'full_body':'candid');
    const composition=resolvePhotoComposition({source:'user_request',shotType,requestText:approvedPrompt});
    const sourceFrameRequest=directVideoOpeningFrameRequest({prompt:approvedPrompt,locationName:draft.place.location.name,contentLevel:contentDecision.contentLevel,anonymousAdultPartner:contentDecision.anonymousAdultPartner}),sourceFrameMetadata={...draft.media.metadata,source:'direct_video_frame',hiddenIntermediate:true,shotType,framing:composition.framing,aspectRatio:input.aspectRatio,generationIntent:{requestText:sourceFrameRequest,requestedContentLevel:contentDecision.contentLevel},videoTargetRequestKey:requestKey};
    const{data:reserved,error:reserveError}=await db.rpc('kivelle_reserve_direct_video_generation_v5',{p_user_id:user.id,p_continuity_id:String(continuity.id),p_character_instance_id:input.characterInstanceId,p_conversation_id:input.conversationId??null,p_request_key:requestKey,p_source_frame_request_key:`${requestKey}:frame`,p_route_id:route.id,p_motion_preset:motionPreset,p_provider:route.provider,p_model:route.model,p_requested_model:route.model,p_resolved_model:route.model,p_credit_cost:creditCost,p_quote_usd:quote.amountUsd,p_baseline_usd:baselineCostUsd,p_duration_seconds:settings.duration,p_resolution:settings.resolution,p_audio_behavior:settings.sound?'generated_audio':'silent',p_sound_requested:settings.sound,p_provider_audio_mode:route.audioMode,p_aspect_ratio:input.aspectRatio,p_user_prompt:approvedPrompt,p_content_level:contentDecision.contentLevel,p_adult_authorized:contentDecision.adult,p_adult_web_session_id:contentDecision.adult?adultAccess.web_session_id:null,p_anonymous_adult_partner:contentDecision.anonymousAdultPartner,p_reference_assets:draft.referenceAssets,p_route_concurrency_limit:route.concurrencyLimit,p_location_id:draft.locationId,p_world_id:draft.worldId,p_place_context:placeContextSnapshot(draft.place),p_source_frame_metadata:sourceFrameMetadata});if(reserveError)throw videoReservationError(reserveError);
    const mediaId=String((reserved as Record<string,unknown>)?.mediaId??''),{data:video}=await db.from('together_generated_media').select('*').eq('id',mediaId).eq('user_id',user.id).single();if(!video)throw new AppError('INTERNAL_ERROR','The direct video reservation could not be loaded.',500,true);
    waitUntil(kickMediaDispatcher());await track(db,user.id,'direct_video_generation_submitted',{mediaId:video.id,characterInstanceId:input.characterInstanceId,requestedModel:route.model,resolvedModel:route.model,routeId:route.id,durationSeconds:settings.duration,resolution:settings.resolution,soundRequested:settings.sound,aspectRatio:input.aspectRatio,locationSource:input.locationSource,locationId:draft.locationId,worldId:draft.worldId,providerAudioMode:route.audioMode,creditCost,estimatedProviderCostUsd:baselineCostUsd,quotedProviderCostUsd:quote.amountUsd,quoteCacheHit:quote.cacheHit,idempotent:Boolean((reserved as Record<string,unknown>)?.idempotent)});
    const visibleVideo=(await signMediaRows(request,db,user.id,adultAccess,[video]))[0];
    return json({data:{media:visibleVideo,creditCost,creditBalance:Number((reserved as Record<string,unknown>)?.total??0),route:safeVideoRouteOption(route)},correlationId},202,correlationId);
  }
  if(input.action==='list_recent'){
    const continuity=await activeContinuity(db,user.id);
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    const{data:conversation}=await db.from('together_conversations').select('id').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable in this Kivelle Life.',404);
    let mediaQuery=db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('character_instance_id',input.characterInstanceId).eq('conversation_id',input.conversationId).gte('created_at',input.createdAfter);
    if(!adultAccess.authorized_web_adult)mediaQuery=mediaQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
    const{data:rows,error}=await mediaQuery.order('created_at',{ascending:false}).limit(Math.min(25,input.limit+5));
    if(error)throw new AppError('INTERNAL_ERROR','Recent photos could not be loaded.',500,true);
    const media=await signMediaRows(request,db,user.id,adultAccess,(rows??[]).filter((row)=>row.metadata?.hiddenIntermediate!==true).slice(0,input.limit));
    return json({data:{media},correlationId},200,correlationId);
  }
  if(input.action==='list_library'){
    const continuity=await activeContinuity(db,user.id);
    if(input.characterInstanceId)await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    let mediaQuery=db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).in('media_type',['image','video']).in('status',['queued','generating','ready']);
    if(input.characterInstanceId)mediaQuery=mediaQuery.eq('character_instance_id',input.characterInstanceId);
    if(input.before)mediaQuery=mediaQuery.lt('created_at',input.before);
    if(!adultAccess.authorized_web_adult)mediaQuery=mediaQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
    const fetchLimit=Math.min(240,input.limit+25),{data:rows,error}=await mediaQuery.order('created_at',{ascending:false}).limit(fetchLimit);
    if(error)throw new AppError('INTERNAL_ERROR','Your media library could not be loaded.',500,true);
    const visibleRows=(rows??[]).filter((row)=>row.metadata?.hiddenIntermediate!==true),page=visibleRows.slice(0,input.limit),posterRows=await loadVideoPosterRows(db,user.id,String(continuity.id),page,adultAccess),media=await signMediaRows(request,db,user.id,adultAccess,[...page,...posterRows]);
    return json({data:{media,hasMore:visibleRows.length>input.limit||Number(rows?.length??0)===fetchLimit,nextBefore:page.at(-1)?.created_at??null},correlationId},200,correlationId);
  }
  if(input.action==='list_conversation_gallery'){
    const continuity=await activeContinuity(db,user.id),{data:conversation}=await db.from('together_conversations').select('id').eq('id',input.conversationId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable in this Kivelle Life.',404);
    let mediaQuery=db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('conversation_id',input.conversationId).in('media_type',['image','video']).in('status',['queued','generating','ready']);
    let attachmentQuery=db.from('together_conversation_attachments').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).eq('conversation_id',input.conversationId).in('kind',['image','video']).eq('upload_status','uploaded').is('storage_deleted_at',null);
    if(!adultAccess.authorized_web_adult){mediaQuery=mediaQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);attachmentQuery=attachmentQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);}
    const fetchLimit=Math.min(240,input.limit+25),[mediaResult,attachmentResult]=await Promise.all([mediaQuery.order('created_at',{ascending:false}).limit(fetchLimit),attachmentQuery.order('created_at',{ascending:false}).limit(fetchLimit)]);
    if(mediaResult.error||attachmentResult.error)throw new AppError('INTERNAL_ERROR','Conversation media could not be loaded.',500,true);
    const mediaRows=(mediaResult.data??[]).filter((row)=>row.metadata?.hiddenIntermediate!==true).slice(0,input.limit),posterRows=await loadVideoPosterRows(db,user.id,String(continuity.id),mediaRows,adultAccess),media=await signMediaRows(request,db,user.id,adultAccess,[...mediaRows,...posterRows]);
    const attachments=await signGalleryAttachments(request,db,user.id,adultAccess,(attachmentResult.data??[]).slice(0,input.limit));
    return json({data:{media,attachments,hasMore:Number(mediaResult.data?.length??0)>input.limit||Number(attachmentResult.data?.length??0)>input.limit},correlationId},200,correlationId);
  }
  if(input.action==='batch_status'){
    const continuity=await activeContinuity(db,user.id);
    let batchQuery=db.from('together_generated_media').select('*').eq('user_id',user.id).eq('continuity_id',continuity.id).in('id',input.mediaIds);
    if(!adultAccess.authorized_web_adult)batchQuery=batchQuery.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
    const{data:rows,error}=await batchQuery;
    if(error)throw new AppError('INTERNAL_ERROR','Photo status could not be refreshed.',500,true);
    if((rows??[]).some((row)=>row.status==='queued'||row.status==='generating'))waitUntil(kickMediaDispatcher());
    return json({data:{media:await signMediaRows(request,db,user.id,adultAccess,rows??[])},correlationId},200,correlationId);
  }
  const continuity=await activeContinuity(db,user.id),targetMediaId='sourceMediaId' in input?input.sourceMediaId:input.mediaId,{data:media}=await db.from('together_generated_media').select('*').eq('id',targetMediaId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
  if(!media)throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  const restricted=media.visibility_scope!=='all'||!['safe','suggestive'].includes(String(media.content_rating??''));
  if(restricted&&!adultAccess.authorized_web_adult&&input.action!=='remove')throw new AppError('NOT_FOUND','That photo is unavailable.',404);
  if(input.action==='edit'){
    await requireModeratedAdultMediaInput(input.instruction,adultAccess,{db,userId:user.id,characterInstanceId:String(media.character_instance_id),conversationId:media.conversation_id??undefined,correlationId});
    await enforceRateLimit(db,user.id,'together_media_edit',24,86400);
    const result=await queueMediaEdit(db,{userId:user.id,continuityId:String(continuity.id),sourceMedia:media,requestId:input.requestId,instruction:input.instruction,adultPipelineAuthorized:adultAccess.authorized_web_adult,adultWebSessionId:adultAccess.web_session_id});
    if(result.media.status==='queued')waitUntil(kickMediaDispatcher());
    result.media=(await signMediaRows(request,db,user.id,adultAccess,[result.media as Record<string,any>]))[0]??result.media;
    return json({data:result,correlationId},result.media.status==='ready'?200:202,correlationId);
  }
  if(input.action==='video_options'){
    if(!canSelectVideoRoute(user.id,user.email))return json({data:{available:false,selectorMode:videoSelectorMode(),routes:[],motionPresets:[],creditBalance:null},correlationId},200,correlationId);
    const sourceDecision=await validateVideoSource(db,user.id,String(continuity.id),media,adultAccess);
    const canonical=await canonicalRequestForMedia(db,media),identityReferenceCount=canonical.referenceImages.filter((item)=>item.role==='character_identity'&&item.signedUrl).length;
    const adultRoutesAvailable=adultAccess.authorized_web_adult&&adultVideoFeatureEnabled(),routes=publicVideoRoutes(configuredVideoRouteCatalog().filter((route)=>route.enabled&&route.sourceModes.includes('existing_photo')&&(sourceDecision.adult?route.contentClass==='adult_capable':route.contentClass==='sfw'||adultRoutesAvailable&&route.contentClass==='adult_capable')&&route.referenceImageRequirements.canonicalCharacterMin<=identityReferenceCount),{includeAdultCapable:adultRoutesAvailable});
    const[subscription,activeQuery,latestQuery]=await Promise.all([resolveSubscriptionState(db,user.id),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').in('status',['queued','generating']).order('created_at',{ascending:false}).limit(1).maybeSingle(),db.from('together_generated_media').select('id,status').eq('user_id',user.id).eq('media_type','video').eq('parent_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle()]),activeVideo=activeQuery.data,latestVideo=latestQuery.data;
    return json({data:{available:routes.length>0,selectorMode:videoSelectorMode(),rawModelNamesExposed:videoModelPickerExposed(),testingPriceLabel:'Testing price',sourceContentClass:sourceDecision.contentClass,sourceAspectRatio:sourceVideoAspectRatio(media.width,media.height),defaultRouteId:defaultVideoPublicRouteId(routes),routes,motionPresets:motionPresetOptions(),creditBalance:subscription.creditBalance.total,activeVideo:Boolean(activeVideo),activeVideoId:activeVideo?.id??null,activeVideoStatus:activeVideo?.status??null,latestVideoId:latestVideo?.id??null,latestVideoStatus:latestVideo?.status??null},correlationId},200,correlationId);
  }
  if(input.action==='video_event'){
    if(!canSelectVideoRoute(user.id,user.email))throw new AppError('FORBIDDEN','Video model testing is not available for this account.',403);
    const sourceDecision=await validateVideoSource(db,user.id,String(continuity.id),media,adultAccess);
    if(input.event==='model_selected'){if(!input.videoRouteId)throw new AppError('VALIDATION_ERROR','A video route is required.',422);const selected=resolveVideoRoute(input.videoRouteId,user.id,user.email),compatible=sourceDecision.adult?selected.contentClass==='adult_capable':selected.contentClass==='sfw'||selected.contentClass==='adult_capable'&&adultAccess.authorized_web_adult&&adultVideoFeatureEnabled();if(!compatible)throw new AppError('FORBIDDEN','That video model is not compatible with this photo or session.',403,false);}
    if(input.event==='motion_selected'&&!input.motionPreset)throw new AppError('VALIDATION_ERROR','A motion preset is required.',422);
    await track(db,user.id,`video_${input.event}`,{sourceMediaId:media.id,routeId:input.videoRouteId??null,motionPreset:input.motionPreset??null,selectorMode:videoSelectorMode()});
    return json({data:{recorded:true},correlationId},200,correlationId);
  }
  if(input.action==='animate'){
    const sourceDecision=await validateVideoSource(db,user.id,String(continuity.id),media,adultAccess);
    const requestKey=`animate:${media.id}:${input.requestId}`,{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',user.id).eq('request_key',requestKey).maybeSingle();if(existing){const visible=(await signMediaRows(request,db,user.id,adultAccess,[existing]))[0];return json({data:{media:visible,creditCost:Number((existing.metadata as Record<string,unknown>|null)?.creditCost??125),creditBalance:null,route:null},correlationId},existing.status==='ready'?200:202,correlationId);}
    await enforceVideoSubmissionAbuseLimit(db,user.id);
    const promptDecision=resolveDirectVideoContentDecision({requestText:input.prompt,authorizedWebAdult:adultAccess.authorized_web_adult,adultVideoFeatureEnabled:adultVideoFeatureEnabled()});
    if(!promptDecision.allowed)throw new AppError('FORBIDDEN',promptDecision.reasonCode==='adult_video_disabled'?'That kind of video is not available right now.':'That video request is unavailable for this session.',403,false);
    if(promptDecision.adult)await requireModeratedAdultMediaInput(input.prompt,adultAccess,{db,userId:user.id,characterInstanceId:String(media.character_instance_id),conversationId:media.conversation_id?String(media.conversation_id):undefined,correlationId},'video');
    const outputContentLevel=resolveAnimatedVideoContentLevel(sourceDecision.contentLevel,promptDecision.contentLevel),outputAdult=['suggestive','mature','explicit'].includes(outputContentLevel),sourceMetadata=(media.metadata??{}) as Record<string,unknown>,anonymousAdultPartner=sourceMetadata.anonymousAdultPartner===true||promptDecision.anonymousAdultPartner;
    const outputDecision:DirectVideoContentDecision={...promptDecision,contentLevel:outputContentLevel,adult:outputAdult,anonymousAdultPartner};
    await validateDirectVideoContext(db,user.id,String(continuity.id),sourceDecision.instance,outputDecision,adultAccess,input.prompt);
    const route=resolveVideoRoute(input.settings.model,user.id,user.email),settings=validateVideoSettings(route,{resolution:input.settings.resolution,duration:input.settings.duration,sound:input.settings.sound}),routeUsesAdultEndpoint=route.contentClass==='adult_capable',routeCompatible=outputAdult?routeUsesAdultEndpoint:route.contentClass==='sfw'||routeUsesAdultEndpoint&&adultAccess.authorized_web_adult&&adultVideoFeatureEnabled();if(!route.sourceModes.includes('existing_photo')||!routeCompatible)throw new AppError('VALIDATION_ERROR',outputAdult?'Choose an Adult-capable model for this photo and prompt.':'Choose a video model available for this session.',422);const motionPreset=input.motionPreset??'subtle',creditCost=videoCreditCost(route,settings),baselineCostUsd=videoProviderBaselineCostUsd(route,settings),canonical=await canonicalRequestForMedia(db,media),sourceAspectRatio=sourceVideoAspectRatio(media.width,media.height);
    const{data:sourceSigned}=await db.storage.from('together-user-media').createSignedUrl(String(media.storage_path),900);if(!sourceSigned?.signedUrl)throw new AppError('INTERNAL_ERROR','The source photo could not be prepared.',500,true);
    const canonicalReferences=canonical.referenceImages.filter((item)=>item.signedUrl&&['character_identity','location_environment','world_environment','outfit_continuity'].includes(item.role)).map((item)=>({url:String(item.signedUrl),role:item.role as 'character_identity'|'location_environment'|'world_environment'|'outfit_continuity'}));
    const payload=buildVideoProviderPayload(route,{sourceImageUrl:sourceSigned.signedUrl,canonicalReferences,sourceAspectRatio,motionPreset,...settings,userPrompt:input.prompt,contentLevel:outputContentLevel,adultAuthorized:outputAdult,anonymousAdultPartner,context:{companionName:canonical.companion.name,locationName:canonical.context.place?.location.name??canonical.context.location?.name,activity:canonical.context.activity}});
    const client=configuredWaveSpeedClient();if(!client)throw new AppError('PROVIDER_NOT_CONFIGURED','Video generation is not connected yet.',503);
    const quote=await quoteVideoWithAdmission(db,client,{route,payload,sourceMode:'existing_photo',durationSeconds:settings.duration,resolution:settings.resolution,sound:settings.sound,aspectRatio:sourceAspectRatio,referenceCount:canonicalReferences.length+1});
    await track(db,user.id,'video_generation_confirmed',{sourceMediaId:media.id,routeId:route.id,provider:route.provider,requestedModel:route.model,resolvedModel:route.model,motionProfile:'prompt_driven',durationSeconds:settings.duration,resolution:settings.resolution,soundRequested:settings.sound,contentLevel:outputContentLevel,creditCost,estimatedProviderCostUsd:baselineCostUsd,quotedProviderCostUsd:quote.amountUsd});
    const{data:reserved,error:reserveError}=await db.rpc('kivelle_reserve_video_generation_v7',{p_user_id:user.id,p_continuity_id:String(continuity.id),p_source_media_id:media.id,p_request_key:requestKey,p_route_id:route.id,p_motion_preset:motionPreset,p_provider:route.provider,p_model:route.model,p_requested_model:route.model,p_resolved_model:route.model,p_credit_cost:creditCost,p_quote_usd:quote.amountUsd,p_baseline_usd:baselineCostUsd,p_duration_seconds:settings.duration,p_resolution:settings.resolution,p_audio_behavior:settings.sound?'generated_audio':'silent',p_sound_requested:settings.sound,p_provider_audio_mode:route.audioMode,p_aspect_ratio:sourceAspectRatio,p_user_prompt:input.prompt,p_content_level:outputContentLevel,p_anonymous_adult_partner:anonymousAdultPartner,p_testing_selection:true,p_route_concurrency_limit:route.concurrencyLimit,p_adult_authorized:routeUsesAdultEndpoint,p_adult_web_session_id:routeUsesAdultEndpoint?adultAccess.web_session_id:null});
    if(reserveError)throw videoReservationError(reserveError);
    const mediaId=String((reserved as Record<string,unknown>)?.mediaId??''),{data:video}=await db.from('together_generated_media').select('*').eq('id',mediaId).eq('user_id',user.id).single();if(!video)throw new AppError('INTERNAL_ERROR','The video reservation could not be loaded.',500,true);
    waitUntil(kickMediaDispatcher());
    await track(db,user.id,'video_generation_submitted',{mediaId:video.id,sourceMediaId:media.id,routeId:route.id,provider:route.provider,requestedModel:route.model,resolvedModel:route.model,motionProfile:'prompt_driven',durationSeconds:settings.duration,resolution:settings.resolution,soundRequested:settings.sound,creditCost,estimatedProviderCostUsd:baselineCostUsd,quotedProviderCostUsd:quote.amountUsd,quoteCacheHit:quote.cacheHit,idempotent:Boolean((reserved as Record<string,unknown>)?.idempotent)});
    const visibleVideo=(await signMediaRows(request,db,user.id,adultAccess,[video]))[0];
    return json({data:{media:visibleVideo,creditCost,creditBalance:Number((reserved as Record<string,unknown>)?.total??0),route:safeVideoRouteOption(route)},correlationId},202,correlationId);
  }
  if(input.action==='status'){
    if(media.status==='queued'||media.status==='generating')waitUntil(kickMediaDispatcher());
    let signedUrl:string|null=null;
    if(!restricted&&media.status==='ready'&&media.storage_path){const {data,error}=await db.storage.from('together-user-media').createSignedUrl(media.storage_path,3600);if(error||!data?.signedUrl)throw new AppError('INTERNAL_ERROR','The photo is ready but could not be opened yet.',503,true);signedUrl=data.signedUrl;}
    const progressState=media.media_type==='video'?await videoProgressState(db,media):undefined;
    if(restricted&&media.status==='ready')signedUrl=await issueAdultAssetUrl({request,db,access:adultAccess,userId:user.id,generatedMediaId:String(media.id)});
    return json({data:{media:sanitizeMediaRow(media,signedUrl,adultAccess.authorized_web_adult),progressState},correlationId},200,correlationId);
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
    const[{data:job},{data:feedback}]=await Promise.all([db.from('together_media_provider_jobs').select('provider,model,requested_model,resolved_model,route_id,provider_request_id,status,submitted_at,provider_completed_at,finalized_at,failure_code,quoted_provider_cost_usd,actual_provider_cost_usd,requested_duration_seconds,requested_resolution,requested_audio_behavior,sound_requested,provider_audio_mode,audio_stream_detected,audio_stripped,final_sound_present,actual_audio_behavior,retry_count,source_aspect_ratio,motion_preset,created_at,updated_at').eq('generated_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),db.from('together_video_feedback').select('verdict,reason_codes,updated_at').eq('user_id',user.id).eq('video_media_id',media.id).maybeSingle()]);
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
    const metadata=(media.metadata??{}) as Record<string,unknown>;let nextMetadata=restricted?{...metadata,adultAuthorized:true,adultWebSessionId:adultAccess.web_session_id,moderationVersion:'web-adult-v1'}:metadata,chargedForRetry:Awaited<ReturnType<typeof spendCredits>>|null=null;
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
    const visible=(await signMediaRows(request,db,user.id,adultAccess,[updated]))[0]??updated;
    return json({data:{media:visible},correlationId},202,correlationId);
  }
  const storagePath=media.storage_path as string|null;
  if(media.status==='queued'||media.status==='generating')throw new AppError('CONFLICT','A queued or generating video cannot be removed.',409);
  if(media.media_type==='video')await cleanupDirectVideoSourceFrame(db,media);
  const {error:deleteError}=await db.from('together_generated_media').delete().eq('id',media.id).eq('user_id',user.id);
  if(deleteError)throw new AppError('INTERNAL_ERROR','The photo could not be removed.',500,true);
  if(storagePath){const {error:storageError}=await db.storage.from('together-user-media').remove([storagePath]);if(storageError)await db.from('together_storage_cleanup_jobs').insert({user_id:user.id,bucket_id:'together-user-media',storage_path:storagePath,status:'pending',attempt_count:1,last_error:storageError.message});}
  await track(db,user.id,'media_removed',{mediaId:media.id,characterInstanceId:media.character_instance_id});
  return json({data:{removed:true},correlationId},200,correlationId);
});

async function signMediaRows(request:Request,db:any,userId:string,access:AdultAccessContext,rows:Array<Record<string,any>>){
  rows=rows.filter((row)=>row.metadata?.hiddenIntermediate!==true||row.metadata?.galleryPosterOnly===true);
  const ordinary=rows.filter((row)=>row.visibility_scope==='all'&&['safe','suggestive'].includes(String(row.content_rating??''))),paths=[...new Set(ordinary.filter((row)=>row.status==='ready'&&typeof row.storage_path==='string'&&row.storage_path).map((row)=>String(row.storage_path)))];
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls(paths,3600):{data:[]};
  const byPath=new Map<string,string>((signed.data??[]).flatMap((item:any)=>typeof item.path==='string'&&typeof item.signedUrl==='string'?[[item.path,item.signedUrl] as [string,string]]:[]));
  return Promise.all(rows.map(async(row)=>{const restricted=row.visibility_scope!=='all'||!['safe','suggestive'].includes(String(row.content_rating??''));const signedUrl=restricted&&row.status==='ready'&&access.authorized_web_adult?await issueAdultAssetUrl({request,db,access,userId,generatedMediaId:String(row.id)}):row.storage_path?byPath.get(String(row.storage_path))??null:null;return sanitizeMediaRow(row,signedUrl,access.authorized_web_adult);}));
}

function sanitizeMediaRow(row:Record<string,any>,signedUrl:string|null,authorizedWebAdult:boolean):Record<string,any>{const safe:Record<string,any>={...row,signed_url:signedUrl};delete safe.storage_path;const restricted=row.visibility_scope!=='all'||!['safe','suggestive'].includes(String(row.content_rating??''));if(restricted&&!authorizedWebAdult){delete safe.metadata;delete safe.canonical_text;}else if(!authorizedWebAdult&&safe.metadata&&typeof safe.metadata==='object'){const metadata={...safe.metadata};for(const key of['generationIntent','editInstruction','requestHint','referenceAssets','providerPrompt','prompt'])delete metadata[key];safe.metadata=metadata;}return safe;}

async function requireModeratedAdultMediaInput(text:string|undefined,access:AdultAccessContext,scope:{db:any;userId:string;characterInstanceId?:string;conversationId?:string;correlationId:string},mediaKind:'photo'|'video'='photo',options:{trustedModerationApproval?:boolean}={}){
  // Every user-authored image direction in an authorized adult website session is
  // independently moderated. Do not rely on the request classifier to decide
  // whether moderation is necessary: euphemistic or obfuscated prohibited
  // requests may otherwise be misclassified as ordinary SFW generation.
  if(!text||!access.authorized_web_adult)return;
  const requestedLevel=classifyPhotoIntent(text).requestedContentLevel;
  if(scope.conversationId&&['suggestive','mature','explicit'].includes(String(requestedLevel??''))){
    const[{data:conversation},{data:profile}]=await Promise.all([
      scope.db.from('together_conversations').select('metadata').eq('id',scope.conversationId).eq('user_id',scope.userId).maybeSingle(),
      scope.db.from('together_profiles').select('content_preferences').eq('user_id',scope.userId).maybeSingle(),
    ]);
    const chatPreferences=conversation?.metadata?.chatPreferences&&typeof conversation.metadata.chatPreferences==='object'?conversation.metadata.chatPreferences as Record<string,unknown>:{};
    const profilePreferences=(profile?.content_preferences??{}) as Record<string,unknown>;
    if(String(chatPreferences.contentMode??profilePreferences.contentMode??'mature')!=='explicit')throw new AppError('FORBIDDEN',`Set this chat to Explicit before requesting an adult ${mediaKind}.`,403,false);
  }
  // Dialogue-created offers already passed this exact provider-backed input
  // moderation before their server-only row was inserted. Rechecking the chat
  // mode and session above is still required, but repeating the remote
  // classifier when the user taps Accept only adds latency.
  if(options.trustedModerationApproval)return;
  const result=await adultInputModeration.check(text,{...scope,metadata:{direction:'input',pipeline:'adult_media'}});
  const safety=classifyUserAuthoredMediaSafety({text,requestedContentLevel:requestedLevel,moderation:result});
  if(!safety.allowed||result.categories.includes('moderation/unavailable'))throw new AppError('FORBIDDEN',`That ${mediaKind} request cannot be processed safely right now.`,403,false);
}

async function validateVideoSource(db:any,userId:string,continuityId:string,media:Record<string,any>,access:AdultAccessContext){
  if(media.media_type!=='image'||media.status!=='ready'||!media.storage_path)throw new AppError('CONFLICT','Only a ready Kivelle companion photo can be animated.',409);
  const sourceDecision=resolveSourcePhotoVideoDecision({contentLevel:media.content_level,contentRating:media.content_rating,visibilityScope:media.visibility_scope,authorizedWebAdult:access.authorized_web_adult,adultVideoFeatureEnabled:adultVideoFeatureEnabled()});
  if(!sourceDecision.allowed){
    const unavailable=sourceDecision.reasonCode==='adult_video_disabled'?'Adult-capable video is not available right now.':sourceDecision.reasonCode==='web_adult_authorization_required'?'This photo can only be animated in its authorized adult website session.':'This photo has an inconsistent content policy and cannot be animated safely.';
    throw new AppError('FORBIDDEN',unavailable,403,false);
  }
  const subjectIds=normalizeMediaSubjectIds(String(media.character_instance_id),media.subject_character_instance_ids);if(subjectIds.length!==1)throw new AppError('CONFLICT','Video testing currently supports exactly one companion.',409);
  const[{data:profile},{data:instance}]=await Promise.all([db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',userId).maybeSingle(),db.from('together_character_instances').select('*,together_character_templates(age,discovery_metadata,creator_id),together_character_versions(content_boundaries,visual_identity,character_bible)').eq('id',media.character_instance_id).eq('user_id',userId).eq('continuity_id',continuityId).maybeSingle()]);if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const preferences=(profile?.content_preferences??{}) as Record<string,unknown>,template=instance.together_character_templates as Record<string,unknown>,version=(instance.together_character_versions??{}) as Record<string,unknown>,level=sourceDecision.contentLevel,boundaries=(version.content_boundaries??{}) as Record<string,unknown>,characterAllows=level==='standard'||level==='romance'&&boundaries.allows_romance!==false||level==='suggestive'&&(boundaries.allows_suggestive===true||boundaries.allows_mature===true)||level==='mature'&&boundaries.allows_mature===true||level==='explicit'&&boundaries.allows_explicit===true;
  const policy=resolveMediaContentPolicy({requestedLevel:level,source:'user_request',automatic:false,ageVerified:sourceDecision.adult?Boolean(access.adult_eligible):Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:isFictionalCompanion(template,version),realPersonRequest:false,nonConsensualRequest:false,minorRelatedRequest:false,characterAllowsRequestedLevel:characterAllows,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:sourceDecision.adult,matureMediaEnabled:sourceDecision.adult,explicitMediaEnabled:sourceDecision.adult,adultVideoEnabled:sourceDecision.adult&&adultVideoFeatureEnabled(),mediaType:'video',adultMediaFeatureEnabled:sourceDecision.adult&&adultVideoFeatureEnabled(),adultPipelineAuthorized:sourceDecision.adult&&access.authorized_web_adult});
  if(!policy.allowed)throw new AppError('FORBIDDEN','This photo is not eligible for video generation.',403);
  return{profile,instance,policy,...sourceDecision};
}

async function loadVideoPosterRows(db:any,userId:string,continuityId:string,rows:Array<Record<string,any>>,access:AdultAccessContext):Promise<Array<Record<string,any>>>{
  const rowIds=new Set(rows.map((row)=>String(row.id))),parentIds=[...new Set(rows.filter((row)=>row.media_type==='video'&&typeof row.parent_media_id==='string').map((row)=>String(row.parent_media_id)).filter((id)=>!rowIds.has(id)))];
  if(!parentIds.length)return[];
  let query=db.from('together_generated_media').select('*').eq('user_id',userId).eq('continuity_id',continuityId).in('id',parentIds).eq('media_type','image').eq('status','ready');
  if(!access.authorized_web_adult)query=query.eq('visibility_scope','all').in('content_rating',['safe','suggestive']);
  const{data,error}=await query;if(error)return[];
  return(data??[]).map((row:Record<string,any>)=>({...row,metadata:{...((row.metadata??{}) as Record<string,unknown>),galleryPosterOnly:true}}));
}

async function signGalleryAttachments(request:Request,db:any,userId:string,access:AdultAccessContext,rows:Array<Record<string,any>>):Promise<Array<Record<string,any>>>{
  const safeRows=rows.filter((row)=>row.visibility_scope==='all'&&['safe','suggestive'].includes(String(row.content_rating??''))),paths=[...new Set(safeRows.filter((row)=>typeof row.storage_path==='string'&&row.storage_path).map((row)=>String(row.storage_path)))];
  const signed=paths.length?await db.storage.from('together-user-media').createSignedUrls(paths,900):{data:[]},byPath=new Map<string,string>((signed.data??[]).flatMap((item:any)=>typeof item.path==='string'&&typeof item.signedUrl==='string'?[[item.path,item.signedUrl] as [string,string]]:[]));
  return Promise.all(rows.map(async(row)=>{
    const restricted=row.visibility_scope!=='all'||!['safe','suggestive'].includes(String(row.content_rating??''));
    if(restricted&&!access.authorized_web_adult)return null;
    const signedUrl=restricted?await issueAdultAssetUrl({request,db,access,userId,attachmentId:String(row.id)}):typeof row.storage_path==='string'?byPath.get(String(row.storage_path))??null:null,safe:Record<string,any>={...row,signed_url:signedUrl};
    delete safe.storage_path;delete safe.analysis_metadata;delete safe.safe_variant_key;
    return safe;
  })).then((items)=>items.filter(Boolean) as Array<Record<string,any>>);
}

type DirectVideoLocationSource='current'|'home'|'place';
type DirectVideoLocationOption={source:DirectVideoLocationSource;locationId:string|null;name:string;detail:string|null;worldId:string;worldName:string};

async function directVideoDraft(db:any,input:{userId:string;continuityId:string;characterInstanceId:string;conversationId?:string;requestText:string;contentDecision?:DirectVideoContentDecision;adultWebSessionId?:string|null;aspectRatio?:'9:16'|'16:9';locationSource?:DirectVideoLocationSource;locationId?:string}){
  const{data:instance}=await db.from('together_character_instances').select('*,together_character_templates(age,discovery_metadata,name,creator_id),together_character_versions(id,content_boundaries,visual_identity,character_bible)').eq('id',input.characterInstanceId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle();if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const locations=await directVideoLocations(db,input.userId,instance),source=input.locationSource??'current';
  let place:PlaceContext;
  if(source==='current')place=locations.currentPlace;
  else if(source==='home'){
    if(!locations.homePlace)throw new AppError('NOT_FOUND','This companion does not have an available home setting.',404);
    place=locations.homePlace;
  }else{
    if(!input.locationId)throw new AppError('VALIDATION_ERROR','Choose a place for this video.',422);
    const{data:selected}=await db.from('together_locations').select('id,world_id,location_type').eq('id',input.locationId).maybeSingle();
    if(!selected||String(selected.world_id)!==locations.worldId||['district','residence'].includes(String(selected.location_type)))throw new AppError('FORBIDDEN','Choose a public place in this companion’s current world.',403);
    const access=await resolveWorldAccess({db,userId:input.userId,worldId:locations.worldId});if(access==='locked'||access==='available')throw new AppError('FORBIDDEN','That world is not available for video generation.',403);
    place=await resolvePlaceContext({db,locationId:String(selected.id),userId:input.userId,characterInstanceId:input.characterInstanceId});
  }
  const locationId=place.location.virtualType==='character_home'?null:place.location.id,worldId=place.world.id,versionId=String(instance.character_version_id),[characterAssets,environmentAssets]=await Promise.all([snapshotReferenceAssets(db,{characterVersionId:versionId}),snapshotReferenceAssets(db,{characterVersionIds:[versionId],locationId:locationId??undefined,worldId})]);
  const identityRoles=new Set(['character_identity','character_training','outfit_continuity']),referenceCandidates:Array<Record<string,unknown>>=[...characterAssets.filter((asset)=>identityRoles.has(String(asset.role))).map((asset)=>({...asset,subjectCharacterInstanceId:input.characterInstanceId})),...environmentAssets.filter((asset)=>!identityRoles.has(String(asset.role)))],referenceAssets=referenceCandidates.filter((asset,index,all)=>all.findIndex((candidate)=>String(candidate.assetId)===String(asset.assetId))===index).slice(0,9);
  const decision=input.contentDecision??{contentLevel:'standard',adult:false,anonymousAdultPartner:false,allowed:true,reasonCode:'allowed'} as DirectVideoContentDecision;
  return{instance,place,locationId,worldId,referenceAssets,locationOptions:locations.options,media:{id:crypto.randomUUID(),user_id:input.userId,continuity_id:input.continuityId,character_instance_id:input.characterInstanceId,subject_character_instance_ids:[input.characterInstanceId],conversation_id:input.conversationId??null,location_id:locationId,world_id:worldId,media_type:'video',content_level:decision.contentLevel,content_rating:decision.adult?'explicit':decision.contentLevel==='romance'?'suggestive':'safe',visibility_scope:decision.adult?'web_adult':'all',metadata:{source:'user_request',videoSourceMode:'generated_first_frame',locationSource:source,locationId,activity:source==='current'?locations.currentActivity:`At ${place.location.name}`,mood:instance.current_mood,aspectRatio:input.aspectRatio??'9:16',placeContext:placeContextSnapshot(place),referenceAssets,generationIntent:{requestText:input.requestText,requestedContentLevel:decision.contentLevel},customCharacter:isCustomCharacterTemplate(instance.together_character_templates),...(decision.adult?{adultAuthorized:true,adultWebSessionId:input.adultWebSessionId,moderationVersion:'web-adult-video-v1'}:{}),...(decision.anonymousAdultPartner?{anonymousAdultPartner:true,expectedAdultSubjectCount:2}:{})}}};
}

async function directVideoLocations(db:any,userId:string,instance:Record<string,any>){
  const characterVersionId=String(instance.character_version_id),currentLocationId=String(instance.current_location_id??'')||null;
  const[presence,homePlace]=await Promise.all([
    resolveCompanionPresence({db,userId,characterInstanceId:String(instance.id),ensure:false}),
    resolveCharacterHomeContext({db,characterVersionId,userId}),
  ]);
  const currentPlace=presence?.placeContext??await resolveCharacterPlaceContext({db,characterVersionId,locationId:currentLocationId,activity:String(instance.current_activity??''),userId,characterInstanceId:String(instance.id)});
  const resolvedCurrent=currentPlace??homePlace;if(!resolvedCurrent)throw new AppError('NOT_FOUND','This companion does not have an available video location.',404);
  const worldId=resolvedCurrent.world.id,worldName=resolvedCurrent.world.name,access=await resolveWorldAccess({db,userId,worldId});if(access==='locked'||access==='available')throw new AppError('FORBIDDEN','This companion’s current world is not available.',403);
  const{data:rows,error}=await db.from('together_locations').select('id,world_id,name,category,location_type,parent_location_id,sort_order').eq('world_id',worldId).not('location_type','in','(district,residence)').order('sort_order').order('name').limit(120);if(error)throw new AppError('INTERNAL_ERROR','Video places could not be loaded.',500,true);
  const option=(source:DirectVideoLocationSource,place:PlaceContext):DirectVideoLocationOption=>({source,locationId:place.location.virtualType==='character_home'?null:place.location.id,name:place.location.name,detail:place.path,worldId:place.world.id,worldName:place.world.name});
  const current=option('current',resolvedCurrent),home=homePlace?option('home',homePlace):null,places:DirectVideoLocationOption[]=(rows??[]).map((row:Record<string,unknown>)=>({source:'place',locationId:String(row.id),name:String(row.name),detail:String(row.category??'Place'),worldId,worldName}));
  return{currentPlace:resolvedCurrent,currentActivity:presence?.activity??String(instance.current_activity??`At ${resolvedCurrent.location.name}`),homePlace,worldId,worldName,options:{defaultSource:'current' as const,worldId,worldName,current,home,places}};
}

async function enhanceVideoPromptDraft(db:any,user:{id:string;email?:string|null},access:AdultAccessContext,input:z.infer<typeof videoPromptEnhancementSchema>,correlationId:string){
  if(!videoPromptEnhancer)throw new AppError('PROVIDER_NOT_CONFIGURED','Prompt enhancement is not available right now. Your original is unchanged.',503,true);
  await enforceRateLimit(db,user.id,'together_video_prompt_enhance',30,3600,'Prompt enhancement is busy. Try again in a moment.');
  const continuity=await activeContinuity(db,user.id),route=resolveVideoRoute(input.routeId,user.id,user.email),settings=validateVideoSettings(route,{resolution:input.settings.resolution,duration:input.settings.duration,sound:input.settings.sound});
  if(route.contentClass==='adult_capable'&&!access.authorized_web_adult)throw new AppError('FORBIDDEN','That video model is unavailable for this session.',403,false);
  const promptDecision=resolveDirectVideoContentDecision({requestText:input.prompt,authorizedWebAdult:access.authorized_web_adult,adultVideoFeatureEnabled:adultVideoFeatureEnabled()});
  if(!promptDecision.allowed)throw new AppError('FORBIDDEN',promptDecision.reasonCode==='adult_video_disabled'?'That kind of video is not available right now.':'That video direction is unavailable for this session.',403,false);
  if(promptDecision.adult){
    if(route.contentClass!=='adult_capable')throw new AppError('VALIDATION_ERROR','Choose an Adult-capable video model before enhancing that direction.',422,false);
    await requireModeratedAdultMediaInput(input.prompt,access,{db,userId:user.id,characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,correlationId},'video');
  }
  let characterName='',locationName:string|null=null,activity:string|null=null,contentLevel=promptDecision.contentLevel,instance:Record<string,any>|null=null;
  if(input.sourceMode==='existing_photo'){
    if(!input.sourceMediaId)throw new AppError('VALIDATION_ERROR','Choose a source photo before enhancing the video direction.',422);
    const{data:media}=await db.from('together_generated_media').select('*').eq('id',input.sourceMediaId).eq('user_id',user.id).eq('continuity_id',continuity.id).maybeSingle();
    if(!media)throw new AppError('NOT_FOUND','That photo is unavailable.',404);
    const sourceDecision=await validateVideoSource(db,user.id,String(continuity.id),media,access);
    contentLevel=resolveAnimatedVideoContentLevel(sourceDecision.contentLevel,promptDecision.contentLevel);instance=sourceDecision.instance;
    if(!instance)throw new AppError('NOT_FOUND','That photo is no longer linked to an available companion.',404);
    const outputAdult=['suggestive','mature','explicit'].includes(contentLevel),compatible=outputAdult?route.contentClass==='adult_capable':route.contentClass==='sfw'||route.contentClass==='adult_capable'&&access.authorized_web_adult&&adultVideoFeatureEnabled();
    if(!route.sourceModes.includes('existing_photo')||!compatible)throw new AppError('VALIDATION_ERROR',outputAdult?'Choose an Adult-capable model for this photo and direction.':'Choose a model that can animate this photo.',422,false);
    const outputDecision:DirectVideoContentDecision={...promptDecision,contentLevel,adult:outputAdult};await validateDirectVideoContext(db,user.id,String(continuity.id),instance,outputDecision,access,input.prompt);
    const canonical=await canonicalRequestForMedia(db,media);characterName=canonical.companion.name;locationName=canonical.context.place?.location.name??canonical.context.location?.name??null;activity=canonical.context.activity??null;
  }else{
    if(!input.characterInstanceId)throw new AppError('VALIDATION_ERROR','Choose a companion before enhancing the video direction.',422);
    await requireInstanceInActiveContinuity(db,user.id,input.characterInstanceId);
    if(!route.sourceModes.includes('generated_first_frame'))throw new AppError('VALIDATION_ERROR','Choose a direct-video model before enhancing that direction.',422);
    const draft=await directVideoDraft(db,{userId:user.id,continuityId:String(continuity.id),characterInstanceId:input.characterInstanceId,conversationId:input.conversationId,requestText:input.prompt,contentDecision:promptDecision,adultWebSessionId:access.web_session_id,aspectRatio:input.aspectRatio,locationSource:input.locationSource,locationId:input.locationId});
    instance=draft.instance;
    if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
    await validateDirectVideoContext(db,user.id,String(continuity.id),instance,promptDecision,access,input.prompt);
    characterName=String((instance.together_character_templates as Record<string,unknown>)?.name??'the companion');locationName=draft.place.location.name;activity=String(instance.current_activity??'')||null;
  }
  const result=await videoPromptEnhancer.enhance({prompt:input.prompt,characterName,locationName,activity,routeName:route.displayName,duration:settings.duration,resolution:settings.resolution,sound:settings.sound,aspectRatio:input.aspectRatio,contentLevel});
  const enhancedDecision=resolveDirectVideoContentDecision({requestText:result.prompt,authorizedWebAdult:access.authorized_web_adult,adultVideoFeatureEnabled:adultVideoFeatureEnabled()});
  if(!enhancedDecision.allowed||contentLevelRank(enhancedDecision.contentLevel)>contentLevelRank(contentLevel))throw new AppError('VALIDATION_ERROR','The enhanced prompt changed the request too much. Your original is unchanged.',422,false);
  if(enhancedDecision.adult)await requireModeratedAdultMediaInput(result.prompt,access,{db,userId:user.id,characterInstanceId:String(instance?.id??input.characterInstanceId??''),conversationId:input.conversationId,correlationId},'video');
  await track(db,user.id,'video_prompt_enhanced',{routeId:route.id,sourceMode:input.sourceMode,contentLevel,originalLength:input.prompt.length,enhancedLength:result.prompt.length,enhancementVersion:result.version,enhancementModel:result.model,latencyMs:result.latencyMs});
  return{prompt:result.prompt,version:result.version,originalLength:input.prompt.length,enhancedLength:result.prompt.length};
}

function contentLevelRank(value:string):number{return({standard:0,romance:1,suggestive:2,mature:3,explicit:4} as Record<string,number>)[value]??5;}

async function validateDirectVideoContext(db:any,userId:string,continuityId:string,instance:Record<string,any>,decision:DirectVideoContentDecision={contentLevel:'standard',adult:false,anonymousAdultPartner:false,allowed:true,reasonCode:'allowed'},access?:AdultAccessContext,requestText=''){
  const{data:profile}=await db.from('together_profiles').select('age_verified_at,adult_eligible_at,content_preferences').eq('user_id',userId).maybeSingle(),template=instance.together_character_templates as Record<string,unknown>,version=instance.together_character_versions as Record<string,unknown>,preferences=(profile?.content_preferences??{}) as Record<string,unknown>,boundaries=(version.content_boundaries??{}) as Record<string,unknown>;
  if(String(instance.user_id)!==userId||String(instance.continuity_id)!==continuityId)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  const characterAllows=decision.contentLevel==='standard'?boundaries.allows_standard!==false:decision.contentLevel==='romance'?boundaries.allows_romance!==false:decision.contentLevel==='suggestive'?boundaries.allows_suggestive===true||boundaries.allows_mature===true:decision.contentLevel==='mature'?boundaries.allows_mature===true:boundaries.allows_explicit===true;
  const prohibited=/\b(?:incest|mother|father|mom|dad|sister|brother|daughter|son|aunt|uncle|cousin|bestiality|zoophilia|animal sex|rape|sexual violence|forced sex|without consent|unconscious|drugged|traffick(?:ing|ed)?|sex slave|escort|prostitut(?:e|ion)|pay(?:ing)? for sex|sugar (?:baby|daddy)|barely legal|teen(?:ager)?|schoolgirl|schoolboy|young girl|young boy)\b/i.test(requestText);
  const policy=resolveMediaContentPolicy({requestedLevel:decision.contentLevel,source:'user_request',automatic:false,ageVerified:decision.adult?Boolean(access?.authorized_web_adult&&profile?.adult_eligible_at):Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:isFictionalCompanion(template,version),realPersonRequest:/\b(?:celebrity|public figure|real person|looks? exactly like|deepfake)\b/i.test(requestText),nonConsensualRequest:prohibited,minorRelatedRequest:/\b(?:minor|underage|child|teen(?:ager)?|barely legal|schoolgirl|schoolboy|young girl|young boy|(?:[0-9]|1[0-7])[- ]?year[- ]?old)\b/i.test(requestText),characterAllowsRequestedLevel:characterAllows,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:access?.authorized_web_adult===true,matureMediaEnabled:access?.authorized_web_adult===true,explicitMediaEnabled:access?.authorized_web_adult===true,adultVideoEnabled:access?.authorized_web_adult===true&&adultVideoFeatureEnabled(),mediaType:'video',adultMediaFeatureEnabled:adultVideoFeatureEnabled(),adultPipelineAuthorized:access?.authorized_web_adult===true});
  if(!policy.allowed)throw new AppError('FORBIDDEN',mediaPolicyMessage(policy.reasonCode),403,false);
  return{profile,instance,policy};
}

function motionPresetOptions(adult=false){return adult?[
  {id:'subtle',displayName:'Subtle',description:'Breathing and small intimate motion while keeping the approved pose and anatomy.'},
  {id:'playful',displayName:'Playful',description:'Teasing hip and body movement with the same adult pose and visible anatomy.'},
  {id:'cinematic',displayName:'Intimate',description:'Continuous anatomically correct sexual motion from the opening frame.'},
]:[
  {id:'subtle',displayName:'Subtle',description:'Breathing, blink, micro-expression, and nearly locked camera.'},
  {id:'playful',displayName:'Playful',description:'Brief smile or side glance with small natural movement.'},
  {id:'cinematic',displayName:'Cinematic',description:'Gentle push-in or parallax with restrained environmental motion.'},
] satisfies Array<{id:VideoMotionPreset;displayName:string;description:string}>;}

function enforceVideoSubmissionAbuseLimit(db:any,userId:string){const policy=VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT;return enforceRateLimit(db,userId,policy.action,policy.limit,policy.windowSeconds,policy.message);}

function videoReservationError(error:{message?:string;details?:string}|null){
  const message=`${error?.message??''} ${error?.details??''}`;
  if(message.includes('INSUFFICIENT_KIVELLE_CREDITS'))return new AppError('INSUFFICIENT_CREDITS','You do not have enough Kivelle Credits for this video.',402);
  if(message.includes('ACTIVE_VIDEO_EXISTS'))return new AppError('CONFLICT','Finish your active video before starting another.',409);
  if(message.includes('VIDEO_DAILY_LIMIT'))return new AppError('RATE_LIMITED','You have reached the three-video testing limit for today.',429);
  if(message.includes('VIDEO_SOURCE_NOT_READY'))return new AppError('CONFLICT','The source photo is no longer ready.',409);
  if(message.includes('VIDEO_CHARACTER_UNAVAILABLE')||message.includes('VIDEO_CONVERSATION_UNAVAILABLE'))return new AppError('NOT_FOUND','That companion conversation is unavailable.',404);
  if(message.includes('VIDEO_LOCATION_UNAVAILABLE')||message.includes('VIDEO_WORLD_UNAVAILABLE'))return new AppError('FORBIDDEN','That video location is no longer available. Choose another place.',403);
  if(message.includes('VIDEO_CONTENT_LEVEL_BLOCKED')||message.includes('VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED'))return new AppError('FORBIDDEN','This photo is not eligible for video generation.',403);
  return new AppError('INTERNAL_ERROR','The video could not be reserved safely.',500,true);
}

async function videoProgressState(db:any,media:Record<string,any>):Promise<string>{
  if(media.status==='ready')return'Ready';if(media.status==='failed')return'Failed';
  if(media.status==='queued'){
    const retryAt=media.next_attempt_at?new Date(String(media.next_attempt_at)).getTime():NaN;
    if(Number.isFinite(retryAt)&&retryAt>Date.now())return`Provider busy · retrying in ${Math.max(1,Math.ceil((retryAt-Date.now())/1_000))}s`;
    if(media.parent_media_id){const{data:parent}=await db.from('together_generated_media').select('status').eq('id',media.parent_media_id).eq('user_id',media.user_id).maybeSingle();if(parent&&!['ready','failed'].includes(String(parent.status)))return'Preparing the opening frame';}
    const{data:queued}=await db.from('together_generated_media').select('id,created_at,queue_priority,next_attempt_at').eq('media_type','video').eq('status','queued').or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).limit(1000),ordered=orderedVideoQueue((queued??[]) as Array<{id:string;created_at:string;queue_priority?:number|null;next_attempt_at?:string|null}>),position=Math.max(1,ordered.findIndex((item)=>item.id===media.id)+1),route=configuredVideoRouteCatalog().find((item)=>item.id===media.video_route_id),wait=estimatedVideoQueueWaitSeconds(position,route?.estimatedWaitSeconds.median??60,videoGlobalInflight());
    return videoQueueProgressLabel({position,estimatedWaitSeconds:wait});
  }
  const{data:job}=await db.from('together_media_provider_jobs').select('provider_completed_at,finalized_at,status').eq('generated_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  return job?.provider_completed_at&&!job?.finalized_at?'Finalizing':'Creating video';
}

function videoGlobalInflight(){const value=Number(Deno.env.get('KIVELLE_VIDEO_MAX_INFLIGHT')??4);return Number.isFinite(value)?Math.max(1,Math.min(20,Math.floor(value))):4;}

function safeVideoDiagnostics(media:Record<string,any>,job:Record<string,any>|null,feedback:Record<string,any>|null){
  const at=(value:unknown)=>value?new Date(String(value)).getTime():NaN,start=at(job?.created_at),submitted=at(job?.submitted_at),completed=at(job?.provider_completed_at),finalized=at(job?.finalized_at);
  const duration=(from:number,to:number)=>Number.isFinite(from)&&Number.isFinite(to)?Math.max(0,to-from):null;
  const route=configuredVideoRouteCatalog().find((item)=>item.id===media.video_route_id);
  return{routeId:media.video_route_id,routeDisplayName:route?.displayName??null,provider:job?.provider??media.provider??null,model:job?.resolved_model??job?.model??null,requestedModel:job?.requested_model??media.requested_model??null,resolvedModel:job?.resolved_model??media.resolved_model??null,status:job?.status??media.status,providerRequestStatus:job?.status??null,retryCount:job?.retry_count??0,requested:{durationSeconds:job?.requested_duration_seconds??media.requested_duration_seconds,resolution:job?.requested_resolution??media.requested_resolution,audioBehavior:job?.requested_audio_behavior??media.requested_audio_behavior,sound:job?.sound_requested??media.sound_requested??false,providerAudioMode:job?.provider_audio_mode??media.provider_audio_mode??null,aspectRatio:job?.source_aspect_ratio??media.source_aspect_ratio,motionPreset:job?.motion_preset??media.motion_preset},actualAudioBehavior:job?.actual_audio_behavior??media.actual_audio_behavior??null,audioStreamDetected:job?.audio_stream_detected??media.audio_stream_detected??null,audioStripped:job?.audio_stripped??media.audio_stripped??false,finalSoundPresent:job?.final_sound_present??media.final_sound_present??false,latencyMs:{queue:duration(start,submitted),generation:duration(submitted,completed),finalization:duration(completed,finalized),total:duration(start,finalized)},quotedProviderCostUsd:job?.quoted_provider_cost_usd??media.provider_quote_usd??null,actualProviderCostUsd:job?.actual_provider_cost_usd??null,failureCode:job?.failure_code??media.failure_code??null,feedback:feedback??null};
}
