import { assertStringIncludes } from 'jsr:@std/assert@1';
import { authorizedAdultImageSafetyRule, canDeliverQualityRetryWithWarnings, generatedImagePhotorealismRule, requestedAnatomyQualityRule, requestedGenitalAnatomyQualityRule } from './together-media-quality.ts';

Deno.test('solo adult quality checks do not confuse explicit posing with non-consent',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Elena Petrova',age:27}}]);
  assertStringIncludes(rule,'canonical age 27');
  assertStringIncludes(rule,'This is a solo image');
  assertStringIncludes(rule,'explicit anatomy');
  assertStringIncludes(rule,'not evidence of non-consent');
  assertStringIncludes(rule,'Fail ambiguous_age');
  assertStringIncludes(rule,'sexual violence');
  assertStringIncludes(rule,'sexual deepfake');
});

Deno.test('partnered adult quality checks retain strict participant and consent rules',()=>{
  const rule=authorizedAdultImageSafetyRule([{companion:{name:'Elena Petrova',age:27}}],true);
  assertStringIncludes(rule,'anonymous original fictional adult age 25 or older');
  assertStringIncludes(rule,'visible indications of coercion');
  assertStringIncludes(rule,'A still image does not need to display affirmative-consent evidence');
});

Deno.test('a second safe candidate may be delivered with composition warnings',()=>{
  if(!canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch','face_direction_mismatch','world_mismatch']}))throw new Error('safe composition-only drift should be deliverable after the retry');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch']},{requiresExactRequestedComposition:true}))throw new Error('an explicit requested pose must not be silently accepted after a retry');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['pose_mismatch','identity_mismatch']}))throw new Error('identity failures must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'fail',reasonCodes:['adult_safety_violation']}))throw new Error('adult safety failures must remain terminal');
  if(canDeliverQualityRetryWithWarnings({status:'pass',reasonCodes:[]}))throw new Error('passing results do not need warning fallback');
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
