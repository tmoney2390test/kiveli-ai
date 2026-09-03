import{describe,expect,it}from'vitest';
import{enforceMediaQualityRequirements,parseMediaQualityVerdict}from'./media-quality.ts';

describe('generated media quality verdicts',()=>{
  it('accepts a strict pass',()=>expect(parseMediaQualityVerdict('PASS')).toEqual({status:'pass',reasonCodes:[]}));
  it('accepts a strict verdict after a complete leaked reasoning block',()=>expect(parseMediaQualityVerdict('<think>private analysis</think>\nPASS')).toEqual({status:'pass',reasonCodes:[]}));
  it('keeps truncated leaked reasoning unavailable',()=>expect(parseMediaQualityVerdict('<think>PASS might apply')).toEqual({status:'unavailable',reasonCodes:[]}));
  it('retains only known failure reasons',()=>expect(parseMediaQualityVerdict('FAIL: face_distortion, embedded_reference')).toEqual({status:'fail',reasonCodes:['face_distortion','embedded_reference']}));
  it('retains low-detail face failures',()=>expect(parseMediaQualityVerdict('FAIL: face_low_detail, face_too_small')).toEqual({status:'fail',reasonCodes:['face_low_detail','face_too_small']}));
  it('retains body-anatomy failures',()=>expect(parseMediaQualityVerdict('FAIL: malformed_hands, limb_distortion, body_proportion_error, anatomy_low_detail')).toEqual({status:'fail',reasonCodes:['malformed_hands','limb_distortion','body_proportion_error','anatomy_low_detail']}));
  it('retains malformed genital-anatomy failures',()=>expect(parseMediaQualityVerdict('FAIL: genital_anatomy_error')).toEqual({status:'fail',reasonCodes:['genital_anatomy_error']}));
  it('retains non-photographic style failures',()=>expect(parseMediaQualityVerdict('FAIL: non_photorealistic')).toEqual({status:'fail',reasonCodes:['non_photorealistic']}));
  it('retains missing requested-anatomy failures',()=>expect(parseMediaQualityVerdict('FAIL: requested_anatomy_missing')).toEqual({status:'fail',reasonCodes:['requested_anatomy_missing']}));
  it('retains requested pose and face-direction failures',()=>expect(parseMediaQualityVerdict('FAIL: pose_mismatch, face_direction_mismatch')).toEqual({status:'fail',reasonCodes:['pose_mismatch','face_direction_mismatch']}));
  it('retains group subject and identity failures',()=>expect(parseMediaQualityVerdict('FAIL: subject_count_mismatch, identity_mismatch, identity_swap')).toEqual({status:'fail',reasonCodes:['subject_count_mismatch','identity_mismatch','identity_swap']}));
  it('retains production sexual-content failures',()=>expect(parseMediaQualityVerdict('FAIL: sexual_content')).toEqual({status:'fail',reasonCodes:['sexual_content']}));
  it('retains adult safety failures',()=>expect(parseMediaQualityVerdict('FAIL: adult_safety_violation, ambiguous_age')).toEqual({status:'fail',reasonCodes:['adult_safety_violation','ambiguous_age']}));
  it('retains world and location containment failures',()=>expect(parseMediaQualityVerdict('FAIL: world_mismatch, location_mismatch, earth_leakage')).toEqual({status:'fail',reasonCodes:['world_mismatch','location_mismatch','earth_leakage']}));
  it('marks a non-contract provider response unavailable for the delivery gate to resolve',()=>expect(parseMediaQualityVerdict('The image seems okay.')).toEqual({status:'unavailable',reasonCodes:[]}));
  it('fails closed when visible requested anatomy could not be verified',()=>expect(enforceMediaQualityRequirements({status:'unavailable',reasonCodes:[]},{requiresVisibleSpecificAnatomy:true})).toEqual({status:'fail',reasonCodes:['requested_anatomy_unverified']}));
  it('fails closed when canonical world containment could not be verified',()=>expect(enforceMediaQualityRequirements({status:'unavailable',reasonCodes:[]},{requiresVisibleSpecificAnatomy:false,requiresWorldVerification:true})).toEqual({status:'fail',reasonCodes:['world_unverified']}));
  it('fails closed when adult safety could not be independently verified',()=>expect(enforceMediaQualityRequirements({status:'unavailable',reasonCodes:[]},{requiresVisibleSpecificAnatomy:false,requiresAdultSafetyVerification:true})).toEqual({status:'fail',reasonCodes:['adult_safety_unverified']}));
  it('does not make ordinary photos fail closed when quality inspection is unavailable',()=>expect(enforceMediaQualityRequirements({status:'unavailable',reasonCodes:[]},{requiresVisibleSpecificAnatomy:false})).toEqual({status:'unavailable',reasonCodes:[]}));
});
