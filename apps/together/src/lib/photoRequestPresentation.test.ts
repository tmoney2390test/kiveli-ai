import { describe, expect, it } from 'vitest';
import { shouldShowPhotoGenerationPending } from './photoRequestPresentation';

describe('photo request presentation', () => {
  it('shows immediate progress for ordinary contextual photo requests', () => {
    expect(shouldShowPhotoGenerationPending('send me a selfie')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your outfit')).toBe(true);
  });

  it('does not imply that an explicit request has started generating', () => {
    expect(shouldShowPhotoGenerationPending('send me a picture of your boobs')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me a nude photo')).toBe(false);
  });

  it('ignores ordinary conversation that is not requesting media', () => {
    expect(shouldShowPhotoGenerationPending('what are you doing tonight?')).toBe(false);
  });
});
