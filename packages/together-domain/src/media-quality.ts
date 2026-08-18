export type MediaQualityVerdict={status:'pass'|'fail'|'unavailable';reasonCodes:string[]};

const KNOWN_REASONS=['face_distortion','face_blur','face_low_detail','face_too_small','duplicate_features','embedded_reference','rendered_text','multiple_subjects'] as const;

export function parseMediaQualityVerdict(output:unknown):MediaQualityVerdict{
  const serialized=typeof output==='string'?output:output==null?'':JSON.stringify(output)??'';
  const text=serialized.replace(/[`"']/g,'').trim();
  if(/^PASS\b/i.test(text))return{status:'pass',reasonCodes:[]};
  if(!/^FAIL\b/i.test(text))return{status:'unavailable',reasonCodes:[]};
  const lower=text.toLowerCase();
  const reasons=KNOWN_REASONS.filter((reason)=>lower.includes(reason)||lower.includes(reason.replaceAll('_',' ')));
  return{status:'fail',reasonCodes:reasons.length?[...reasons]:['face_distortion']};
}
