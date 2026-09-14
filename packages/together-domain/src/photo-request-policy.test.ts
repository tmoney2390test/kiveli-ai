import { describe, expect, it } from 'vitest';
import { photoRequestRestriction } from './photo-request-policy';

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
  });
});
