import {describe, expect, it, vi} from 'vitest';
import {prepareVideoThumbnail, videoThumbnailAttributes, videoThumbnailHasFrame, videoThumbnailTime} from './videoThumbnail';

describe('video thumbnail decoding', () => {
  it('loads a frame without autoplay, audio, controls or rewriting a signed URL', () => {
    const uri = 'https://media.example.test/video.mp4?token=unchanged';
    expect(videoThumbnailAttributes(uri)).toMatchObject({src: uri, autoPlay: false, muted: true, defaultMuted: true, controls: false, playsInline: true, preload: 'auto'});
  });
  it('does not load offscreen videos, but keeps their poster available', () => {
    expect(videoThumbnailAttributes(undefined, '/poster.jpg')).toMatchObject({src: undefined, poster: '/poster.jpg'});
  });
  it('seeks slightly past zero while remaining paused and muted', () => {
    const video = {pause: vi.fn(), muted: false, duration: 5, currentTime: 0};
    prepareVideoThumbnail(video);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video).toMatchObject({muted: true, currentTime: 0.1});
  });
  it('keeps preview seeks inside very short videos and ignores invalid durations', () => {
    expect(videoThumbnailTime(0.05)).toBe(0.025);
    for (const duration of [0, -1, NaN, Infinity]) expect(videoThumbnailTime(duration)).toBe(0);
  });
  it('does not confuse metadata or an unfinished seek with a decoded frame', () => {
    expect(videoThumbnailHasFrame({readyState: 1, seeking: false, videoWidth: 1920})).toBe(false);
    expect(videoThumbnailHasFrame({readyState: 2, seeking: true, videoWidth: 1920})).toBe(false);
    expect(videoThumbnailHasFrame({readyState: 2, seeking: false, videoWidth: 0})).toBe(false);
    expect(videoThumbnailHasFrame({readyState: 2, seeking: false, videoWidth: 1920})).toBe(true);
  });
});
