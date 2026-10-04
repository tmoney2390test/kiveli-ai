import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSceneBeforeSend } from './sceneResolveDeadline';

afterEach(() => vi.useRealTimers());

describe('resolveSceneBeforeSend', () => {
  it('lets chat continue when a scene lookup never returns', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = resolveSceneBeforeSend((receivedSignal) => {
      signal = receivedSignal;
      return new Promise<string>(() => {});
    }, 100);

    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });

  it('preserves a timely scene match without aborting it', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    await expect(resolveSceneBeforeSend((receivedSignal) => {
      signal = receivedSignal;
      return Promise.resolve('matched action');
    }, 100)).resolves.toBe('matched action');
    await vi.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(false);
  });
});
