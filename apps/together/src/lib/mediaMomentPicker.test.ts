import { describe, expect, it } from 'vitest';
import { classifyPhotoIntent } from '@together/domain/src/media';
import { MEDIA_MOMENT_OPTIONS, mediaMomentTitle, selfiePhotoRequest, spicyUnavailableCopy } from './mediaMomentPicker';

describe('chat moment picker', () => {
  it('keeps the compact menu mapped to the existing share, photo, and video flows', () => {
    expect(MEDIA_MOMENT_OPTIONS).toEqual([
      { mode: 'share', label: 'Upload image' },
      { mode: 'photo', label: 'Take photo' },
      { mode: 'video', label: 'Take video' },
    ]);
    expect(mediaMomentTitle('share')).toBe('Share a moment');
    expect(mediaMomentTitle('photo')).toBe('Create a moment');
    expect(mediaMomentTitle('video')).toBe('Create a moment');
  });

  it('changes only the one-tap selfie request when spicy is unlocked', () => {
    expect(selfiePhotoRequest(false)).toBe('Send me a selfie from where you are.');
    expect(classifyPhotoIntent(selfiePhotoRequest(false)).requestedContentLevel).toBeUndefined();
    expect(classifyPhotoIntent(selfiePhotoRequest(true)).requestedContentLevel).toBe('explicit');
  });

  it('fails the spicy control closed on native surfaces', () => {
    expect(spicyUnavailableCopy('ios')).toEqual({
      title: 'Unavailable on iOS',
      message: 'Adult photo generation is available on Kivelli.app.',
    });
    expect(spicyUnavailableCopy('android')).toEqual({
      title: 'Unavailable on Android',
      message: 'Adult photo generation is available on Kivelli.app.',
    });
    expect(spicyUnavailableCopy('web')).toBeNull();
  });
});
