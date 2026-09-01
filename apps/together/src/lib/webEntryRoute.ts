declare global {
  interface Window {
    __KIVELLE_ENTRY_HREF__?: string;
    __KIVELLE_ENTRY_ROUTER_FALLBACK__?: boolean;
    __KIVELLE_RELEASE_ENTRY_HISTORY_GUARD__?: () => void;
  }
}

let consumed = false;

export function initialWebEntryHref() {
  if (consumed || typeof window === 'undefined') return null;
  const href = window.__KIVELLE_ENTRY_HREF__;
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

export function consumeWebEntryHref() {
  consumed = true;
  if (typeof window !== 'undefined') {
    window.__KIVELLE_RELEASE_ENTRY_HISTORY_GUARD__?.();
    delete window.__KIVELLE_RELEASE_ENTRY_HISTORY_GUARD__;
    delete window.__KIVELLE_ENTRY_ROUTER_FALLBACK__;
    delete window.__KIVELLE_ENTRY_HREF__;
  }
}

export function webEntryHrefConsumed() {
  return consumed;
}

export function effectiveWebEntryHref(capturedHref: string | null, entryConsumed = webEntryHrefConsumed()) {
  return entryConsumed ? null : capturedHref;
}

export function entryPathname(href: string) {
  return href.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || '/';
}

export function authenticatedRoutePathname(input: {
  platform: string;
  routerPathname: string;
  browserPathname?: string | null;
  capturedEntryHref?: string | null;
}) {
  if (input.platform !== 'web' || !input.browserPathname) return input.routerPathname;
  // The address bar protects the original deep link only while that captured
  // entry is still being reconciled. Afterward Expo Router is the live source
  // of truth; window.location can lag one render during sign-in and sign-out.
  return input.capturedEntryHref ? input.browserPathname : input.routerPathname;
}

export function shouldRecoverWebEntry(input: {
  entryHref?: string | null;
  browserPathname?: string | null;
  routerPathname?: string | null;
  preservedRouterFallback?: boolean;
}) {
  if (!input.entryHref) return false;
  const entryPath = entryPathname(input.entryHref);
  if (entryPath === '/') return false;
  const browserFellBack = entryPath !== input.browserPathname &&
    (input.browserPathname === '/' || input.browserPathname === '/home');
  const routerFellBack = input.preservedRouterFallback === true &&
    entryPath === input.browserPathname &&
    entryPath !== input.routerPathname &&
    (input.routerPathname === '/' || input.routerPathname === '/home');
  return browserFellBack || routerFellBack;
}

export function shouldConsumeWebEntry(input:{entryHref?:string|null;browserPathname?:string|null;routerPathname?:string|null;snapshotReady:boolean}){
  if(!input.snapshotReady||!input.entryHref)return false;
  const entryPath=entryPathname(input.entryHref);
  return entryPath===input.browserPathname&&entryPath===input.routerPathname;
}
