import { describe, expect, it, vi } from 'vitest';
import { isTransientRequestFailure, withIdempotentRetry } from './requestRetry';

describe('idempotent request retry', () => {
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
