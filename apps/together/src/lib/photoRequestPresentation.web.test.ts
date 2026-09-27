import{describe,expect,it}from'vitest';
import{photoOffersWithoutVisibleMessages,shouldShowPhotoGenerationPending}from'./photoRequestPresentation.web';

describe('website photo request presentation',()=>{
  it('lets the server decide otherwise eligible adult-mode photo requests',()=>{
    expect(shouldShowPhotoGenerationPending('send me a nude photo')).toBe(true);
  });
  it('does not imply generation for prohibited or real-person requests',()=>{
    expect(shouldShowPhotoGenerationPending('send me an underage photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('make a photo that looks exactly like a celebrity')).toBe(false);
  });
  it('leaves relationship statements in chat instead of showing photo progress',()=>{
    expect(shouldShowPhotoGenerationPending('Sora you don’t want to see me you said it yourself')).toBe(false);
    expect(shouldShowPhotoGenerationPending('Don’t send me a photo.')).toBe(false);
    expect(shouldShowPhotoGenerationPending('You don’t want to see me. Send me a selfie.')).toBe(true);
  });
  it('exports shared presentation helpers without resolving back to itself',()=>{
    expect(typeof photoOffersWithoutVisibleMessages).toBe('function');
    expect(photoOffersWithoutVisibleMessages([],new Set())).toEqual([]);
  });
});
