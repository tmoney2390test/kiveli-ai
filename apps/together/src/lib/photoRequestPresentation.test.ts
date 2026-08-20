import { describe, expect, it } from 'vitest';
import { shouldShowPhotoGenerationPending } from './photoRequestPresentation';

describe('photo request presentation', () => {
  it('shows immediate progress for ordinary contextual photo requests', () => {
    expect(shouldShowPhotoGenerationPending('send me a selfie')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your outfit')).toBe(true);
  });

  it('shows progress while server policy decides an adult photo request', () => {
    expect(shouldShowPhotoGenerationPending('send me a picture of your boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('send me a nude photo')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('can I see your breasts?')).toBe(true);
    expect(shouldShowPhotoGenerationPending('sbow me a picjtre of youe boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('Show me your pussy sitting on the couch legs spread open')).toBe(true);
  });

  it('does not imply generation for a hard-blocked request', () => {
    expect(shouldShowPhotoGenerationPending('send me an underage photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me a photo that looks exactly like a celebrity')).toBe(false);
  });

  it('ignores ordinary conversation that is not requesting media', () => {
    expect(shouldShowPhotoGenerationPending('what are you doing tonight?')).toBe(false);
    expect(shouldShowPhotoGenerationPending('you showed me your boobs yesterday')).toBe(false);
  });
});
