import{describe,expect,it}from'vitest';
import{parseMediaQualityVerdict}from'./media-quality.ts';

describe('generated media quality verdicts',()=>{
  it('accepts a strict pass',()=>expect(parseMediaQualityVerdict('PASS')).toEqual({status:'pass',reasonCodes:[]}));
  it('retains only known failure reasons',()=>expect(parseMediaQualityVerdict('FAIL: face_distortion, embedded_reference')).toEqual({status:'fail',reasonCodes:['face_distortion','embedded_reference']}));
  it('retains low-detail face failures',()=>expect(parseMediaQualityVerdict('FAIL: face_low_detail, face_too_small')).toEqual({status:'fail',reasonCodes:['face_low_detail','face_too_small']}));
  it('fails open when the provider does not follow the verdict contract',()=>expect(parseMediaQualityVerdict('The image seems okay.')).toEqual({status:'unavailable',reasonCodes:[]}));
});
