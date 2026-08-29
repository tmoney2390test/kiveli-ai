import { describe, expect, it } from 'vitest';
import { isSettingsPath, shouldRenderSettingsRoute } from './settingsRoute';

describe('settings route visibility', () => {
  it('renders the settings overlay only on the settings route', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/')).toBe(true);
    expect(isSettingsPath('/(tabs)/settings')).toBe(true);
    expect(isSettingsPath('/')).toBe(false);
    expect(isSettingsPath('/home')).toBe(false);
    expect(isSettingsPath('/stories')).toBe(false);
    expect(isSettingsPath('/stories/the-last-night-in-vespormoor')).toBe(false);
  });

  it('uses the browser URL as the canonical web route during stack transitions', () => {
    expect(shouldRenderSettingsRoute({
      platform: 'web',
      routerPathname: '/home',
      browserPathname: '/settings',
    })).toBe(true);
    expect(shouldRenderSettingsRoute({
      platform: 'web',
      routerPathname: '/settings',
      browserPathname: '/stories',
    })).toBe(false);
  });

  it('uses the router pathname on native', () => {
    expect(shouldRenderSettingsRoute({
      platform: 'ios',
      routerPathname: '/settings',
      browserPathname: '/stories',
    })).toBe(true);
  });
});
