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

const patchedRouters = new WeakSet<object>();
const CLICK_GUARD_KEY = "__kivelliWebNavigationClickGuard";

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

export function navigateLocalRouteOnWeb(
  href: AppRouteHref,
  mode: "push" | "replace" = "push",
): boolean {
  if (typeof window === "undefined") return false;
  const destination = appRouteHref(href);
  if (!destination) return false;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === destination) return true;
  window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", destination);
  dispatchRouteChange();
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

  imperativeRouter.push = ((href: AppRouteHref, options?: unknown) => navigateLocalRouteOnWeb(href) || push(href as never, options)) as ImperativeRouter["push"];
  imperativeRouter.navigate = ((href: AppRouteHref, options?: unknown) => navigateLocalRouteOnWeb(href) || navigate(href as never, options)) as ImperativeRouter["navigate"];
  imperativeRouter.replace = ((href: AppRouteHref, options?: unknown) => navigateLocalRouteOnWeb(href, "replace") || replace(href as never, options)) as ImperativeRouter["replace"];
  if (dismissTo) {
    imperativeRouter.dismissTo = ((href: AppRouteHref, options?: unknown) => navigateLocalRouteOnWeb(href, "replace") || dismissTo(href as never, options)) as NonNullable<ImperativeRouter["dismissTo"]>;
  }
  imperativeRouter.setParams = ((params: AppRouteParams) => updateLocalRouteParamsOnWeb(params) || setParams(params as never)) as ImperativeRouter["setParams"];
}
