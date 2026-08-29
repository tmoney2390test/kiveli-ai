export function isSettingsPath(pathname: string) {
  return (pathname.replace(/^\/(?:\(tabs\)\/)?/, '/').replace(/\/+$/, '') || '/') === '/settings';
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
