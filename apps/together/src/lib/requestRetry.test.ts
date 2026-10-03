import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTransientRequestFailure, withIdempotentRetry } from './requestRetry';

describe('idempotent request retry', () => {
  afterEach(() => vi.useRealTimers());
  it('does not start a cancelled request', async () => {
    const controller = new AbortController(), operation = vi.fn();
    controller.abort();
    await expect(withIdempotentRetry(operation, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('cancels backoff promptly without attempting another read', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const pending = withIdempotentRetry(operation, { delayMs: 5000, signal: controller.signal });
    const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    expect(vi.getTimerCount()).toBe(0);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not return a late successful result after cancellation', async () => {
    const controller = new AbortController();
    let finish!: (value: string) => void;
    const pending = withIdempotentRetry(() => new Promise<string>(resolve => { finish = resolve; }), { signal: controller.signal });
    controller.abort();
    finish('old conversation');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('recognizes browser and server-declared transient failures', () => {
    expect(isTransientRequestFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientRequestFailure({ retryable: true, message: 'Temporary upstream failure' })).toBe(true);
    expect(isTransientRequestFailure(new Error('Validation failed'))).toBe(false);
  });

  it('retries a transient idempotent operation without changing its result', async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockRejectedValueOnce(new TypeError('NetworkError')).mockResolvedValue({ id: 'saved-action' });
    const promise = withIdempotentRetry(operation, { delayMs: 10 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ id: 'saved-action' });
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry non-transient failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Not allowed'));
    await expect(withIdempotentRetry(operation, { delayMs: 0 })).rejects.toThrow('Not allowed');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
