export type AppRouteParam = string | number | boolean | null | undefined;
export type AppRouteParams = Record<string, AppRouteParam | AppRouteParam[]>;
export type AppRouteHref = string | { pathname: string; params?: AppRouteParams };

type ImperativeRouter = {
  push: (href: never, options?: unknown) => unknown;
  navigate: (href: never, options?: unknown) => unknown;
  replace: (href: never, options?: unknown) => unknown;
  dismissTo?: (href: never, options?: unknown) => unknown;
  setParams: (params: never) => unknown;
};

declare global {
  interface Window {
    __KIVELLE_ENTRY_HREF__?: string;
    __KIVELLE_PENDING_ROUTE_HREF__?: string;
    __KIVELLE_PENDING_ROUTE_TIMEOUT__?: number;
    __KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__?: () => void;
  }
}

const patchedRouters = new WeakSet<object>();
let activeWebRouter: { browserWindow: Window; router: ImperativeRouter } | null = null;
const CLICK_GUARD_KEY = "__kivelliWebNavigationClickGuard";
export const WEB_ROUTE_TRANSITION_KEY = "kivelli:web-route-transition:v1";
export const WEB_ROUTE_TRANSITION_CLASS = "kivelli-route-transition-pending";
const WEB_ROUTE_TRANSITION_MAX_AGE_MS = 15_000;
const TAB_ROUTE_PATHS = new Set([
  "/chat-tab",
  "/dates",
  "/explore",
  "/home",
  "/market",
  "/moments",
  "/profile",
  "/singles",
  "/upgrade",
]);

function stripRouteGroups(pathname: string): string {
  return pathname.replace(/\/\([^)]+\)(?=\/|$)/g, "") || "/";
}

function values(value: AppRouteParam | AppRouteParam[]): AppRouteParam[] {
  return Array.isArray(value) ? value : [value];
}

function encodedSegment(value: AppRouteParam): string {
  return encodeURIComponent(String(value));
}

function resolveObjectHref(href: Extract<AppRouteHref, object>): string | null {
  if (!href.pathname.startsWith("/") || href.pathname.startsWith("//")) return null;
  const parsed = new URL(href.pathname, "https://kivelli.app");
  const params = href.params ?? {};
  const consumed = new Set<string>();
  let pathname = stripRouteGroups(parsed.pathname);

  pathname = pathname.replace(/\/\[\[\.\.\.([^\]]+)\]\]/g, (_match, name: string) => {
    consumed.add(name);
    const parts = values(params[name]).filter((part) => part !== null && part !== undefined);
    return parts.length ? `/${parts.map(encodedSegment).join("/")}` : "";
  });
  pathname = pathname.replace(/\[\.\.\.([^\]]+)\]/g, (_match, name: string) => {
    consumed.add(name);
    const parts = values(params[name]).filter((part) => part !== null && part !== undefined);
    return parts.map(encodedSegment).join("/");
  });
  pathname = pathname.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    consumed.add(name);
    const part = values(params[name]).find((candidate) => candidate !== null && candidate !== undefined);
    return part === undefined ? "" : encodedSegment(part);
  });

  for (const [name, value] of Object.entries(params)) {
    if (consumed.has(name)) continue;
    parsed.searchParams.delete(name);
    for (const part of values(value)) {
      if (part !== null && part !== undefined) parsed.searchParams.append(name, String(part));
    }
  }

  const query = parsed.searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}${parsed.hash}`;
}

/** Converts Expo route-group and object hrefs into stable public browser URLs. */
export function appRouteHref(href: AppRouteHref): string | null {
  if (typeof href !== "string") return resolveObjectHref(href);
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const parsed = new URL(href, "https://kivelli.app");
  return `${stripRouteGroups(parsed.pathname)}${parsed.search}${parsed.hash}`;
}

function dispatchRouteChange(): void {
  const event = typeof window.PopStateEvent === "function"
    ? new window.PopStateEvent("popstate", { state: window.history.state })
    : new Event("popstate");
  window.dispatchEvent(event);
}

function routePath(href: string): string {
  return new URL(href, "https://kivelli.app").pathname.replace(/\/$/, "") || "/";
}

function isTransientRootAlias(next: URL, destination: URL): boolean {
  if (destination.pathname === "/" || destination.pathname === "/home") return false;
  return next.pathname === "/" || next.pathname === "/home";
}

/**
 * Expo can briefly serialize a nested route as `/` (and dynamic params as a
 * root query) while its navigation state is converging. Keep those internal
 * aliases out of browser history without interrupting that state transition.
 */
function installPendingWebHistoryGuard(destination: string): void {
  if (typeof window === "undefined") return;
  window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__?.();
  const target = new URL(destination, window.location.href);
  if (target.pathname === "/" || target.pathname === "/home") return;

  const browserHistory = window.history;
  const originalPushState = browserHistory.pushState;
  const originalReplaceState = browserHistory.replaceState;
  let aliasRecoveryScheduled = false;
  const preserveDestination = (
    original: History["pushState"],
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    let nextUrl = url;
    if (url !== undefined && url !== null) {
      try {
        if (isTransientRootAlias(new URL(String(url), window.location.href), target)) {
          nextUrl = `${target.pathname}${target.search}${target.hash}`;
          if (!aliasRecoveryScheduled) {
            aliasRecoveryScheduled = true;
            window.setTimeout(() => {
              if (window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__ === release) {
                dispatchRouteChange();
              }
            }, 100);
          }
        }
      } catch {
        // Let the native history method validate malformed URLs normally.
      }
    }
    return Reflect.apply(original, browserHistory, [data, unused, nextUrl]);
  };

  browserHistory.pushState = ((data: unknown, unused: string, url?: string | URL | null) => (
    preserveDestination(originalPushState, data, unused, url)
  )) as History["pushState"];
  browserHistory.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => (
    preserveDestination(originalReplaceState, data, unused, url)
  )) as History["replaceState"];

  const release = () => {
    if (window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__ !== release) return;
    browserHistory.pushState = originalPushState;
    browserHistory.replaceState = originalReplaceState;
    delete window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__;
  };
  window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__ = release;
}

function clearTransitionTimeout(): void {
  if (typeof window === "undefined" || window.__KIVELLE_PENDING_ROUTE_TIMEOUT__ === undefined) return;
  window.clearTimeout(window.__KIVELLE_PENDING_ROUTE_TIMEOUT__);
  delete window.__KIVELLE_PENDING_ROUTE_TIMEOUT__;
}

/**
 * Keeps the current screen covered while Expo Router settles a cross-screen
 * transition. The storage record lets the same cover survive a safety reload.
 */
export function beginPendingWebRouteTransition(destination: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installPendingWebHistoryGuard(destination);
  // Only the pathname is needed after the reload. Avoid persisting route
  // parameters such as conversation or checkout identifiers.
  const destinationPath = routePath(destination);
  window.__KIVELLE_PENDING_ROUTE_HREF__ = destinationPath;
  try {
    window.sessionStorage?.setItem(WEB_ROUTE_TRANSITION_KEY, JSON.stringify({ destination: destinationPath, startedAt: Date.now() }));
  } catch {
    // Private browsing can deny session storage; the in-document cover still works.
  }
  const root = document.documentElement;
  if (!root?.classList) return;
  root.classList.add(WEB_ROUTE_TRANSITION_CLASS);
  clearTransitionTimeout();
  window.__KIVELLE_PENDING_ROUTE_TIMEOUT__ = window.setTimeout(() => {
    completePendingWebRouteTransition();
  }, WEB_ROUTE_TRANSITION_MAX_AGE_MS);
}

/** Removes the persistent cover once the intended route has actually mounted. */
export function completePendingWebRouteTransition(activeHref?: string): boolean {
  if (typeof window === "undefined") return false;
  let destination = window.__KIVELLE_PENDING_ROUTE_HREF__;
  if (!destination) {
    try {
      const raw = window.sessionStorage?.getItem(WEB_ROUTE_TRANSITION_KEY);
      if (raw) destination = (JSON.parse(raw) as { destination?: string }).destination;
    } catch {
      // A malformed or inaccessible record is safe to discard below.
    }
  }
  if (!destination) return false;
  if (activeHref && routePath(activeHref) !== routePath(destination)) return false;
  clearTransitionTimeout();
  window.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__?.();
  try {
    window.sessionStorage?.removeItem(WEB_ROUTE_TRANSITION_KEY);
  } catch {
    // The DOM cover can still be removed when storage is unavailable.
  }
  if (typeof document !== "undefined") document.documentElement?.classList?.remove(WEB_ROUTE_TRANSITION_CLASS);
  delete window.__KIVELLE_PENDING_ROUTE_HREF__;
  return true;
}

function isConversationRoute(href: string): boolean {
  const pathname = routePath(href);
  return pathname === "/chat" || pathname === "/group-chat";
}

function isCapturedEntryRecovery(destination: string): boolean {
  if (typeof window === "undefined") return false;
  const captured = window.__KIVELLE_ENTRY_HREF__;
  return Boolean(captured && appRouteHref(captured) === destination);
}

const DYNAMIC_ROUTE_PATTERNS: Array<{
  match: RegExp;
  pathname: string | ((prefix: string) => string);
  param: string;
}> = [
  { match: /^\/character\/([^/]+)$/, pathname: '/character/[slug]', param: 'slug' },
  { match: /^\/location\/([^/]+)$/, pathname: '/location/[slug]', param: 'slug' },
  { match: /^\/(date|media|moment|plan|story)\/([^/]+)$/, pathname: (prefix) => `/${prefix}/[id]`, param: 'id' },
  { match: /^\/conversation\/([^/]+)$/, pathname: '/conversation/[id]', param: 'id' },
  { match: /^\/conversations\/([^/]+)$/, pathname: '/conversations/[characterInstanceId]', param: 'characterInstanceId' },
  { match: /^\/create\/companion\/([^/]+)$/, pathname: '/create/companion/[draftId]', param: 'draftId' },
];

function routeParams(searchParams: URLSearchParams): AppRouteParams {
  const params: AppRouteParams = {};
  for (const name of new Set(searchParams.keys())) {
    const all = searchParams.getAll(name);
    params[name] = all.length > 1 ? all : all[0];
  }
  return params;
}

/** Gives Expo the route pattern and named params it requires for dynamic web routes. */
export function expoDynamicRouteHref(destination: string): AppRouteHref | null {
  const parsed = new URL(destination, 'https://kivelli.app');
  for (const route of DYNAMIC_ROUTE_PATTERNS) {
    const match = parsed.pathname.match(route.match);
    if (!match) continue;
    const value = match[match.length - 1];
    if (value === undefined) continue;
    const prefix = match.length > 2 ? (match[1] ?? '') : '';
    const pathname = typeof route.pathname === 'function' ? route.pathname(prefix) : route.pathname;
    return {
      pathname,
      params: { ...routeParams(parsed.searchParams), [route.param]: decodeURIComponent(value) },
    };
  }
  return null;
}

function expoRouterHref(href: AppRouteHref, destination: string): AppRouteHref {
  const dynamicHref = expoDynamicRouteHref(destination);
  if (dynamicHref) return dynamicHref;
  const pathname = routePath(destination);
  if (!TAB_ROUTE_PATHS.has(pathname)) return href;
  if (typeof href === "string") {
    if (href.includes("/(tabs)")) return href;
    return `/(tabs)${destination}`;
  }
  if (href.pathname.includes("/(tabs)")) return href;
  return { ...href, pathname: `/(tabs)${href.pathname}` };
}

function hardNavigate(destination: string, mode: "push" | "replace"): void {
  beginPendingWebRouteTransition(destination);
  window.location[mode === "replace" ? "replace" : "assign"](destination);
}

export function navigateLocalRouteOnWeb(
  href: AppRouteHref,
  mode: "push" | "replace" = "push",
): boolean {
  if (typeof window === "undefined") return false;
  const destination = appRouteHref(href);
  if (!destination) return false;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === destination) return true;
  if (routePath(current) === routePath(destination) || (isConversationRoute(current) && isConversationRoute(destination))) {
    window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", destination);
    dispatchRouteChange();
  } else {
    const activeRouter = activeWebRouter?.browserWindow === window ? activeWebRouter.router : null;
    if (activeRouter) activeRouter[mode === 'replace' ? 'replace' : 'push'](destination as never);
    else hardNavigate(destination, mode);
  }
  return true;
}

export function updateLocalRouteParamsOnWeb(params: AppRouteParams): boolean {
  if (typeof window === "undefined") return false;
  const current = new URL(window.location.href);
  for (const [name, value] of Object.entries(params)) {
    current.searchParams.delete(name);
    for (const part of values(value)) {
      if (part !== null && part !== undefined) current.searchParams.append(name, String(part));
    }
  }
  const destination = `${current.pathname}${current.search}${current.hash}`;
  const active = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (destination === active) return true;
  window.history.replaceState({}, "", destination);
  dispatchRouteChange();
  return true;
}

function installInternalLinkGuard(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const keyedWindow = window as typeof window & Record<string, unknown>;
  if (keyedWindow[CLICK_GUARD_KEY]) return;
  keyedWindow[CLICK_GUARD_KEY] = true;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== "_self")) return;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (!navigateLocalRouteOnWeb(`${destination.pathname}${destination.search}${destination.hash}`)) return;
    event.preventDefault();
  }, true);
}

/**
 * Expo Router's static-web imperative queue can resolve valid nested routes to `/`.
 * Route every browser transition through History + popstate while retaining the
 * native router implementation on iOS and Android.
 */
export function installWebNavigationCompatibility(router: object): void {
  if (typeof window === "undefined") return;
  installInternalLinkGuard();
  if (patchedRouters.has(router)) return;
  patchedRouters.add(router);

  const imperativeRouter = router as ImperativeRouter;

  const push = imperativeRouter.push.bind(imperativeRouter);
  const navigate = imperativeRouter.navigate.bind(imperativeRouter);
  const replace = imperativeRouter.replace.bind(imperativeRouter);
  const dismissTo = imperativeRouter.dismissTo?.bind(imperativeRouter);
  const setParams = imperativeRouter.setParams.bind(imperativeRouter);

  const transition = (
    original: (href: never, options?: unknown) => unknown,
    href: AppRouteHref,
    mode: "push" | "replace",
    options?: unknown,
  ) => {
    const destination = appRouteHref(href);
    if (!destination) return original(href as never, options);
    const routerHref = expoRouterHref(href, destination);
    if (isCapturedEntryRecovery(destination)) return original(routerHref as never, options);
    const startingLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (startingLocation === destination) return undefined;
    if (isConversationRoute(startingLocation) && isConversationRoute(destination)) {
      navigateLocalRouteOnWeb(destination, mode);
      return undefined;
    }
    beginPendingWebRouteTransition(destination);
    let result: unknown;
    try {
      result = original(routerHref as never, options);
    } catch (error) {
      completePendingWebRouteTransition();
      throw error;
    }
    window.setTimeout(() => {
      // RouteTransitionVeil clears this marker when Expo's route state—not just
      // the protected address bar—has mounted the destination. If it has not,
      // retain the existing hard-navigation recovery path.
      if (window.__KIVELLE_PENDING_ROUTE_HREF__ === routePath(destination)) {
        hardNavigate(destination, mode);
      }
    }, 1_500);
    return result;
  };

  imperativeRouter.push = ((href: AppRouteHref, options?: unknown) => transition(push, href, "push", options)) as ImperativeRouter["push"];
  imperativeRouter.navigate = ((href: AppRouteHref, options?: unknown) => transition(navigate, href, "push", options)) as ImperativeRouter["navigate"];
  imperativeRouter.replace = ((href: AppRouteHref, options?: unknown) => transition(replace, href, "replace", options)) as ImperativeRouter["replace"];
  if (dismissTo) {
    imperativeRouter.dismissTo = ((href: AppRouteHref, options?: unknown) => transition(dismissTo, href, "replace", options)) as NonNullable<ImperativeRouter["dismissTo"]>;
  }
  imperativeRouter.setParams = ((params: AppRouteParams) => updateLocalRouteParamsOnWeb(params) || setParams(params as never)) as ImperativeRouter["setParams"];
  activeWebRouter = { browserWindow: window, router: imperativeRouter };
}
