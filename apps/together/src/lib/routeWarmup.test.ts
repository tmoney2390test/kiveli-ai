import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeRouteIntent, markRouteIntent, resetRouteWarmupForTests, routePath, scheduleCoreRouteWarmup, warmRoute } from './routeWarmup';

describe('route warmup', () => {
  afterEach(() => { resetRouteWarmupForTests(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    expect(prefetch.mock.calls.map(([href]) => href)).toEqual(['/home', '/chat-tab?messages=1', '/explore']);
    cancel();
    vi.runAllTimers();
    expect(prefetch).toHaveBeenCalledTimes(3);
  });

  it('retries failed downloads without an old rejection clearing a newer attempt', async () => {
    let reject!: (reason: Error) => void;
    expect(warmRoute('/explore', () => new Promise((_, fail) => { reject = fail; }))).toBe(true);
    resetRouteWarmupForTests();
    const prefetch = vi.fn();
    expect(warmRoute('/explore', prefetch)).toBe(true);
    reject(new Error('offline'));
    await Promise.resolve();
    expect(warmRoute('/explore', prefetch)).toBe(false);
    expect(warmRoute('/moments', () => Promise.reject(new Error('offline')))).toBe(true);
    await Promise.resolve();
    expect(warmRoute('/moments', prefetch)).toBe(true);
    expect(warmRoute('/home', () => { throw new Error('offline'); })).toBe(false);
    expect(warmRoute('/home', prefetch)).toBe(true);
  });

  it('pauses hidden tabs and data saver, then resumes without a burst', () => {
    vi.useFakeTimers();
    const page = Object.assign(new EventTarget(), { hidden: true });
    const connection = Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' });
    vi.stubGlobal('document', page);
    vi.stubGlobal('navigator', { onLine: true, connection });
    const prefetch = vi.fn();
    const cancel = scheduleCoreRouteWarmup(prefetch, 100, 50);
    vi.advanceTimersByTime(1000);
    expect(prefetch).not.toHaveBeenCalled();
    page.hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(50);
    expect(prefetch).toHaveBeenCalledTimes(1);
    connection.saveData = true;
    connection.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1000);
    expect(prefetch).toHaveBeenCalledTimes(1);
    // Intent-driven prefetch remains available even with data saver on.
    expect(warmRoute('/subscription', prefetch)).toBe(true);
    connection.saveData = false;
    connection.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(50);
    expect(prefetch.mock.calls.at(-1)?.[0]).toBe('/chat-tab?messages=1');
    cancel();
    page.dispatchEvent(new Event('visibilitychange'));
    vi.runAllTimers();
    expect(prefetch).toHaveBeenCalledTimes(3);
  });

  it('waits for browser idle time and cancels pending idle work on unmount', () => {
    vi.useFakeTimers();
    const browser = Object.assign(new EventTarget(), { requestIdleCallback: vi.fn(() => 12), cancelIdleCallback: vi.fn() });
    vi.stubGlobal('window', browser);
    const prefetch = vi.fn();
    const cancel = scheduleCoreRouteWarmup(prefetch, 100, 50);
    vi.advanceTimersByTime(100);
    expect(browser.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(prefetch).not.toHaveBeenCalled();
    cancel();
    expect(browser.cancelIdleCallback).toHaveBeenCalledWith(12);
  });

  it('supports the native window global without browser event methods', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const prefetch = vi.fn();
    const cancel = scheduleCoreRouteWarmup(prefetch, 100, 50);
    vi.advanceTimersByTime(100);
    expect(prefetch).toHaveBeenCalledWith('/home');
    expect(cancel).not.toThrow();
  });

  it.each([{ onLine: false }, { onLine: true, connection: { effectiveType: '2g' } }])('does not auto-prefetch on a constrained connection: %j', (network) => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...network, connection: Object.assign(new EventTarget(), network.connection) });
    const prefetch = vi.fn();
    const cancel = scheduleCoreRouteWarmup(prefetch, 100, 50);
    vi.advanceTimersByTime(5000);
    expect(prefetch).not.toHaveBeenCalled();
    cancel();
  });

  it('measures only the matching navigation intent once', () => {
    markRouteIntent('/explore?world=vesper', 1000);
    expect(consumeRouteIntent('/home', 1050)).toBeNull();
    expect(consumeRouteIntent('/explore', 1124)).toBe(124);
    expect(consumeRouteIntent('/explore', 1200)).toBeNull();
  });
});
