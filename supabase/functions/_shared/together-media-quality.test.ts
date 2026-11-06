import { assertStringIncludes } from 'jsr:@std/assert@1';
import { adultOutputSafetyFailClosed, authorizedAdultImageSafetyRule, canDeliverFinalSfwQualityCandidateWithWarnings, canDeliverQualityRetryWithWarnings, generatedImagePhotorealismRule, hasTerminalAdultOutputSafetyFailure, isCustomCharacterTerminalQualityFailure, isOrdinarySwimwearRequest, mergeBodyTopologyVerdict, mergeSelfieCaptureDeviceVerdict, rearBodyTopologyQualityRule, requestedAnatomyQualityRule, requestedGenitalAnatomyQualityRule, resolveSwimwearSafetyVerdict, selfieCaptureDeviceQualityRule, shouldAttemptPaidImageQualityRetry, shouldDeliverFirstImageQualityCandidateWithWarnings, shouldDeliverOfficialAdultImageWithWarnings, shouldDeliverSfwWhenQualityReviewIsUnavailable, shouldReviewSelfieCaptureDevice, shouldRevalidateCompletedQualityRetry, shouldRunSingleBodyTopologyReview, shouldSkipGeneratedImageQualityGate } from './together-media-quality.ts';
import { isBetterAnatomyCandidate, shouldRefineAdultSingleAnatomy } from './together-media-group-detail.ts';

Deno.test('solo adult quality checks do not confuse explicit posing with non-consent',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Elena Petrova',age:27,custom:false}}]);
  assertStringIncludes(rule,'canonical age 27');
  assertStringIncludes(rule,'This is a solo image');
  assertStringIncludes(rule,'explicit anatomy');
  assertStringIncludes(rule,'not evidence of non-consent');
  assertStringIncludes(rule,'Fail ambiguous_age');
  assertStringIncludes(rule,'sexual violence');
  assertStringIncludes(rule,'sexual deepfake');
});

Deno.test('partnered adult quality checks retain strict participant and consent rules',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Elena Petrova',age:27,custom:false}}],true);
  assertStringIncludes(rule,'anonymous original fictional adult age 25 or older');
  assertStringIncludes(rule,'visible indications of coercion');
  assertStringIncludes(rule,'A still image does not need to display affirmative-consent evidence');
});

Deno.test('official catalog adults are not failed for a youthful 18+ look',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Princess Maris Vaelorian',age:18,custom:false}}]);
  assertStringIncludes(rule,'canonical age 18');
  assertStringIncludes(rule,'Fail ambiguous_age only if a visible person is clearly a child');
  assertStringIncludes(rule,'Do not fail ambiguous_age for petite, youthful, or young-adult adult features');
  if(rule.includes('including when that contradicts a canonical age'))throw new Error('official catalog QA must not override a canonical adult age');
  if(rule.includes('teen-like, youthful, or childlike'))throw new Error('official catalog QA must not treat youthful adults as age-ambiguous');
});

Deno.test('custom companions keep the strict visual age presentation gate',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Custom Companion',age:19,custom:true}}]);
  assertStringIncludes(rule,'Fail ambiguous_age if any person visually appears under 18');
  assertStringIncludes(rule,'teen-like, youthful, or childlike');
  assertStringIncludes(rule,'including when that contradicts a canonical age');
  const mixed=authorizedAdultImageSafetyRule([
    {companion:{name:'Princess Maris Vaelorian',age:18,custom:false}},
    {companion:{name:'Custom Companion',age:22,custom:true}},
  ]);
  assertStringIncludes(mixed,'including when that contradicts a canonical age');
  const unknown=authorizedAdultImageSafetyRule([{companion:{name:'Unknown Companion',age:21}}]);
  assertStringIncludes(unknown,'including when that contradicts a canonical age');
});

Deno.test('a second safe candidate may be delivered with composition warnings',()=>{
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch','face_direction_mismatch','world_mismatch']}))throw new Error('safe composition-only drift should be deliverable after the retry');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch']}))throw new Error('an explicit requested pose concern should be logged without discarding the generated photo');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch','identity_mismatch']}))throw new Error('identity mismatch should deliver with warnings');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['multiple_subjects']}))throw new Error('an extra person in a solo photo must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['subject_count_mismatch']}))throw new Error('a subject-count mismatch must remain terminal');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['adult_safety_violation']}))throw new Error('adult-safety mismatch should deliver with warnings');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['non_photorealistic','genital_anatomy_error','location_mismatch']}))throw new Error('realism, anatomy, and location mismatches should deliver with warnings');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['time_mismatch']}))throw new Error('wrong capture time should be logged without discarding the generated photo');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['ambiguous_age']}))throw new Error('custom-character age failures must remain terminal');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['ambiguous_age']},{allowOfficialAgePresentationWarning:true}))throw new Error('official catalog youthful-adult presentation must not stay terminal');
  if(canDeliverQualityRetryWithWarnings({status:'pass',reasonCodes:[]}))throw new Error('passing results do not need warning fallback');
});

Deno.test('a first candidate is delivered with quality concerns while safety remains blocking',()=>{
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['face_too_small','world_mismatch']},adultAuthorized:false}))throw new Error('a wider SFW scene and setting drift should not fail an otherwise usable paid photo');
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['identity_mismatch','time_mismatch']},adultAuthorized:false}))throw new Error('wrong capture time should remain a backend quality concern');
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['world_mismatch']},adultAuthorized:true}))throw new Error('adult location mismatch should deliver with warnings');
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['adult_safety_violation','non_photorealistic','requested_anatomy_missing']},adultAuthorized:true}))throw new Error('adult-safety, realism, and anatomy mismatches should deliver with warnings');
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['multiple_subjects','face_blur']},adultAuthorized:false}))throw new Error('a completed SFW candidate must not be discarded for non-safety quality defects');
  if(shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['sexual_content']},adultAuthorized:false}))throw new Error('an actual SFW content violation still blocks delivery');
});

Deno.test('ordinary opaque swimwear remains SFW even outside an aquatic location',()=>{
  if(!isOrdinarySwimwearRequest('Wearing a bikini eating an apple at Solace Biome'))throw new Error('the requested bikini must be recognized');
  if(isOrdinarySwimwearRequest('Wearing a dress eating an apple'))throw new Error('ordinary clothes do not need swimwear review');
  const initial={status:'fail' as const,reasonCodes:['sexual_content','face_blur']};
  const safe={status:'pass' as const,reasonCodes:[]};
  const cleared=resolveSwimwearSafetyVerdict(initial,safe);
  if(cleared.status!=='fail'||cleared.reasonCodes.join()!=='face_blur')throw new Error('a focused safe review should clear only a mistaken swimwear flag');
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:cleared,adultAuthorized:false}))throw new Error('remaining aesthetic defects must not discard the photo');
  if(resolveSwimwearSafetyVerdict(initial,{status:'unavailable',reasonCodes:[]}).reasonCodes.join()!==initial.reasonCodes.join())throw new Error('an unavailable safety review must not clear the flag');
  if(resolveSwimwearSafetyVerdict({status:'fail',reasonCodes:['sexual_content']},safe).status!=='pass')throw new Error('a safe bikini must pass after focused review');
});

Deno.test('official adult candidates are delivered with visual and capture-time concerns',()=>{
  const debugVerdict={status:'fail' as const,reasonCodes:['non_photorealistic','requested_anatomy_missing','identity_mismatch','world_mismatch','adult_safety_violation']};
  if(!shouldDeliverOfficialAdultImageWithWarnings({verdict:debugVerdict,adultAuthorized:true,customCharacter:false}))throw new Error('official adult visual and adherence defects should be delivered with warnings');
  if(!shouldDeliverOfficialAdultImageWithWarnings({verdict:{...debugVerdict,reasonCodes:[...debugVerdict.reasonCodes,'time_mismatch']},adultAuthorized:true,customCharacter:false}))throw new Error('nighttime mismatch should be logged without discarding the generated photo');
  if(shouldDeliverOfficialAdultImageWithWarnings({verdict:debugVerdict,adultAuthorized:true,customCharacter:true}))throw new Error('custom characters use the shared warning path rather than the official debug path');
  if(shouldDeliverOfficialAdultImageWithWarnings({verdict:debugVerdict,adultAuthorized:false,customCharacter:false}))throw new Error('the debugging policy must not affect SFW generation');
  if(hasTerminalAdultOutputSafetyFailure(['adult_safety_violation']))throw new Error('adult_safety_violation must not remain a photo delivery block');
  if(!hasTerminalAdultOutputSafetyFailure(['adult_safety_unverified']))throw new Error('unverified adult safety must remain recognized when QA cannot run');
  if(shouldDeliverOfficialAdultImageWithWarnings({verdict:{status:'fail',reasonCodes:['adult_safety_unverified']},adultAuthorized:true,customCharacter:false}))throw new Error('unverified adult safety must remain blocked when QA cannot run');
});

Deno.test('an unavailable quality reviewer never erases a provider-approved SFW photo',()=>{
  if(!shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:false,verdict:{status:'unavailable',reasonCodes:[]}}))throw new Error('SFW review outages must fail open for delivery');
  if(shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:true,verdict:{status:'unavailable',reasonCodes:[]}}))throw new Error('adult review outages must remain fail closed');
  if(shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:false,verdict:{status:'fail',reasonCodes:['multiple_subjects']}}))throw new Error('an actual hard verdict must not be treated as a reviewer outage');
});

Deno.test('a generated SFW candidate is delivered with quality warnings including capture time',()=>{
  if(!canDeliverFinalSfwQualityCandidateWithWarnings({status:'fail',reasonCodes:['face_low_detail','non_photorealistic','identity_mismatch']}))throw new Error('subjective SFW misses should not erase the corrected result');
  if(!canDeliverFinalSfwQualityCandidateWithWarnings({status:'fail',reasonCodes:['time_mismatch']}))throw new Error('wrong capture time should remain a backend quality concern');
  if(!canDeliverFinalSfwQualityCandidateWithWarnings({status:'fail',reasonCodes:['identity_swap','malformed_hands','duplicate_body_parts','multiple_subjects','embedded_reference']}))throw new Error('non-safety defects should remain visible to the user');
  for(const reason of ['sexual_content','adult_safety_violation','adult_safety_unverified','ambiguous_age']){
    if(canDeliverFinalSfwQualityCandidateWithWarnings({status:'fail',reasonCodes:[reason]}))throw new Error(`${reason} must remain a hard rejection`);
  }
});

Deno.test('synchronous quality retries are reviewed as new candidates',()=>{
  if(!shouldRevalidateCompletedQualityRetry({status:'completed',hasResult:true}))throw new Error('a completed Venice retry must receive a second quality review');
  if(shouldRevalidateCompletedQualityRetry({status:'processing',hasResult:true}))throw new Error('an unfinished retry must remain deferred');
  if(shouldRevalidateCompletedQualityRetry({status:'completed',hasResult:false}))throw new Error('a completed retry without output must remain deferred');
});

Deno.test('Venice does not buy a second quality candidate by default',()=>{
  if(shouldAttemptPaidImageQualityRetry({provider:'venice',veniceRetryEnabled:false}))throw new Error('a Venice quality failure must not spend on a second image by default');
  if(!shouldAttemptPaidImageQualityRetry({provider:'venice',veniceRetryEnabled:true}))throw new Error('the server override should permit a deliberate Venice quality retry');
  if(!shouldAttemptPaidImageQualityRetry({provider:'wavespeed',veniceRetryEnabled:false}))throw new Error('the Venice cost control must not change other providers');
});

Deno.test('a focused selfie review notices phones without losing earlier quality findings',()=>{
  if(!shouldReviewSelfieCaptureDevice({requestText:'A nude selfie from the current place',shotType:'portrait',subjectCount:1}))throw new Error('adult portrait routing must still inspect a selfie request');
  if(shouldReviewSelfieCaptureDevice({requestText:'A portrait',shotType:'portrait',subjectCount:1}))throw new Error('ordinary portraits do not need the extra review');
  if(shouldReviewSelfieCaptureDevice({requestText:'A group selfie',shotType:'portrait',subjectCount:2}))throw new Error('the solo review must not reinterpret group members as bystanders');
  assertStringIncludes(selfieCaptureDeviceQualityRule(),'visible_capture_device');
  const merged=mergeSelfieCaptureDeviceVerdict({status:'fail',reasonCodes:['world_mismatch']},{status:'fail',reasonCodes:['visible_capture_device']});
  if(merged.reasonCodes.join()!=='world_mismatch,visible_capture_device')throw new Error('capture failures must remain visible alongside world failures');
  if(!shouldDeliverOfficialAdultImageWithWarnings({verdict:merged,adultAuthorized:true,customCharacter:false}))throw new Error('an existing generated adult photo must remain deliverable with warnings');
  const unavailable=mergeSelfieCaptureDeviceVerdict({status:'unavailable',reasonCodes:[]},{status:'fail',reasonCodes:['visible_capture_device']});
  if(unavailable.status!=='unavailable')throw new Error('focused visual review must not bypass an unavailable primary safety review');
});

Deno.test('the SFW quality switch does not bypass custom adult output-safety review',()=>{
  if(!shouldSkipGeneratedImageQualityGate({adultAuthorized:false,customCharacter:false,providerSafetyFlag:false,gateEnabled:false}))throw new Error('SFW photos should skip when the quality gate is off');
  if(shouldSkipGeneratedImageQualityGate({adultAuthorized:false,customCharacter:false,providerSafetyFlag:false,gateEnabled:true}))throw new Error('SFW photos should still be checked when the quality gate is on');
  if(!shouldSkipGeneratedImageQualityGate({adultAuthorized:true,customCharacter:false,providerSafetyFlag:false,gateEnabled:false}))throw new Error('official catalog adult photos may skip when the quality gate is off');
  if(shouldSkipGeneratedImageQualityGate({adultAuthorized:true,customCharacter:false,providerSafetyFlag:false,gateEnabled:true}))throw new Error('official catalog adult photos still run QA when the gate is on');
  if(shouldSkipGeneratedImageQualityGate({adultAuthorized:true,customCharacter:true,providerSafetyFlag:false,gateEnabled:false}))throw new Error('custom adult photos must still receive output-safety review when the SFW gate is off');
  if(shouldSkipGeneratedImageQualityGate({adultAuthorized:true,customCharacter:true,providerSafetyFlag:true,gateEnabled:false}))throw new Error('a provider safety flag must not skip custom adult review');
  if(adultOutputSafetyFailClosed({adultAuthorized:true,customCharacter:false}))throw new Error('official catalog must not fail closed when adult QA is unavailable');
  if(!adultOutputSafetyFailClosed({adultAuthorized:true,customCharacter:true}))throw new Error('custom adult photos must fail closed when output-safety QA is unavailable');
  if(adultOutputSafetyFailClosed({adultAuthorized:false,customCharacter:true}))throw new Error('SFW photos do not use the adult fail-closed path');
});

Deno.test('terminal age rejection is custom-character only',()=>{
  if(!isCustomCharacterTerminalQualityFailure(['ambiguous_age'],true))throw new Error('custom companions must fail closed on ambiguous_age');
  if(isCustomCharacterTerminalQualityFailure(['adult_safety_violation'],true))throw new Error('adult_safety_violation must not remain a custom photo delivery block');
  if(!isCustomCharacterTerminalQualityFailure(['adult_safety_unverified'],true))throw new Error('custom companions must fail closed when adult safety cannot be verified');
  if(isCustomCharacterTerminalQualityFailure(['ambiguous_age'],false))throw new Error('official catalog must not terminal-reject on ambiguous_age');
  if(isCustomCharacterTerminalQualityFailure(['ambiguous_age','adult_safety_violation'],false))throw new Error('official catalog must not terminal-reject a youthful-adult false positive');
  if(isCustomCharacterTerminalQualityFailure(['adult_safety_unverified'],false))throw new Error('official catalog must not terminal-reject unverified age presentation');
  if(isCustomCharacterTerminalQualityFailure(['pose_mismatch'],true))throw new Error('composition drift is not a custom terminal safety reject');
});

Deno.test('adult QA names the exact requested anatomy and rejects a generic robe reveal',()=>{
  const rule=requestedAnatomyQualityRule('Send me a photo of you bent over with your ass and pussy showing','uncovered',true);
  assertStringIncludes(rule,'external vulva and labia');
  assertStringIncludes(rule,'buttocks and rear anatomy');
  assertStringIncludes(rule,'covered by a robe');
  assertStringIncludes(rule,'breasts-only');
  const implied=requestedAnatomyQualityRule('Send me a picture of you bent over nude','uncovered',true);
  assertStringIncludes(implied,'complete uncovered external genitalia matching this adult body');
  assertStringIncludes(implied,'buttocks and rear anatomy');
  if(requestedAnatomyQualityRule('Send a portrait','uncovered',true)!=='')throw new Error('non-anatomical requests should not invent anatomy targets');
  if(requestedAnatomyQualityRule('Send an explicit photo','covered',true)!=='')throw new Error('covered requests should not demand exposed anatomy');
});

Deno.test('generated-image QA rejects illustrated and synthetic-looking people',()=>{
  const rule=generatedImagePhotorealismRule();
  assertStringIncludes(rule,'indistinguishable from a real camera photograph');
  assertStringIncludes(rule,'Fail non_photorealistic');
  assertStringIncludes(rule,'stylized animation');
  assertStringIncludes(rule,'plastic or heavily airbrushed skin');
});

Deno.test('requested genital anatomy receives a dedicated plausibility inspection',()=>{
  const rule=requestedGenitalAnatomyQualityRule('Send a nude photo showing your pussy');
  assertStringIncludes(rule,'external vulvar anatomy and labia');
  assertStringIncludes(rule,'biological plausibility');
  assertStringIncludes(rule,'FAIL genital_anatomy_error');
  assertStringIncludes(rule,'seam or generic slit');
  const implied=requestedGenitalAnatomyQualityRule('Send me a nude photo');
  assertStringIncludes(implied,'uncovered external genitalia matching this adult body');
  if(requestedGenitalAnatomyQualityRule('Send a topless portrait')!=='')throw new Error('non-genital requests should not add a genital inspection');
});

Deno.test('rear-pose QA detects an extra upper torso without rejecting an ordinary bend',()=>{
  const instruction=rearBodyTopologyQualityRule();
  assertStringIncludes(instruction,'second upper torso');
  assertStringIncludes(instruction,'buttocks incorrectly attached to the front');
  assertStringIncludes(instruction,'ordinary bend');
  const first={status:'fail' as const,reasonCodes:['time_mismatch']};
  const merged=mergeBodyTopologyVerdict(first,{status:'fail',reasonCodes:['torso_distortion','duplicate_body_parts']});
  if(merged.status!=='fail'||!merged.reasonCodes.includes('time_mismatch')||!merged.reasonCodes.includes('torso_distortion'))throw new Error('geometry findings must supplement existing QA');
  if(mergeBodyTopologyVerdict(first,{status:'unavailable',reasonCodes:[]})!==first)throw new Error('unavailable second opinion must not erase first review');
});

Deno.test('single-adult selfie gets a body review even when the general reviewer flags only other defects',()=>{
  const base={adultAuthorized:true,subjectCount:1,verdict:{status:'fail' as const,reasonCodes:['requested_anatomy_missing','world_mismatch','time_mismatch']}};
  if(!shouldRunSingleBodyTopologyReview(base))throw new Error('the reported selfie failure must receive the dedicated geometry check');
  if(shouldRunSingleBodyTopologyReview({...base,subjectCount:2})||shouldRunSingleBodyTopologyReview({...base,adultAuthorized:false})||shouldRunSingleBodyTopologyReview({...base,verdict:{status:'unavailable',reasonCodes:[]}})||shouldRunSingleBodyTopologyReview({...base,verdict:{status:'fail',reasonCodes:['duplicate_body_parts']}}))throw new Error('the extra review must remain scoped and avoid duplicate checks');
});

Deno.test('single-adult anatomy repair is bounded and never replaces a candidate with another broken body',()=>{
  const base={adultAuthorized:true,subjectCount:1,provider:'venice',bytes:new Uint8Array([1]),reasonCodes:['duplicate_body_parts'],alreadyAttempted:false,enabled:true};
  if(!shouldRefineAdultSingleAnatomy(base))throw new Error('a severe one-body defect should qualify');
  if(shouldRefineAdultSingleAnatomy({...base,alreadyAttempted:true})||shouldRefineAdultSingleAnatomy({...base,reasonCodes:['time_mismatch']})||shouldRefineAdultSingleAnatomy({...base,reasonCodes:['duplicate_body_parts','adult_safety_violation']}))throw new Error('repair must remain bounded to quality-only geometry');
  const broken={status:'fail' as const,reasonCodes:['duplicate_body_parts','time_mismatch']};
  if(!isBetterAnatomyCandidate(broken,{status:'fail',reasonCodes:['time_mismatch']}))throw new Error('a repaired body may still carry an unrelated warning');
  if(isBetterAnatomyCandidate(broken,{status:'fail',reasonCodes:['torso_distortion']})||isBetterAnatomyCandidate(broken,{status:'unavailable',reasonCodes:[]})||isBetterAnatomyCandidate(broken,{status:'fail',reasonCodes:['identity_mismatch']})||isBetterAnatomyCandidate(broken,{status:'fail',reasonCodes:['requested_anatomy_missing']}))throw new Error('a new defect must not replace the original');
});
