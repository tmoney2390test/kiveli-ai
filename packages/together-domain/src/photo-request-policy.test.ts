import { describe, expect, it } from 'vitest';
import { photoRequestRestriction, restrictedPhotoTextCanContinueAsChat } from './photo-request-policy';

describe('photo request authorization before prompt rewriting', () => {
  it.each(['Send me a nude photo', 'Send a naked selfie', 'Make this photo topless'])('blocks unauthorized authored intent: %s', (requestText) => {
    expect(photoRequestRestriction({ requestText, adultPipelineAuthorized: false })?.code).toBe('PHOTO_CONTENT_BLOCKED');
  });
  it('checks authored text even when an earlier classifier calls the request standard', () => {
    expect(photoRequestRestriction({ requestText: 'Send a nude photo', requestedContentLevel: 'standard' })).not.toBeNull();
  });
  it('blocks a known explicit offer without requiring its original prompt', () => {
    expect(photoRequestRestriction({ requestedContentLevel: 'explicit' })).not.toBeNull();
  });
  it('preserves authorized web requests and ordinary native photos', () => {
    expect(photoRequestRestriction({ requestText: 'Send a nude photo', adultPipelineAuthorized: true })).toBeNull();
    expect(photoRequestRestriction({ requestText: 'Send a photo in your blue dress' })).toBeNull();
    expect(photoRequestRestriction({ requestText: 'Send a romantic photo by the lake' })).toBeNull();
    expect(photoRequestRestriction({ requestText: 'Send me a photo showing exactly this: Wearing a bikini eating an apple', adultPipelineAuthorized: false })).toBeNull();
    expect(photoRequestRestriction({ requestText: 'Send me a photo in a see-through bikini', adultPipelineAuthorized: false })).not.toBeNull();
  });
  it('continues restricted photo-like wording as chat without diverting safe photo requests', () => {
    expect(restrictedPhotoTextCanContinueAsChat('Send me a nude pic')).toBe(true);
    expect(restrictedPhotoTextCanContinueAsChat('Send me a pic of you in your underwear')).toBe(true);
    expect(restrictedPhotoTextCanContinueAsChat('Can I see a nude photo?')).toBe(true);
    expect(restrictedPhotoTextCanContinueAsChat('Send me a photo in your blue dress')).toBe(false);
    expect(restrictedPhotoTextCanContinueAsChat('I liked the pic you sent yesterday')).toBe(false);
  });
});
