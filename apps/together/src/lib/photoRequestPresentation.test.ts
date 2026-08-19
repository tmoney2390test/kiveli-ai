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
  });

  it('does not imply generation for a hard-blocked request', () => {
    expect(shouldShowPhotoGenerationPending('send me an underage photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me a photo that looks exactly like a celebrity')).toBe(false);
  });

  it('ignores ordinary conversation that is not requesting media', () => {
    expect(shouldShowPhotoGenerationPending('what are you doing tonight?')).toBe(false);
  });
});
