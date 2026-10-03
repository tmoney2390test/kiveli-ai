// Only warm the main destinations automatically. Conversation routes need an
// actual conversation, and secondary screens are warmed by navigation intent.
export const CORE_APP_ROUTES = ['/home', '/chat-tab?messages=1', '/explore', '/moments'] as const;

type PrefetchRoute = (href: string) => void | Promise<unknown>;
type TimerHandle = ReturnType<typeof setTimeout>;

const warmedRoutes = new Map<string, symbol>();
let routeIntent: { path: string; startedAt: number } | null = null;

export function routePath(href: string): string {
  const value = href.split(/[?#]/, 1)[0] || '/';
  return value.replace(/^\/\(tabs\)/, '') || '/';
}

export function warmRoute(href: string, prefetch: PrefetchRoute): boolean {
  const key = routePath(href);
  if (warmedRoutes.has(key)) return false;
  const attempt = Symbol(key);
  warmedRoutes.set(key, attempt);
  const release = () => { if (warmedRoutes.get(key) === attempt) warmedRoutes.delete(key); };
  try {
    // A failed speculative download must remain retryable on the next tap.
    void Promise.resolve(prefetch(href)).catch(release);
    return true;
  } catch {
    release();
    return false;
  }
}

export function scheduleCoreRouteWarmup(prefetch: PrefetchRoute, delayMs = 1500, spacingMs = 350): () => void {
  const browser = typeof window === 'undefined' ? undefined : window;
  const page = typeof document === 'undefined' ? undefined : document;
  const network = typeof navigator === 'undefined' ? undefined : navigator as Navigator & {
    connection?: EventTarget & { saveData?: boolean; effectiveType?: string };
  };
  let cancelled = false, next = 0;
  let timer: TimerHandle | undefined, idle: number | undefined;
  const allowed = () => !page?.hidden && network?.onLine !== false && !network?.connection?.saveData
    && !['slow-2g', '2g'].includes(network?.connection?.effectiveType ?? '');
  const clearPending = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined) browser?.cancelIdleCallback?.(idle);
    timer = undefined; idle = undefined;
  };
  const schedule = (delay: number) => {
    if (cancelled || next >= CORE_APP_ROUTES.length || !allowed()) return;
    timer = setTimeout(() => {
      timer = undefined;
      const run = () => {
        idle = undefined;
        if (cancelled || !allowed()) return;
        warmRoute(CORE_APP_ROUTES[next++]!, prefetch);
        schedule(spacingMs);
      };
      if (typeof browser?.requestIdleCallback === 'function' && typeof browser.cancelIdleCallback === 'function') idle = browser.requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, delay);
  };
  const resume = () => { clearPending(); schedule(spacingMs); };
  page?.addEventListener('visibilitychange', resume);
  browser?.addEventListener?.('online', resume);
  browser?.addEventListener?.('offline', resume);
  network?.connection?.addEventListener?.('change', resume);
  schedule(delayMs);
  return () => {
    cancelled = true; clearPending();
    page?.removeEventListener('visibilitychange', resume);
    browser?.removeEventListener?.('online', resume);
    browser?.removeEventListener?.('offline', resume);
    network?.connection?.removeEventListener?.('change', resume);
  };
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
