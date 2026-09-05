import type{SupabaseClient}from'@supabase/supabase-js';
import{canonicalRequestForMedia,mediaCaptureLightingForRequest}from'./together-media-base.ts';
import{routeCanonicalMedia,type CanonicalMediaRequest,type ProviderCompletedMedia}from'./together-media-providers.ts';
import{resolveSubscriptionState}from'./kivelle-subscription.ts';
import{track}from'./together.ts';
import{configuredVeniceClient,type VeniceImageClient}from'./venice.ts';
import{AppError}from'./types.ts';
import{enforceMediaQualityRequirements,parseMediaQualityVerdict,type MediaQualityVerdict}from'../../../packages/together-domain/src/media-quality.ts';
import{photoRequestAllowsHiddenFace,resolveAdultNudityScope,resolvePhotoDirection,resolveSpecificAnatomyExposure,visibleAdultAnatomyTargetLabels}from'../../../packages/together-domain/src/media.ts';
import{completeMediaUsageAttempt,recordMediaUsageAttempt}from'./together-media-usage.ts';
import{currentAdultMediaJobAuthorized}from'./web-adult-access.ts';
import{blockingQualityReasonsForAgePolicy,customCharacterAgeCheckFromMetadata,requiresCustomCharacterAgePresentationCheck}from'./together-media-character.ts';

export type MediaQualityGateResult={action:'accept';result:ProviderCompletedMedia}|{action:'deferred'}|{action:'reject';reasonCodes:string[]};
type MediaQualityAssessment={verdict:MediaQualityVerdict;providerRequestId?:string|undefined;providerModel?:string|undefined;providerStatus?:string|undefined;providerError?:string|undefined;errorCode?:string|undefined;inferenceMs?:number|undefined;timedOut:boolean};

const QUALITY_MODEL='qwen3-vl-235b-a22b';

export async function gateGeneratedImageQuality(db:SupabaseClient,job:Record<string,any>,media:Record<string,any>,result:ProviderCompletedMedia):Promise<MediaQualityGateResult>{
  const metadata=(media.metadata??{}) as Record<string,unknown>;
  const economicallyAuthorized=metadata.source==='user_request'||typeof metadata.mediaOfferId==='string';
  const providerSafetyFlag=result.providerMetadata?.providerSafetyFlag===true;
  if(job.job_type!=='image'||!economicallyAuthorized||(!result.outputUrl&&!result.bytes))return{action:'accept',result};
  const adultAuthorized=metadata.adultAuthorized===true&&media.visibility_scope==='web_adult'&&['suggestive','mature','explicit'].includes(String(media.content_level??''));
  if(adultAuthorized&&!await currentAdultMediaJobAuthorized(db,media))return{action:'reject',reasonCodes:['adult_safety_unverified']};
  if(!adultAuthorized&&!providerSafetyFlag&&!envEnabled('KIVELLE_MEDIA_QUALITY_GATE_ENABLED',true))return{action:'accept',result};
  const canonical=await canonicalRequestForMedia(db,media).catch(()=>null);
  if(adultAuthorized&&!canonical)return{action:'reject',reasonCodes:['adult_safety_unverified']};
  const requestText=canonical?.generationIntent?.requestText,faceRequired=!photoRequestAllowsHiddenFace(requestText),nudityScope=resolveAdultNudityScope(requestText),specificAnatomyExposure=resolveSpecificAnatomyExposure(requestText),requestedDirection=canonical?resolvePhotoDirection({requestText,shotType:canonical.composition.shotType,seed:canonical.mediaId}):null,subjects=canonical?.subjects?.length?canonical.subjects:[canonical?{characterInstanceId:'anchor',companion:canonical.companion,visualIdentity:canonical.visualIdentity,referenceImages:canonical.referenceImages.filter((item)=>item.role==='character_identity')}:null].filter(Boolean) as NonNullable<typeof canonical>['subjects'],anonymousAdultPartner=adultAuthorized&&metadata.anonymousAdultPartner===true;
  let assessment:MediaQualityAssessment;
  if(providerSafetyFlag&&!adultAuthorized){
    // Provider safety classifications are treated as a rejected candidate,
    // not a failed user request. The normal one-shot quality retry below
    // rebuilds the already-sanitized canonical request on the standard route.
    assessment={verdict:{status:'fail',reasonCodes:['sexual_content']},providerRequestId:result.providerRequestId,providerStatus:'provider_safety_flag',errorCode:'provider_safety_flag',timedOut:false};
  }else{
    const client=configuredVeniceClient();if(!client)return adultAuthorized?{action:'reject',reasonCodes:['adult_safety_unverified']}:{action:'accept',result};
    const prepared=await prepareQualityInput(db,job,media,result);if(!prepared)return adultAuthorized?{action:'reject',reasonCodes:['adult_safety_unverified']}:{action:'accept',result};
    const captureLighting=canonical?mediaCaptureLightingForRequest(canonical):null;
    try{assessment=await assessImage(client,prepared.url,faceRequired,nudityScope,specificAnatomyExposure,requestText,requestedDirection?.source==='requested'?requestedDirection:null,subjects??[],canonical?.context.worldContainment,canonical?.referenceImages??[],captureLighting?.qualityInstruction,adultAuthorized,anonymousAdultPartner);}finally{if(prepared.temporary)await db.storage.from('together-user-media').remove([prepared.temporary]);}
  }
  const customAgeCheck=customCharacterAgeCheckFromMetadata(metadata)??requiresCustomCharacterAgePresentationCheck(subjects??[]);
  const verdict=enforceMediaQualityRequirements(assessment.verdict,{requiresVisibleSpecificAnatomy:specificAnatomyExposure==='uncovered'&&(nudityScope==='specific_anatomy'||nudityScope==='full_nude'||nudityScope==='bottomless'||visibleAdultAnatomyTargetLabels(requestText).some((label)=>/genital|vulva|penis/i.test(label))),requiresWorldVerification:Boolean(canonical?.context.worldContainment)&&envEnabled('KIVELLE_MEDIA_WORLD_QA_REQUIRED',true),requiresAdultSafetyVerification:adultAuthorized}),qualityMetadata=assessmentMetadata({...assessment,verdict}),providerMetadata={...((job.provider_metadata??{}) as Record<string,unknown>),...qualityMetadata};
  await db.from('together_media_provider_jobs').update({provider_metadata:providerMetadata,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id));
  await track(db,String(media.user_id),'media_quality_checked',compactRecord({mediaId:media.id,verdict:verdict.status,retryCount:Number(providerMetadata.qualityRetryCount??0),qaProviderRequestId:assessment.providerRequestId,qaProviderModel:assessment.providerModel,qaProviderStatus:assessment.providerStatus,qaErrorCode:assessment.errorCode,qaTimedOut:assessment.timedOut,qaInferenceMs:assessment.inferenceMs}));
  if(verdict.status!=='fail')return{action:'accept',result};

  // Immediate fail-closed rejection of age/safety codes is custom-only.
  // Official catalog adults retry or deliver instead of dying on youthful-adult QA.
  const blockingReasons=blockingQualityReasonsForAgePolicy(verdict.reasonCodes,customAgeCheck);
  if(isCustomCharacterTerminalQualityFailure(verdict.reasonCodes,customAgeCheck))return{action:'reject',reasonCodes:verdict.reasonCodes};
  if(!customAgeCheck&&blockingReasons.length===0){
    await db.from('together_media_provider_jobs').update({provider_metadata:{...providerMetadata,qualityAcceptedWithWarnings:true,qualityWarningReasonCodes:verdict.reasonCodes},updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id));
    await track(db,String(media.user_id),'media_quality_official_age_warning_accepted',{mediaId:media.id,reasonCodes:verdict.reasonCodes});
    return{action:'accept',result:{...result,providerMetadata:{...(result.providerMetadata??{}),qualityAcceptedWithWarnings:true,qualityWarningReasonCodes:verdict.reasonCodes}}};
  }

  const retryCount=Number(providerMetadata.qualityRetryCount??0);
  if(retryCount>=1){
    // After the provider has already produced a second candidate, do not turn
    // harmless composition drift into a permanently failed user request. The
    // hard gates above (adult safety/age) and the non-adherence reasons below
    // still fail closed. This returns the best safe candidate only when QA's
    // remaining concerns are direction or setting preferences.
    const requiresExactRequestedComposition=adultAuthorized&&specificAnatomyExposure==='uncovered'&&requestedDirection?.source==='requested';
    if((!customAgeCheck&&blockingReasons.length===0)||canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:blockingReasons},{requiresExactRequestedComposition,allowOfficialAgePresentationWarning:!customAgeCheck})){
      await db.from('together_media_provider_jobs').update({provider_metadata:{...providerMetadata,qualityAcceptedWithWarnings:true,qualityWarningReasonCodes:verdict.reasonCodes},updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id));
      await track(db,String(media.user_id),'media_quality_retry_delivered_with_warnings',{mediaId:media.id,reasonCodes:verdict.reasonCodes});
      return{action:'accept',result:{...result,providerMetadata:{...(result.providerMetadata??{}),qualityAcceptedWithWarnings:true,qualityWarningReasonCodes:verdict.reasonCodes}}};
    }
    return{action:'reject',reasonCodes:blockingReasons};
  }

  const now=new Date().toISOString();
  const{data:claimed}=await db.from('together_media_provider_jobs').update({status:'submitting',provider_metadata:{...providerMetadata,qualityRetryPreparing:true,qualityVerdict:'fail',qualityReasonCodes:verdict.reasonCodes},updated_at:now}).eq('id',job.id).eq('status','processing').eq('provider_request_id',String(job.provider_request_id)).select('*').maybeSingle();
  if(!claimed)return{action:'deferred'};
  await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:Number(job.attempt_count??1),success:false,failureCode:'quality_retry'});

  const retryAttempt=Math.min(10,Number(job.attempt_count??1)+1);let retryRecorded=false;
  try{
    const base=canonical??await canonicalRequestForMedia(db,media),subjectCount=Math.max(1,base.subjects?.length??1),faceQualityFailure=!photoRequestAllowsHiddenFace(requestText)&&verdict.reasonCodes.some((reason)=>['face_distortion','face_blur','face_low_detail','face_too_small','duplicate_features','identity_mismatch','identity_swap'].includes(reason)),requestedAnatomyFailure=verdict.reasonCodes.some((reason)=>['requested_anatomy_missing','requested_anatomy_unverified'].includes(reason)),anatomyQualityFailure=requestedAnatomyFailure||verdict.reasonCodes.some((reason)=>['malformed_hands','digit_error','limb_distortion','joint_distortion','torso_distortion','body_proportion_error','duplicate_body_parts','anatomy_low_detail','genital_anatomy_error','subject_count_mismatch'].includes(reason));
    const retryComposition=faceQualityFailure?{...base.composition,shotType:base.composition.shotType==='scene'?'candid':base.composition.shotType,aspectRatio:'4:5',framing:subjectCount>1?'fresh balanced two-person portrait with exactly both selected companions equally prominent; render two large, crisp, distinct, naturally proportioned faces and preserve the left/right identity assignment':'fresh medium-close environmental portrait with the companion as the dominant subject; render one large, crisp, naturally proportioned face with clear eyes, nose, mouth, teeth, and skin detail'}:requestedAnatomyFailure?{...base.composition,aspectRatio:'4:5',framing:'fresh instruction-compliant composition that keeps the specifically requested adult anatomy fully inside the frame, unobstructed and uncovered unless coverage was explicitly requested, large enough to verify, and rendered with coherent photographic detail; minimally reframe or reposition the pose instead of hiding the requested subject'}:anatomyQualityFailure?{...base.composition,aspectRatio:'4:5',framing:subjectCount>1?'fresh straightforward two-person composition with exactly two separate coherent adult bodies, both selected faces visible and recognizable, no extra person, no missing person, and no fused limbs':'fresh straightforward camera angle with a relaxed natural pose, clearly separated limbs, unobscured joints and visible hands; preserve the requested subject and framing while rendering complete, coherent, sharply detailed adult anatomy'}:base.composition;
    const retryRequest={...base,mediaType:'image',composition:retryComposition,qualityRetry:{reasonCodes:verdict.reasonCodes}} as CanonicalMediaRequest;
    const subscription=await resolveSubscriptionState(db,String(media.user_id));
    const routed=routeCanonicalMedia(retryRequest,{source:'user_request',userTier:subscription.tier,preferredProvider:String(job.provider)==='venice'?'venice':'wavespeed'});
    let submission;try{submission=await routed.provider.submit(retryRequest,routed.route.capability);}catch(error){const failureCode=error instanceof AppError?error.code:'quality_retry_submission_failed';await recordMediaUsageAttempt(db,{job,media,subscriptionTier:subscription.tier,routeId:routed.route.capability.id,model:routed.route.capability.model,provider:routed.provider.id,attemptNumber:retryAttempt,qualityRetry:true,estimatedCost:routed.route.capability.estimatedCost});await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:retryAttempt,success:false,failureCode});throw error;}
    await recordMediaUsageAttempt(db,{job,media,subscriptionTier:subscription.tier,routeId:routed.route.capability.id,model:submission.model,provider:submission.provider,attemptNumber:retryAttempt,qualityRetry:true,generationMs:submission.result?.generationMs,estimatedCost:submission.result?.estimatedCost??routed.route.capability.estimatedCost});retryRecorded=true;
    const nextMetadata={...providerMetadata,qualityRetryPreparing:false,qualityRetryCount:1,qualityVerdict:'fail',qualityReasonCodes:verdict.reasonCodes,rejectedProviderRequestIds:[...asStrings(providerMetadata.rejectedProviderRequestIds),String(result.providerRequestId??job.provider_request_id)],routingReason:routed.route.reasonCode};
    const{data:updatedJob,error:jobError}=await db.from('together_media_provider_jobs').update({provider_request_id:submission.providerRequestId,model:routed.route.capability.model,route_id:routed.route.capability.id,status:'processing',attempt_count:retryAttempt,submitted_at:now,provider_completed_at:null,next_poll_at:new Date(Date.now()+5_000).toISOString(),last_polled_at:null,provider_metadata:nextMetadata,updated_at:now}).eq('id',job.id).eq('status','submitting').select('id').maybeSingle();
    if(jobError||!updatedJob)throw new Error('quality_retry_job_update_failed');
    const{error:mediaError}=await db.from('together_generated_media').update({provider_request_id:submission.providerRequestId,metadata:{...metadata,providerRouteId:routed.route.capability.id,providerStatus:submission.status,qualityRetryCount:1,qualityReasonCodes:verdict.reasonCodes},updated_at:now}).eq('id',media.id).eq('status','generating');
    if(mediaError)throw new Error('quality_retry_media_update_failed');
    await track(db,String(media.user_id),'media_quality_retry_started',{mediaId:media.id,reasonCodes:verdict.reasonCodes,routeId:routed.route.capability.id});
    if(submission.status==='completed'&&submission.result)return{action:'accept',result:submission.result};
    return{action:'deferred'};
  }catch{
    if(retryRecorded)await completeMediaUsageAttempt(db,{providerJobId:String(job.id),attemptNumber:retryAttempt,success:false,failureCode:'quality_retry_setup_failed'});
    return{action:'reject',reasonCodes:['quality_retry_submission_failed']};
  }
}

async function prepareQualityInput(db:SupabaseClient,job:Record<string,any>,media:Record<string,any>,result:ProviderCompletedMedia):Promise<{url:string;temporary?:string}|null>{
  if(result.outputUrl)return{url:result.outputUrl};if(!result.bytes)return null;
  const path=`${media.user_id}/${media.character_instance_id}/quality-candidates/${media.id}-${job.id}-${crypto.randomUUID()}.png`,uploaded=await db.storage.from('together-user-media').upload(path,result.bytes,{contentType:result.contentType??'image/png',upsert:false,cacheControl:'60'});if(uploaded.error)return null;
  const{data}=await db.storage.from('together-user-media').createSignedUrl(path,600);if(!data?.signedUrl){await db.storage.from('together-user-media').remove([path]);return null;}return{url:data.signedUrl,temporary:path};
}

async function assessImage(client:VeniceImageClient,imageUrl:string,faceRequired:boolean,nudityScope:ReturnType<typeof resolveAdultNudityScope>,specificAnatomyExposure:ReturnType<typeof resolveSpecificAnatomyExposure>,requestText:string|undefined,requestedDirection:ReturnType<typeof resolvePhotoDirection>|null,subjects:Array<{companion:{name:string;age?:number;custom?:boolean};visualIdentity?:{canonicalDescription?:string;hair?:string;eyes?:string;skinTone?:string;identifyingFeatures?:string[]};referenceImages:Array<{signedUrl?:string}>}>,worldContainment?:{worldName:string;locationName?:string;worldDescription?:string;worldVisualContext?:Record<string,unknown>},allReferences:Array<{role:string;signedUrl?:string}>=[],timeRule?:string,adultAuthorized=false,anonymousAdultPartner=false):Promise<MediaQualityAssessment>{
  try{
    const subjectCount=Math.max(1,subjects.length),expectedSubjectCount=anonymousAdultPartner?2:subjectCount,group=expectedSubjectCount>1,faceRule=anonymousAdultPartner?`The output must contain exactly two clearly fictional adults age 25 or older: the one approved companion and one anonymous original partner. The companion must match the authoritative identity reference wherever they appear in the image. The anonymous partner must not resemble the companion, the user, or any recognizable real person and may remain non-identifiable. Fail subject_count_mismatch for a missing person, extra person, duplicate companion, or fused people. Fail identity_mismatch when the companion does not match their reference.`:group?`The output must contain exactly ${subjectCount} intended adult companions and no one else. Both selected faces must be visible, distinct, recognizable, and large enough to judge. The reference images after the generated output correspond in order to ${subjects.map((subject)=>subject.companion.name).join(' then ')}. Fail identity_mismatch when either intended person does not match their reference. Fail identity_swap when their identities or assigned positions are exchanged, blended, or copied. Fail subject_count_mismatch for a missing selected person, an extra person, or any duplicate person. Do not fail merely because this is an intentional two-person image.`:faceRequired?`The companion face must be visible, recognizable, and large enough to judge. The first identity reference after the generated output is authoritative for ${subjects[0]?.companion.name??'the companion'}; compare facial structure, eyes, nose, complexion, hair identity, and distinctive traits. Fail identity_mismatch for material identity drift. Fail face_too_small when the face is too small to judge. Fail face_blur, face_low_detail, face_distortion, or duplicate_features whenever applicable.`:'The approved composition may intentionally cover, turn away, crop out, or omit the face. Do not fail a missing, hidden, obscured, turned-away, or small face. If a face is visibly rendered, still fail obvious distortion or duplicated features.';
    const nudityRule=adultAuthorized?authorizedAdultImageSafetyRule(subjects,anonymousAdultPartner): 'PRODUCTION CONTENT CEILING: the delivered image must use opaque clothing suitable for a general audience. Ordinary opaque swimwear is allowed when the canonical location or activity calls for it. Fail sexual_content for any exposed breasts, nipples, buttocks, genitals, transparent or lingerie-like coverage, sexual activity, fetish presentation, or clearly sexual posing. This rule overrides any source/reference residue.';
    const anatomyRule=requestedAnatomyQualityRule(requestText,specificAnatomyExposure,adultAuthorized);
    const directionRule=requestedDirection?`The approved requested pose is: ${requestedDirection.poseDirection}. The required face direction is: ${requestedDirection.faceDirection}. Fail pose_mismatch if the body's pose or camera orientation materially contradicts that request. Fail face_direction_mismatch if the visible head, gaze, or expression contradicts the required direction—for example, visible eye contact or a camera-facing smile when the face must remain directed into pillows or away from the lens.`:'';
    const identityReferenceUrls=subjects.flatMap((subject)=>subject.referenceImages.map((reference)=>reference.signedUrl).filter((url):url is string=>Boolean(url))).slice(0,2);
    const environmentReferenceUrl=allReferences.find((reference)=>reference.role==='location_environment'&&reference.signedUrl)?.signedUrl??allReferences.find((reference)=>reference.role==='world_environment'&&reference.signedUrl)?.signedUrl;
    const referenceImageUrls=[...identityReferenceUrls,...(environmentReferenceUrl?[environmentReferenceUrl]:[])].slice(0,3);
    const visual=worldContainment?.worldVisualContext??{};
    const worldRule=worldContainment?`WORLD CONTAINMENT IS REQUIRED. The output must visibly belong only to ${worldContainment.worldName}${worldContainment.locationName?` at ${worldContainment.locationName}`:''}. Canonical world: ${worldContainment.worldDescription??''}. Visual signature: ${JSON.stringify({setting:visual.setting,architecture:visual.architecture,climate:visual.climate,recurringElements:visual.recurringElements??visual.recurring_elements})}. Forbidden/drift cues: ${JSON.stringify(visual.avoid??[])}. Fail world_mismatch if it depicts another Kivelle world or an environment incompatible with this world. Fail location_mismatch if it materially contradicts the exact location or its supplied environment reference. Fail earth_leakage when a non-Earth world is replaced by an ordinary terrestrial city, resort, house, pool, skyline, weather, signage, architecture, landscape, or open atmosphere.`:'';
    const qualityPrompt=`Quality-control this ${group?'two-person':'single'} generated companion photo. ${generatedImagePhotorealismRule()} ${faceRule} ${nudityRule} ${anatomyRule} ${directionRule} ${worldRule} ${timeRule??''} Return exactly PASS when it is suitable for delivery. Otherwise return FAIL followed only by comma-separated codes from: face_distortion, face_blur, face_low_detail, face_too_small, duplicate_features, malformed_hands, digit_error, limb_distortion, joint_distortion, torso_distortion, body_proportion_error, duplicate_body_parts, anatomy_low_detail, genital_anatomy_error, non_photorealistic, requested_anatomy_missing, pose_mismatch, face_direction_mismatch, embedded_reference, rendered_text, multiple_subjects, subject_count_mismatch, identity_mismatch, identity_swap, sexual_content, adult_safety_violation, ambiguous_age, world_mismatch, location_mismatch, earth_leakage, time_mismatch. Fail face_low_detail when a required visible face is mushy or synthetic. Inspect all visible bodies. Fail anatomy_low_detail when any visible chest, pelvic, genital, buttock, or other body region looks doll-like, mannequin-like, plastic, unnaturally smooth, blank, featureless, or synthetic rather than complete natural adult anatomy. Fail genital_anatomy_error when visible external genital structures are fused, duplicated, detached, misplaced, impossible, unnaturally protruding, incorrectly integrated with the pelvis, or otherwise biologically implausible. Also fail malformed hands, digit errors, impossible limbs or joints, melted torsos, duplicate body parts, rendered references, text, or prohibited content. ${group?'Treat exactly the two selected people as intended, not as multiple_subjects.':'Fail multiple_subjects for an unintended additional person.'}`;
    const base=await assessWithVisionFallback(client,{imageUrl,referenceImageUrls,prompt:qualityPrompt});
    const verdict=base.verdict;
    const genitalRule=adultAuthorized&&specificAnatomyExposure==='uncovered'?requestedGenitalAnatomyQualityRule(requestText):'';
    if(verdict.status==='pass'&&genitalRule){
      const anatomyAssessment=await assessWithVisionFallback(client,{imageUrl,prompt:genitalRule});
      if(anatomyAssessment.verdict.status!=='pass')return anatomyAssessment.verdict.status==='unavailable'?{...anatomyAssessment,verdict:{status:'unavailable',reasonCodes:[]},errorCode:anatomyAssessment.errorCode??'requested_genital_anatomy_unverified'}:anatomyAssessment;
    }
    if(!group||verdict.status==='fail'||verdict.status==='unavailable')return base;
    if(anonymousAdultPartner){
      const subject=subjects[0],referenceUrl=subject?.referenceImages.map((reference)=>reference.signedUrl).find((url):url is string=>Boolean(url));
      if(!subject||!referenceUrl)return{...base,verdict:{status:'fail',reasonCodes:['identity_mismatch']},errorCode:'companion_identity_unverified'};
      const identity=subject.visualIdentity,expected=[identity?.canonicalDescription,identity?.hair&&`Hair: ${identity.hair}`,identity?.eyes&&`Eyes: ${identity.eyes}`,identity?.skinTone&&`Skin tone: ${identity.skinTone}`,identity?.identifyingFeatures?.length&&`Features: ${identity.identifyingFeatures.slice(0,3).join(', ')}`].filter(Boolean).join(' '),identityAssessment=await assessWithVisionFallback(client,{imageUrl,referenceImageUrls:[referenceUrl],prompt:`Image 1 is a generated two-adult photo. Image 2 is the authoritative identity reference for ${subject.companion.name}. Canonical appearance: ${expected||'match the reference exactly'}. Locate the one person matching Image 2 anywhere in Image 1; do not assume left or right. Return PASS only when exactly one generated person clearly matches that identity and the other is a visibly distinct anonymous fictional adult. Return FAIL identity_mismatch for major identity drift, FAIL identity_swap when the anonymous person is the only match, and FAIL duplicate_features when both people copy the companion. Output only PASS or FAIL plus those codes.`});
      if(identityAssessment.verdict.status!=='pass')return{...base,verdict:{status:'fail',reasonCodes:identityAssessment.verdict.status==='fail'&&identityAssessment.verdict.reasonCodes.length?[...new Set(identityAssessment.verdict.reasonCodes)]:['identity_mismatch']},errorCode:identityAssessment.verdict.status==='unavailable'?'companion_identity_unverified':undefined};
      return{...base,verdict};
    }
    const identityChecks=await Promise.all(subjects.map(async(subject,index)=>{
      const referenceUrl=subject.referenceImages.map((reference)=>reference.signedUrl).find((url):url is string=>Boolean(url));
      if(!referenceUrl)return{status:'unavailable',reasonCodes:[]} as MediaQualityVerdict;
      const side=index===0?'LEFT':'RIGHT',otherSide=index===0?'RIGHT':'LEFT',identity=subject.visualIdentity,expected=[identity?.canonicalDescription,identity?.hair&&`Hair: ${identity.hair}`,identity?.eyes&&`Eyes: ${identity.eyes}`,identity?.skinTone&&`Skin tone: ${identity.skinTone}`,identity?.identifyingFeatures?.length&&`Features: ${identity.identifyingFeatures.slice(0,3).join(', ')}`].filter(Boolean).join(' '),identityAssessment=await assessWithVisionFallback(client,{imageUrl,referenceImageUrls:[referenceUrl],prompt:`Image 1 is a generated two-person photo. Image 2 is the authoritative identity reference for ${subject.companion.name}, who must be the ${side} person. Canonical appearance: ${expected||'match the reference exactly'}. Inspect identity only, accounting for ordinary lighting and expression changes. Compare facial structure, eye and nose shape, complexion, hair color, and distinctive traits. Return PASS only when the ${side} person clearly matches Image 2 and the canonical appearance, while remaining visibly different from the ${otherSide} subject. Return FAIL identity_mismatch for changed ancestry or ethnic appearance, complexion, facial identity, hair identity, or other major drift. Return FAIL identity_swap if Image 2's identity is on the ${otherSide}. Return FAIL duplicate_features if both generated people look like Image 2 or copies of one person. Output only PASS or FAIL plus those codes.`});
      return identityAssessment.verdict;
    }));
    const unavailable=identityChecks.some((check)=>check.status==='unavailable'),failedReasons=identityChecks.flatMap((check)=>check.status==='fail'?check.reasonCodes:[]);
    if(unavailable||failedReasons.length)return{...base,verdict:{status:'fail',reasonCodes:[...new Set(unavailable?['identity_mismatch',...failedReasons]:failedReasons)]},...(unavailable?{errorCode:'group_identity_unverified'}:{})};
    return{...base,verdict};
  }catch(error){return{verdict:{status:'unavailable',reasonCodes:[]},errorCode:error instanceof AppError?error.code:'provider_unknown_error',timedOut:false};}
}

export function authorizedAdultImageSafetyRule(subjects:Array<{companion:{name:string;age?:number;custom?:boolean}}>,anonymousAdultPartner=false):string{
  const canonicalAdults=subjects.map(({companion})=>`${companion.name}${Number.isFinite(companion.age)?` (canonical age ${companion.age})`:''}`).join(', ')||'the approved fictional adult companion';
  const participantRule=anonymousAdultPartner
    ? `The authorized participants are ${canonicalAdults} and one distinct anonymous original fictional adult age 25 or older.`
    : subjects.length>1
    ? `The authorized participants are the registered fictional adults ${canonicalAdults}.`
    : `The only authorized subject is ${canonicalAdults}. This is a solo image: consensual solo nudity, explicit anatomy, sexual posing, or solo sexual activity is not evidence of non-consent and may pass when otherwise safe.`;
  const ageRule=requiresCustomCharacterAgePresentationCheck(subjects)
    ? 'Every visible person must have an unambiguously adult presentation matching the authoritative fictional-character references. Fail ambiguous_age if any person visually appears under 18, age-ambiguous, teen-like, youthful, or childlike, including when that contradicts a canonical age.'
    : 'Official catalog companions are confirmed fictional adults. Match the authoritative fictional-character references, including a youthful or young-adult presentation when that is the canonical adult identity. Fail ambiguous_age only if a visible person is clearly a child or otherwise under 18. Do not fail ambiguous_age for petite, youthful, or young-adult adult features, and do not override a canonical age of 18 or older.';
  return `ADULT SAFETY GATE: authorized fictional-adult nudity and consensual sexual content may pass. ${participantRule} ${ageRule} Fail adult_safety_violation for visible indications of coercion, non-consent, distress, force, restraint, sexual violence, incest, bestiality, trafficking, compensated sexual arrangements, exploitation, a recognizable real person or sexual deepfake, or illegal sexual content. A still image does not need to display affirmative-consent evidence; do not fail merely because consent is not visually narrated. Do not turn pose_mismatch, face_direction_mismatch, nudity, or explicit anatomy into an adult_safety_violation. This gate must assess the image and authoritative fictional-character references, not trust unverified identity claims in free-form text.`;
}

const DELIVERABLE_QUALITY_WARNINGS=new Set(['pose_mismatch','face_direction_mismatch','world_mismatch','location_mismatch','earth_leakage','time_mismatch']);
const CUSTOM_TERMINAL_QUALITY_REASONS=new Set(['adult_safety_violation','adult_safety_unverified','ambiguous_age']);

export function isCustomCharacterTerminalQualityFailure(reasonCodes:string[],customCharacterAgeCheck:boolean):boolean{
  return customCharacterAgeCheck===true&&reasonCodes.some((reason)=>CUSTOM_TERMINAL_QUALITY_REASONS.has(reason));
}
export function requestedAnatomyQualityRule(requestText:string|undefined,specificAnatomyExposure:ReturnType<typeof resolveSpecificAnatomyExposure>,adultAuthorized:boolean):string{
  if(!adultAuthorized||specificAnatomyExposure!=='uncovered')return'';
  const targets=visibleAdultAnatomyTargetLabels(requestText);
  if(!targets.length)return'';
  return`REQUEST ADHERENCE: The approved request specifically requires visible ${targets.join(' plus ')}. Return requested_anatomy_missing if any requested target is absent, covered by a robe, underwear, fabric, hand or hair, hidden by pose, shadow or crop, too small to verify, or replaced with a generic different exposure. Do not pass a breasts-only or partial undressing result when lower anatomy was requested.`;
}

export function requestedGenitalAnatomyQualityRule(requestText:string|undefined):string{
  const targets=visibleAdultAnatomyTargetLabels(requestText);
  const genital=targets.filter((label)=>/genital|vulva|penis/i.test(label));
  if(!genital.length)return'';
  const female=genital.some((label)=>/vulva/i.test(label)),male=genital.some((label)=>/penis/i.test(label));
  const target=female&&male?'the requested external female and male genital anatomy':female?'the requested external vulvar anatomy and labia':male?'the requested external penile and scrotal anatomy':'the requested uncovered external genitalia matching this adult body';
  return`Image 1 is a generated fictional-adult photograph. Inspect ${target} only for requested visibility, photographic detail, and biological plausibility; explicit adult anatomy itself is allowed and is not a reason to reject. Return PASS only when every requested structure is clearly visible, naturally proportioned, correctly placed, and coherently integrated with the surrounding pelvis and body. Return FAIL genital_anatomy_error when a requested structure is fused, duplicated, detached, misplaced, impossible, unnaturally protruding, incorrectly oriented, incorrectly integrated, rendered as a seam or generic slit, or otherwise anatomically implausible. Return FAIL requested_anatomy_missing when it is absent, covered, cropped, obscured, or too small to judge. Return FAIL anatomy_low_detail when it is blank, doll-like, plastic, melted, airbrushed, or featureless. Output only PASS or FAIL followed by those exact codes.`;
}

export function generatedImagePhotorealismRule():string{return'PHOTOREALISM IS REQUIRED. The output must be indistinguishable from a real camera photograph, with natural skin pores and imperfections, individual hair, plausible optics, light, depth of field, and sensor response. Fail non_photorealistic for anime, cartoons, paintings, illustrations, 2D/3D renders, CGI, game art, stylized animation, dolls, mannequins, wax figures, plastic or heavily airbrushed skin, oversized illustrated eyes, or any clearly synthetic visual style.';}

export function canDeliverQualityRetryWithWarnings(verdict:MediaQualityVerdict,input:{requiresExactRequestedComposition?:boolean;allowOfficialAgePresentationWarning?:boolean}={}):boolean{
  if(input.requiresExactRequestedComposition&&verdict.reasonCodes.some((reason)=>reason==='pose_mismatch'||reason==='face_direction_mismatch'))return false;
  return verdict.status==='fail'&&verdict.reasonCodes.length>0&&verdict.reasonCodes.every((reason)=>DELIVERABLE_QUALITY_WARNINGS.has(reason)||(input.allowOfficialAgePresentationWarning===true&&reason==='ambiguous_age'));
}

async function assessWithVisionFallback(client:VeniceImageClient,input:{imageUrl:string;referenceImageUrls?:string[];prompt:string}):Promise<MediaQualityAssessment>{
  const models=[Deno.env.get('KIVELLE_VENICE_VISION_MODEL')??QUALITY_MODEL,Deno.env.get('KIVELLE_VENICE_VISION_FALLBACK_MODEL')??'mistral-31-24b'].filter((model,index,all)=>Boolean(model)&&all.indexOf(model)===index);
  let last:MediaQualityAssessment={verdict:{status:'unavailable',reasonCodes:[]},errorCode:'provider_output_invalid',timedOut:false};
  for(const model of models){
    try{
      const run=await client.assessQuality({...input,model}),verdict=parseMediaQualityVerdict(run.content);
      last={verdict,providerRequestId:run.providerRequestId,providerModel:run.model,providerStatus:'completed',inferenceMs:run.generationMs,timedOut:false,...(verdict.status==='unavailable'?{errorCode:'provider_output_invalid'}:{})};
      if(verdict.status!=='unavailable')return last;
    }catch(error){
      const code=error instanceof AppError?error.code:'provider_unknown_error';
      last={verdict:{status:'unavailable',reasonCodes:[]},errorCode:code,timedOut:code==='PROVIDER_TIMEOUT'};
    }
  }
  return last;
}

function asStrings(value:unknown):string[]{return Array.isArray(value)?value.map(String).filter(Boolean):[];}
function assessmentMetadata(assessment:MediaQualityAssessment):Record<string,unknown>{return compactRecord({qualityCheckedAt:new Date().toISOString(),qualityVerdict:assessment.verdict.status,qualityReasonCodes:assessment.verdict.reasonCodes,qualityProviderRequestId:assessment.providerRequestId,qualityProviderModel:assessment.providerModel,qualityProviderStatus:assessment.providerStatus,qualityProviderError:assessment.providerError,qualityErrorCode:assessment.errorCode,qualityTimedOut:assessment.timedOut,qualityInferenceMs:assessment.inferenceMs});}
function compactRecord(value:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined));}
function envEnabled(name:string,fallback=false):boolean{const value=Deno.env.get(name);if(value==null)return fallback;return['1','true','yes','on'].includes(value.toLowerCase());}
