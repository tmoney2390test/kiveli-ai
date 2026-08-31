import { describe, expect, it } from 'vitest';
import { isSettingsPath, shouldRenderSettingsRoute, shouldUseDesktopSettingsLayout } from './settingsRoute';

describe('settings route visibility', () => {
  it('renders the settings overlay only on the settings route', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/')).toBe(true);
    expect(isSettingsPath('/(tabs)/settings')).toBe(true);
    expect(isSettingsPath('/')).toBe(false);
    expect(isSettingsPath('/home')).toBe(false);
    expect(isSettingsPath('/moments')).toBe(false);
    expect(isSettingsPath('/moment/123')).toBe(false);
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
      browserPathname: '/moments',
    })).toBe(false);
  });

  it('uses the router pathname on native', () => {
    expect(shouldRenderSettingsRoute({
      platform: 'ios',
      routerPathname: '/settings',
      browserPathname: '/moments',
    })).toBe(true);
  });

  it('keeps the static and first browser render on the same layout', () => {
    expect(shouldUseDesktopSettingsLayout({ platform: 'web', width: 1440, webHydrated: false })).toBe(false);
    expect(shouldUseDesktopSettingsLayout({ platform: 'web', width: 1440, webHydrated: true })).toBe(true);
    expect(shouldUseDesktopSettingsLayout({ platform: 'web', width: 390, webHydrated: true })).toBe(false);
    expect(shouldUseDesktopSettingsLayout({ platform: 'ios', width: 1024, webHydrated: false })).toBe(true);
  });
});
