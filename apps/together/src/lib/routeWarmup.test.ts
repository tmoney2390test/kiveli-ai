import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeRouteIntent, markRouteIntent, resetRouteWarmupForTests, routePath, scheduleCoreRouteWarmup, warmRoute } from './routeWarmup';

describe('route warmup', () => {
  afterEach(() => { resetRouteWarmupForTests(); vi.useRealTimers(); });

  it('normalizes tab routes and avoids duplicate prefetches', () => {
    const prefetch = vi.fn();
    expect(routePath('/(tabs)/moments?filter=Videos')).toBe('/moments');
    expect(warmRoute('/moments?filter=Videos', prefetch)).toBe(true);
    expect(warmRoute('/(tabs)/moments', prefetch)).toBe(false);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('warms core routes progressively instead of blocking first paint', () => {
    vi.useFakeTimers();
    const prefetch = vi.fn();
    const cancel = scheduleCoreRouteWarmup(prefetch, 100, 50);
    vi.advanceTimersByTime(99);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(101);
    expect(prefetch.mock.calls.map(([href]) => href)).toEqual(['/home', '/chat', '/chat-tab?messages=1']);
    cancel();
  });

  it('measures only the matching navigation intent once', () => {
    markRouteIntent('/explore?world=vesper', 1000);
    expect(consumeRouteIntent('/home', 1050)).toBeNull();
    expect(consumeRouteIntent('/explore', 1124)).toBe(124);
    expect(consumeRouteIntent('/explore', 1200)).toBeNull();
  });
});
