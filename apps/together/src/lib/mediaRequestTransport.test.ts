import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVideoSubmissionIdentity, mediaRequestTimeoutMs, runMediaRequest } from './mediaRequestTransport';

const input = { action: 'video_direct_generate', requestId: 'video-request-123', settings: { model: 'minimax-h3-spicy' } };
const timeoutError = (message: string) => Object.assign(new Error(message), { code: 'REQUEST_TIMEOUT', retryable: true });
afterEach(() => vi.useRealTimers());

describe('media request transport', () => {
  it('gives both video entry points time for validation and quote admission without slowing ordinary media controls', () => {
    expect(mediaRequestTimeoutMs(input)).toBe(90_000);
    expect(mediaRequestTimeoutMs({ action: 'animate' })).toBe(90_000);
    for (const action of ['accept', 'decline', 'status', 'list_library', 'video_options']) expect(mediaRequestTimeoutMs({ action })).toBe(15_000);
  });

  it('accepts a video reservation that arrives after the old 15-second cutoff', async () => {
    vi.useFakeTimers();
    const request = runMediaRequest(input, (signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
      setTimeout(() => resolve({ mediaId: 'reserved-video' }), 25_000);
    }), timeoutError);
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(request).resolves.toEqual({ mediaId: 'reserved-video' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replays a lost response with the same ID/model and gets the already-reserved job without charging twice', async () => {
    const jobs = new Map<string, string>();
    let charges = 0;
    const invoke = vi.fn(() => {
      if (!jobs.has(input.requestId)) {
        jobs.set(input.requestId, 'reserved-video'); charges++;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({ mediaId: jobs.get(input.requestId), model: input.settings.model });
    });
    await expect(runMediaRequest(input, invoke, timeoutError)).resolves.toEqual({ mediaId: 'reserved-video', model: 'minimax-h3-spicy' });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(charges).toBe(1);
  });

  it('bounds timeout retries and reports uncertainty instead of claiming the job failed', async () => {
    vi.useFakeTimers();
    const invoke = vi.fn((signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const request = runMediaRequest(input, invoke, timeoutError);
    const result = expect(request).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', message: 'We could not confirm your video request yet. Retry to check the same request.' });
    await vi.advanceTimersByTimeAsync(180_000);
    await result;
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replay validation failures, ordinary media mutations, or requests without IDs', async () => {
    const forbidden = Object.assign(new Error('Not allowed'), { retryable: false });
    const denied = vi.fn().mockRejectedValue(forbidden);
    await expect(runMediaRequest(input, denied, timeoutError)).rejects.toBe(forbidden);
    expect(denied).toHaveBeenCalledTimes(1);
    for (const payload of [{ action: 'accept', requestId: 'offer-123' }, { action: 'animate' }]) {
      const invoke = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(runMediaRequest(payload, invoke, timeoutError)).rejects.toThrow('Failed to fetch');
      expect(invoke).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps manual retries stable and changes the ID for a new model, prompt, or successful next request', () => {
    const createId = vi.fn().mockReturnValueOnce('first').mockReturnValueOnce('second').mockReturnValueOnce('third').mockReturnValueOnce('fourth');
    const identity = createVideoSubmissionIdentity(createId);
    const settings = { model: 'minimax-h3-spicy', prompt: 'Wave at the camera' };
    expect(identity.requestId(settings)).toBe('first');
    expect(identity.requestId({ ...settings })).toBe('first');
    expect(identity.requestId({ ...settings, model: 'seedance-1-5-pro-sfw' })).toBe('second');
    expect(identity.requestId({ ...settings, prompt: 'Smile at the camera' })).toBe('third');
    identity.clear();
    expect(identity.requestId({ ...settings, prompt: 'Smile at the camera' })).toBe('fourth');
  });
});
