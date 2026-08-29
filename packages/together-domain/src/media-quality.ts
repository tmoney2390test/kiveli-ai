export type MediaQualityVerdict={status:'pass'|'fail'|'unavailable';reasonCodes:string[]};

export function enforceMediaQualityRequirements(verdict:MediaQualityVerdict,input:{requiresVisibleSpecificAnatomy:boolean;requiresWorldVerification?:boolean}):MediaQualityVerdict{
  if(input.requiresVisibleSpecificAnatomy&&verdict.status==='unavailable')return{status:'fail',reasonCodes:['requested_anatomy_unverified']};
  if(input.requiresWorldVerification&&verdict.status==='unavailable')return{status:'fail',reasonCodes:['world_unverified']};
  return verdict;
}

const KNOWN_REASONS=[
  'face_distortion','face_blur','face_low_detail','face_too_small','duplicate_features',
  'malformed_hands','digit_error','limb_distortion','joint_distortion','torso_distortion',
  'body_proportion_error','duplicate_body_parts','anatomy_low_detail',
  'requested_anatomy_missing','requested_anatomy_unverified',
  'pose_mismatch','face_direction_mismatch',
  'embedded_reference','rendered_text','multiple_subjects','subject_count_mismatch','identity_mismatch','identity_swap',
  'sexual_content',
  'world_mismatch','location_mismatch','earth_leakage','world_unverified',
] as const;

export function parseMediaQualityVerdict(output:unknown):MediaQualityVerdict{
  const serialized=typeof output==='string'?output:output==null?'':JSON.stringify(output)??'';
  const text=serialized.replace(/[`"']/g,'').trim();
  if(/^PASS\b/i.test(text))return{status:'pass',reasonCodes:[]};
  if(!/^FAIL\b/i.test(text))return{status:'unavailable',reasonCodes:[]};
  const lower=text.toLowerCase();
  const reasons=KNOWN_REASONS.filter((reason)=>lower.includes(reason)||lower.includes(reason.replaceAll('_',' ')));
  return{status:'fail',reasonCodes:reasons.length?[...reasons]:['face_distortion']};
}
