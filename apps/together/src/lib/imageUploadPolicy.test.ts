import{describe,expect,it}from'vitest';
import{normalizedJpegName,userImageNormalizationError,userImageResize,validateUserImageSource}from'./imageUploadPolicy';

describe('user image upload policy',()=>{
  it('keeps small images and bounds either long edge',()=>{
    expect(userImageResize({width:1200,height:1600})).toBeNull();
    expect(userImageResize({width:6000,height:4000})).toEqual({width:2048});
    expect(userImageResize({width:3000,height:5000})).toEqual({height:2048});
  });
  it('rejects oversized compressed files and decoded images',()=>{
    expect(()=>validateUserImageSource({byteSize:10*1024*1024+1,width:100,height:100})).toThrow('10 MB');
    expect(()=>validateUserImageSource({byteSize:100,width:10_000,height:10_000})).toThrow('smaller dimensions');
  });
  it('creates a safe JPEG name',()=>expect(normalizedJpegName('My vacation photo.PNG')).toBe('My-vacation-photo.jpg'));
  it('gives HEIC users a compatible export recovery path',()=>{
    expect(userImageNormalizationError('IMG_001.HEIC')).toContain('Most Compatible');
    expect(userImageNormalizationError('photo.svg')).toContain('JPEG, PNG, or WebP');
  });
});
