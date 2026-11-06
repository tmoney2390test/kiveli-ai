import { describe, expect, it } from 'vitest';
import { dialoguePhotoRouting } from './dialoguePhotoRouting';

describe('dialogue photo routing', () => {
  it('treats a declined photo request as ordinary text', () => {
    expect(dialoguePhotoRouting('Send me a nude photo', 'respond_to_declined_photo', true)).toEqual({
      photoRequest: false,
      explicitWebsitePhoto: false,
    });
  });

  it('retains normal routing for new photo requests', () => {
    expect(dialoguePhotoRouting('Send me a nude photo', undefined, true)).toEqual({
      photoRequest: true,
      explicitWebsitePhoto: true,
    });
    expect(dialoguePhotoRouting('How was your day?', undefined, true).photoRequest).toBe(false);
  });
});
