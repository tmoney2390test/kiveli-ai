import { describe, expect, it } from 'vitest';
import {
  defaultDesktopSidebarExpanded,
  desktopNavigationKey,
  desktopShellAllowed,
  isImmersiveDesktopPath,
  normalizeDesktopPath,
} from './desktopNavigation';

describe('desktop navigation', () => {
  it('normalizes routes without changing the root', () => {
    expect(normalizeDesktopPath('/world/places/?world=vespormoor')).toBe('/world/places');
    expect(normalizeDesktopPath('chat')).toBe('/chat');
    expect(normalizeDesktopPath('/')).toBe('/');
  });

  it('keeps public and first-life routes shell free', () => {
    expect(desktopShellAllowed('/')).toBe(false);
    expect(desktopShellAllowed('/auth')).toBe(false);
    expect(desktopShellAllowed('/auth/callback')).toBe(false);
    expect(desktopShellAllowed('/choose-companion')).toBe(false);
    expect(desktopShellAllowed('/terms')).toBe(false);
    expect(desktopShellAllowed('/privacy-policy')).toBe(false);
    expect(desktopShellAllowed('/help')).toBe(false);
    expect(desktopShellAllowed('/home')).toBe(true);
    expect(desktopShellAllowed('/create/companion')).toBe(true);
  });

  it.each([
    ['/home', 'home'],
    ['/world/places', 'explore'],
    ['/location/velvet-hour', 'explore'],
    ['/chat-tab', 'messages'],
    ['/group-chat', 'messages'],
    ['/conversation/123', 'messages'],
    ['/media/123', 'moments'],
    ['/plan/123', 'plans'],
    ['/create/companion/123', 'companions'],
    ['/media-preferences', 'settings'],
    ['/subscription', 'settings'],
  ] as const)('maps %s to %s', (route, key) => {
    expect(desktopNavigationKey(route)).toBe(key);
  });

  it('defaults narrow desktops to the rail and wide desktops to the panel', () => {
    expect(defaultDesktopSidebarExpanded(1100)).toBe(false);
    expect(defaultDesktopSidebarExpanded(1440)).toBe(true);
  });

  it('recognizes immersive routes', () => {
    expect(isImmersiveDesktopPath('/call')).toBe(true);
    expect(isImmersiveDesktopPath('/plan-live?plan=1')).toBe(true);
    expect(isImmersiveDesktopPath('/chat')).toBe(false);
  });
});
