import{describe,expect,it}from'vitest';
import{buildWaveSpeedRequestBody,normalizeWaveSpeedOutputs}from'./wavespeed.ts';

describe('WaveSpeed request construction',()=>{
  it('does not inject model-specific flags into a request by default',()=>{
    expect(buildWaveSpeedRequestBody({images:['https://example.com/photo.jpg'],text:'Inspect it'})).toEqual({images:['https://example.com/photo.jpg'],text:'Inspect it'});
  });

  it('adds only explicitly requested model options',()=>{
    expect(buildWaveSpeedRequestBody({prompt:'portrait'},{enableBase64Output:false})).toEqual({prompt:'portrait',enable_base64_output:false});
    expect(buildWaveSpeedRequestBody({text:'Inspect it'},{enableSyncMode:true})).toEqual({text:'Inspect it',enable_sync_mode:true});
  });
});

describe('WaveSpeed output normalization',()=>{
  it('separates text answers from generated asset URLs',()=>{
    expect(normalizeWaveSpeedOutputs(['PASS','https://example.com/photo.webp'])).toEqual({urlOutputs:['https://example.com/photo.webp'],textOutputs:['PASS']});
  });

  it('extracts answers and URLs from structured provider outputs',()=>{
    expect(normalizeWaveSpeedOutputs([{answer:'FAIL: face_blur'},{output:{url:'https://example.com/photo.jpg'}}])).toEqual({urlOutputs:['https://example.com/photo.jpg'],textOutputs:['FAIL: face_blur']});
  });
});
