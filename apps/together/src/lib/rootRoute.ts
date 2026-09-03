export function isRootAppPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/';
}

export type RootEntryPresentation = 'loading' | 'public' | 'authenticated';

export function rootEntryPresentation(input: {
  authLoading: boolean;
  hasSession: boolean;
}): RootEntryPresentation {
  if (input.authLoading) return 'loading';
  return input.hasSession ? 'authenticated' : 'public';
}

export function shouldRunAuthenticatedIndexRedirect(input: {
  platform: string;
  routerPathname: string;
  browserPathname?: string | null;
}) {
  // An inactive Expo index screen can keep reporting its own `/` pathname
  // while the browser is already navigating to a sibling route. On web the
  // address bar is the authoritative route and prevents that stale index from
  // redirecting deep links such as /moments back to /home.
  const pathname = input.platform === 'web' && input.browserPathname
    ? input.browserPathname
    : input.routerPathname;
  return isRootAppPath(pathname);
}
