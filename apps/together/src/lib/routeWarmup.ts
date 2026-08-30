export const CORE_APP_ROUTES = ['/home', '/explore', '/chat-tab?messages=1', '/moments', '/stories', '/dates', '/companions'] as const;

type PrefetchRoute = (href: string) => void;
type TimerHandle = ReturnType<typeof setTimeout>;

const warmedRoutes = new Set<string>();
let routeIntent: { path: string; startedAt: number } | null = null;

export function routePath(href: string): string {
  const value = href.split(/[?#]/, 1)[0] || '/';
  return value.replace(/^\/\(tabs\)/, '') || '/';
}

export function warmRoute(href: string, prefetch: PrefetchRoute): boolean {
  const key = routePath(href);
  if (warmedRoutes.has(key)) return false;
  warmedRoutes.add(key);
  try {
    prefetch(href);
    return true;
  } catch {
    warmedRoutes.delete(key);
    return false;
  }
}

export function scheduleCoreRouteWarmup(prefetch: PrefetchRoute, delayMs = 700, spacingMs = 140): () => void {
  const timers: TimerHandle[] = [];
  CORE_APP_ROUTES.forEach((href, index) => {
    timers.push(setTimeout(() => warmRoute(href, prefetch), delayMs + index * spacingMs));
  });
  return () => timers.forEach(clearTimeout);
}

export function markRouteIntent(href: string, startedAt = Date.now()): void {
  routeIntent = { path: routePath(href), startedAt };
}

export function consumeRouteIntent(pathname: string, settledAt = Date.now()): number | null {
  if (!routeIntent || routeIntent.path !== routePath(pathname)) return null;
  const duration = Math.max(0, Math.round(settledAt - routeIntent.startedAt));
  routeIntent = null;
  return duration;
}

export function resetRouteWarmupForTests(): void {
  warmedRoutes.clear();
  routeIntent = null;
}
