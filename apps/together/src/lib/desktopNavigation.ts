export const DESKTOP_SHELL_BREAKPOINT = 900;
export const DESKTOP_SHELL_EXPANDED_BREAKPOINT = 1180;
export const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 72;
export const DESKTOP_SIDEBAR_EXPANDED_WIDTH = 248;

export type DesktopNavigationKey =
  | 'home'
  | 'explore'
  | 'messages'
  | 'moments'
  | 'stories'
  | 'plans'
  | 'companions'
  | 'settings';

const shellFreePaths = new Set([
  '/',
  '/auth',
  '/auth/callback',
  '/reset-password',
  '/choose-companion',
  '/onboarding',
  '/quick-start',
  '/introduction',
  '/meet-maya',
  '/terms',
  '/privacy-policy',
  '/community-guidelines',
  '/help',
]);

export function normalizeDesktopPath(pathname: string) {
  if (!pathname) return '/';
  const withSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const clean = withSlash.split(/[?#]/, 1)[0] ?? withSlash;
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
}

export function desktopShellAllowed(pathname: string) {
  return !shellFreePaths.has(normalizeDesktopPath(pathname));
}

export function isImmersiveDesktopPath(pathname: string) {
  const path = normalizeDesktopPath(pathname);
  return path === '/call' || path === '/plan-live';
}

export function desktopNavigationKey(pathname: string): DesktopNavigationKey | null {
  const path = normalizeDesktopPath(pathname);
  if (path === '/home') return 'home';
  if (path === '/explore' || path === '/world/places' || path.startsWith('/location/') || path.startsWith('/story/')) return 'explore';
  if (path === '/chat-tab' || path === '/chat' || path === '/group-chat' || path === '/new-group' || path === '/archived-chats' || path.startsWith('/conversation/') || path.startsWith('/conversations/')) return 'messages';
  if (path === '/moments' || path.startsWith('/moment/') || path.startsWith('/media/')) return 'moments';
  if (path === '/stories' || path === '/story-library' || path.startsWith('/story-case/')) return 'stories';
  if (path === '/dates' || path === '/plan-live' || path.startsWith('/plan/') || path.startsWith('/date/')) return 'plans';
  if (path === '/companions' || path === '/singles' || path.startsWith('/character/') || path.startsWith('/create/companion')) return 'companions';
  if (
    path === '/settings' || path === '/account' || path === '/notifications' ||
    path === '/content-settings' || path === '/conversation-controls' ||
    path === '/media-content-settings' || path === '/media-preferences' ||
    path === '/photo-settings' || path === '/privacy' || path === '/personas' ||
    path === '/persona-editor' || path === '/subscription' || path === '/support'
  ) return 'settings';
  return null;
}

export function defaultDesktopSidebarExpanded(width: number) {
  return width >= DESKTOP_SHELL_EXPANDED_BREAKPOINT;
}
