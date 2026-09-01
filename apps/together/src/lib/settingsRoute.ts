export function isSettingsPath(pathname: string) {
  const normalized = pathname.replace(/^\/(?:\(tabs\)\/)?/, '/').replace(/\/+$/, '') || '/';
  return normalized === '/settings' || normalized === '/profile';
}

export function shouldRenderSettingsRoute(input: {
  platform: string;
  routerPathname: string;
  browserPathname?: string | null;
}) {
  // Expo's nested stack can briefly report the route below Settings from
  // usePathname() on web. The address bar is canonical for a web page and also
  // changes immediately when the user deep-links away from Settings.
  const pathname = input.platform === 'web' && input.browserPathname
    ? input.browserPathname
    : input.routerPathname;
  return isSettingsPath(pathname);
}

export function shouldUseDesktopSettingsLayout(input: {
  platform: string;
  width: number;
  webHydrated: boolean;
}) {
  // Static web output has no trustworthy viewport width. Keep the server and
  // first browser render on the same mobile-safe tree, then enhance to the
  // desktop layout after hydration.
  if (input.platform === 'web' && !input.webHydrated) return false;
  return input.width >= 860;
}
