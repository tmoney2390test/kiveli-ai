import { afterEach, describe, expect, it, vi } from 'vitest';
import { coalescedRefresh } from './coalescedRefresh';

describe('chat refresh bursts', () => {
  afterEach(() => vi.useRealTimers());
  it('merges a burst and queues just one follow-up while a read is active', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const read = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const refresh = coalescedRefresh(read, 100);
    refresh.schedule(); refresh.schedule(); refresh.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(1);
    refresh.schedule(); refresh.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
    refresh.dispose(); finish();
  });
  it('does not fetch after leaving the conversation', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => {});
    const refresh = coalescedRefresh(read);
    refresh.schedule(); refresh.dispose(); refresh.schedule();
    await vi.runAllTimersAsync();
    expect(read).not.toHaveBeenCalled();
  });
});
