import { describe, expect, it } from 'vitest';
import { authenticatedRoutePathname, effectiveWebEntryHref, entryPathname, shouldConsumeWebEntry, shouldRecoverWebEntry } from './webEntryRoute';

describe('captured web entry routes', () => {
  it('preserves query parameters while comparing the pathname', () => {
    expect(entryPathname('/settings?section=account')).toBe('/settings');
  });

  it('recovers an authenticated deep link if static hydration falls back home', () => {
    expect(shouldRecoverWebEntry({ entryHref: '/settings?section=account', browserPathname: '/' })).toBe(true);
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/home' })).toBe(true);
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/settings', routerPathname: '/' })).toBe(true);
  });

  it('does not interfere once the intended route is active', () => {
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/settings', routerPathname: '/settings' })).toBe(false);
    expect(shouldRecoverWebEntry({ entryHref: '/', browserPathname: '/' })).toBe(false);
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/moments' })).toBe(false);
  });

  it('drops a captured alias after an intentional redirect consumes it', () => {
    expect(effectiveWebEntryHref('/quick-start', false)).toBe('/quick-start');
    expect(effectiveWebEntryHref('/quick-start', true)).toBeNull();
  });

  it('keeps a deep link until its route and authenticated snapshot are both ready',()=>{
    expect(shouldConsumeWebEntry({entryHref:'/explore?world=eos-meridian',browserPathname:'/explore',routerPathname:'/explore',snapshotReady:false})).toBe(false);
    expect(shouldConsumeWebEntry({entryHref:'/explore?world=eos-meridian',browserPathname:'/explore',routerPathname:'/',snapshotReady:true})).toBe(false);
    expect(shouldConsumeWebEntry({entryHref:'/explore?world=eos-meridian',browserPathname:'/home',routerPathname:'/home',snapshotReady:true})).toBe(false);
    expect(shouldConsumeWebEntry({entryHref:'/explore?world=eos-meridian',browserPathname:'/explore',routerPathname:'/explore',snapshotReady:true})).toBe(true);
  });

  it('uses the live router after entry hydration so the desktop shell appears on first login', () => {
    expect(authenticatedRoutePathname({
      platform: 'web',
      routerPathname: '/home',
      browserPathname: '/auth',
      capturedEntryHref: null,
    })).toBe('/home');
  });

  it('keeps the browser deep link authoritative while the captured entry is hydrating', () => {
    expect(authenticatedRoutePathname({
      platform: 'web',
      routerPathname: '/home',
      browserPathname: '/moments',
      capturedEntryHref: '/moments',
    })).toBe('/moments');
    expect(authenticatedRoutePathname({
      platform: 'ios',
      routerPathname: '/home',
      browserPathname: '/moments',
      capturedEntryHref: '/moments',
    })).toBe('/home');
  });
});
