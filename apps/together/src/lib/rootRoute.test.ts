import { describe, expect, it } from 'vitest';
import { isRootAppPath, rootEntryPresentation, shouldRunAuthenticatedIndexRedirect } from './rootRoute';

describe('root route', () => {
  it('never exposes the signed-out landing page before auth restoration settles', () => {
    expect(rootEntryPresentation({ authLoading: true, hasSession: false })).toBe('loading');
    expect(rootEntryPresentation({ authLoading: true, hasSession: true })).toBe('loading');
    expect(rootEntryPresentation({ authLoading: false, hasSession: false })).toBe('public');
    expect(rootEntryPresentation({ authLoading: false, hasSession: true })).toBe('authenticated');
  });

  it('allows the authenticated index redirect only on the actual root URL', () => {
    expect(isRootAppPath('/')).toBe(true);
    expect(isRootAppPath('')).toBe(true);
    expect(isRootAppPath('/home')).toBe(false);
    expect(isRootAppPath('/settings')).toBe(false);
    expect(isRootAppPath('/moments')).toBe(false);
  });

  it('uses the browser URL to suppress a stale web index redirect', () => {
    expect(shouldRunAuthenticatedIndexRedirect({
      platform: 'web',
      routerPathname: '/',
      browserPathname: '/moments',
    })).toBe(false);
    expect(shouldRunAuthenticatedIndexRedirect({
      platform: 'web',
      routerPathname: '/moments',
      browserPathname: '/',
    })).toBe(true);
  });

  it('uses the router pathname on native', () => {
    expect(shouldRunAuthenticatedIndexRedirect({
      platform: 'ios',
      routerPathname: '/',
      browserPathname: '/moments',
    })).toBe(true);
  });
});
