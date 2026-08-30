import { describe, expect, it } from 'vitest';
import { entryPathname, shouldRecoverWebEntry } from './webEntryRoute';

describe('captured web entry routes', () => {
  it('preserves query parameters while comparing the pathname', () => {
    expect(entryPathname('/settings?section=account')).toBe('/settings');
  });

  it('recovers an authenticated deep link if static hydration falls back home', () => {
    expect(shouldRecoverWebEntry({ entryHref: '/settings?section=account', browserPathname: '/' })).toBe(true);
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/home' })).toBe(true);
  });

  it('does not interfere once the intended route is active', () => {
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/settings' })).toBe(false);
    expect(shouldRecoverWebEntry({ entryHref: '/', browserPathname: '/' })).toBe(false);
    expect(shouldRecoverWebEntry({ entryHref: '/settings', browserPathname: '/stories' })).toBe(false);
  });
});
