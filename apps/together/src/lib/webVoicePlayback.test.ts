import { describe, expect, it, vi } from 'vitest';
import { playBrowserVoice } from './webVoicePlayback';

describe('browser voice playback', () => {
  it('calls play during the tap and starts a ready note', async () => {
    const audio = { ended: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined) };
    const started = playBrowserVoice(audio);
    expect(audio.play).toHaveBeenCalledOnce();
    await expect(started).resolves.toBe(true);
  });

  it('rewinds a finished note before replaying it', async () => {
    const audio = { ended: true, currentTime: 12, play: vi.fn().mockResolvedValue(undefined) };
    await expect(playBrowserVoice(audio)).resolves.toBe(true);
    expect(audio.currentTime).toBe(0);
  });

  it('reports a rejected play attempt and allows another tap', async () => {
    const audio = { ended: false, currentTime: 0, play: vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValueOnce(undefined) };
    await expect(playBrowserVoice(audio)).resolves.toBe(false);
    await expect(playBrowserVoice(audio)).resolves.toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });
});
