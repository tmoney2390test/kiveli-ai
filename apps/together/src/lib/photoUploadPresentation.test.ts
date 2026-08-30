import{describe,expect,it}from'vitest';
import{photoUploadPresentation,type PhotoUploadPhase}from'./photoUploadPresentation';

describe('photo upload presentation',()=>{
  it('advances through meaningful private upload stages',()=>{
    const phases:PhotoUploadPhase[]=['preparing','uploading','processing','sending'];
    expect(phases.map((phase)=>photoUploadPresentation(phase).progress)).toEqual([.14,.46,.76,.94]);
    expect(phases.every((phase)=>photoUploadPresentation(phase).busy)).toBe(true);
  });
  it('makes a failed upload explicitly retryable without discarding the preview',()=>{
    expect(photoUploadPresentation('failed')).toMatchObject({label:'Upload failed',busy:false,retry:true});
  });
});
