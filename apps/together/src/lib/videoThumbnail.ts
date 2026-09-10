/** Seek past an empty opening sample, without starting playback or changing signed URLs. */
export function videoThumbnailTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(0.1, duration / 2) : 0;
}

export function prepareVideoThumbnail(video: Pick<HTMLVideoElement, 'pause' | 'muted' | 'duration' | 'currentTime'>) {
  video.muted = true;
  video.pause();
  const time = videoThumbnailTime(video.duration);
  if (time > 0) video.currentTime = time;
}

export function videoThumbnailHasFrame(video: Pick<HTMLVideoElement, 'readyState' | 'seeking' | 'videoWidth'>): boolean {
  return video.readyState >= 2 && !video.seeking && video.videoWidth > 0;
}

export function videoThumbnailAttributes(uri: string | undefined, posterUri?: string | null) {
  return {
    src: uri, poster: posterUri ?? undefined, muted: true, defaultMuted: true,
    autoPlay: false, controls: false, playsInline: true, preload: 'auto' as const,
    'webkit-playsinline': 'true', 'aria-hidden': true as const, tabIndex: -1,
  };
}
