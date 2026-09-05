import { assertStringIncludes } from 'jsr:@std/assert@1';
import { adultOutputSafetyFailClosed, authorizedAdultImageSafetyRule, canDeliverFinalSfwQualityCandidateWithWarnings, canDeliverQualityRetryWithWarnings, generatedImagePhotorealismRule, isCustomCharacterTerminalQualityFailure, requestedAnatomyQualityRule, requestedGenitalAnatomyQualityRule, shouldAttemptPaidImageQualityRetry, shouldDeliverFirstImageQualityCandidateWithWarnings, shouldDeliverSfwWhenQualityReviewIsUnavailable, shouldRevalidateCompletedQualityRetry, shouldSkipGeneratedImageQualityGate } from './together-media-quality.ts';

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
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch']},{requiresExactRequestedComposition:true}))throw new Error('an explicit requested pose must not be silently accepted after a retry');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch','identity_mismatch']}))throw new Error('identity failures must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['multiple_subjects']}))throw new Error('an extra person in a solo photo must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['subject_count_mismatch']}))throw new Error('a subject-count mismatch must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['adult_safety_violation']}))throw new Error('adult safety failures must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['ambiguous_age']}))throw new Error('custom-character age failures must remain terminal');
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['ambiguous_age']},{allowOfficialAgePresentationWarning:true}))throw new Error('official catalog youthful-adult presentation must not stay terminal');
  if(canDeliverQualityRetryWithWarnings({status:'pass',reasonCodes:[]}))throw new Error('passing results do not need warning fallback');
});

Deno.test('a first SFW candidate may keep harmless scene drift without hiding hard defects',()=>{
  if(!shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['face_too_small','world_mismatch','time_mismatch']},adultAuthorized:false}))throw new Error('a wider SFW scene and setting drift should not fail an otherwise usable paid photo');
  if(shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['identity_mismatch','time_mismatch']},adultAuthorized:false}))throw new Error('identity mismatch must still receive correction or rejection');
  if(shouldDeliverFirstImageQualityCandidateWithWarnings({verdict:{status:'fail',reasonCodes:['world_mismatch']},adultAuthorized:true}))throw new Error('adult output must retain its stricter first-candidate review');
});

Deno.test('an unavailable quality reviewer never erases a provider-approved SFW photo',()=>{
  if(!shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:false,verdict:{status:'unavailable',reasonCodes:[]}}))throw new Error('SFW review outages must fail open for delivery');
  if(shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:true,verdict:{status:'unavailable',reasonCodes:[]}}))throw new Error('adult review outages must remain fail closed');
  if(shouldDeliverSfwWhenQualityReviewIsUnavailable({adultAuthorized:false,verdict:{status:'fail',reasonCodes:['multiple_subjects']}}))throw new Error('an actual hard verdict must not be treated as a reviewer outage');
});

Deno.test('a corrected SFW candidate is delivered with subjective warnings but never hard defects',()=>{
  if(!canDeliverFinalSfwQualityCandidateWithWarnings({status:'fail',reasonCodes:['face_low_detail','non_photorealistic','identity_mismatch','time_mismatch']}))throw new Error('subjective SFW misses should not erase the corrected result');
  for(const reason of ['face_distortion','multiple_subjects','subject_count_mismatch','identity_swap','malformed_hands','duplicate_body_parts','sexual_content','adult_safety_violation','ambiguous_age','embedded_reference']){
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

Deno.test('terminal age and safety rejection is custom-character only',()=>{
  if(!isCustomCharacterTerminalQualityFailure(['ambiguous_age'],true))throw new Error('custom companions must fail closed on ambiguous_age');
  if(!isCustomCharacterTerminalQualityFailure(['adult_safety_violation'],true))throw new Error('custom companions must fail closed on adult safety');
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
