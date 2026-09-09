export type MediaMomentMode = 'share' | 'photo' | 'video';

export const MEDIA_MOMENT_OPTIONS: ReadonlyArray<{
  mode: MediaMomentMode;
  label: string;
}> = [
  { mode: 'share', label: 'Upload image' },
  { mode: 'photo', label: 'Take photo' },
  { mode: 'video', label: 'Take video' },
];

export function mediaMomentTitle(mode: MediaMomentMode): string {
  return mode === 'share' ? 'Share a moment' : 'Create a moment';
}

export function selfiePhotoRequest(spicyUnlocked: boolean): string {
  return spicyUnlocked
    ? 'Send me an explicit nude selfie from where you are, framed as either a close-up pose or a full-body pose.'
    : 'Send me a selfie from where you are.';
}

export function spicyUnavailableCopy(platform: string): { title: string; message: string } | null {
  if (platform === 'android') {
    return {
      title: 'Unavailable on Android',
      message: 'Adult photo generation is available on Kivelli.app.',
    };
  }
  if (platform === 'ios') {
    return {
      title: 'Unavailable on iOS',
      message: 'Adult photo generation is available on Kivelli.app.',
    };
  }
  return null;
}
