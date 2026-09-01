import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appRouteHref,
  completePendingWebRouteTransition,
  expoDynamicRouteHref,
  installWebNavigationCompatibility,
  navigateLocalRouteOnWeb,
  updateLocalRouteParamsOnWeb,
  WEB_ROUTE_TRANSITION_CLASS,
  WEB_ROUTE_TRANSITION_KEY,
} from "./appNavigation";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
});

function browserAt(initialHref: string) {
  let current = new URL(initialHref);
  const routeEvents: string[] = [];
  const classes = new Set<string>();
  const storage = new Map<string, string>();
  const history = {
    state: null,
    pushState: vi.fn((_state: unknown, _title: string, href: string) => { current = new URL(href, current); }),
    replaceState: vi.fn((_state: unknown, _title: string, href: string) => { current = new URL(href, current); }),
  };
  const location = {
    get href() { return current.href; },
    get pathname() { return current.pathname; },
    get search() { return current.search; },
    get hash() { return current.hash; },
    get origin() { return current.origin; },
    assign: vi.fn((href: string) => { current = new URL(href, current); }),
    replace: vi.fn((href: string) => { current = new URL(href, current); }),
  };
  class TestPopStateEvent extends Event {}
  const browser = {
    location,
    history,
    PopStateEvent: TestPopStateEvent,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    sessionStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
      removeItem: vi.fn((key: string) => { storage.delete(key); }),
    },
    dispatchEvent: vi.fn((event: Event) => { routeEvents.push(event.type); return true; }),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    addEventListener: vi.fn(),
    documentElement: { classList: {
      add: vi.fn((name: string) => { classes.add(name); }),
      remove: vi.fn((name: string) => { classes.delete(name); }),
      contains: vi.fn((name: string) => classes.has(name)),
    } },
  } });
  return { browser, classes, history, routeEvents, storage };
}

describe("app navigation", () => {
  it("turns Expo route groups into public browser paths", () => {
    expect(appRouteHref("/(tabs)/explore?world=eos-meridian")).toBe("/explore?world=eos-meridian");
    expect(appRouteHref("/(auth)/reset-password#form")).toBe("/reset-password#form");
  });

  it("resolves route objects and dynamic segments without leaking group names", () => {
    expect(appRouteHref({
      pathname: "/(tabs)/character/[slug]",
      params: { slug: "iris vale", source: "explore" },
    })).toBe("/character/iris%20vale?source=explore");
    expect(appRouteHref({
      pathname: "/media/[id]?gallery=moments",
      params: { id: "media/one", character: ["iris", "bianca"] },
    })).toBe("/media/media%2Fone?gallery=moments&character=iris&character=bianca");
  });

  it("accepts only local app destinations", () => {
    expect(appRouteHref("//example.com/explore")).toBeNull();
    expect(appRouteHref("https://example.com/explore")).toBeNull();
  });

  it("converts concrete dynamic URLs into Expo route objects", () => {
    expect(expoDynamicRouteHref('/location/the-rivet?world=eos-meridian')).toEqual({
      pathname: '/location/[slug]',
      params: { slug: 'the-rivet', world: 'eos-meridian' },
    });
    expect(expoDynamicRouteHref('/media/media%2Fone?character=iris&character=bianca')).toEqual({
      pathname: '/media/[id]',
      params: { id: 'media/one', character: ['iris', 'bianca'] },
    });
    expect(expoDynamicRouteHref('/explore?world=eos-meridian')).toBeNull();
  });

  it("keeps conversation switching inside browser history", () => {
    const { browser, history, routeEvents } = browserAt("https://kivelli.app/chat?character=iris");
    const nativePush = vi.fn();
    const router = {
      push: nativePush,
      navigate: vi.fn(),
      replace: vi.fn(),
      dismissTo: vi.fn(),
      setParams: vi.fn(),
    };
    installWebNavigationCompatibility(router);

    router.push("/group-chat?id=group-1" as never);

    expect(browser.location.pathname).toBe("/group-chat");
    expect(browser.location.search).toBe("?id=group-1");
    expect(history.pushState).toHaveBeenCalledOnce();
    expect(routeEvents).toEqual(["popstate"]);
    expect(nativePush).not.toHaveBeenCalled();
  });

  it("keeps Expo's transient root aliases out of history while a dynamic route mounts", () => {
    vi.useFakeTimers();
    try {
      const { browser, classes, history } = browserAt("https://kivelli.app/explore");
      const nativePush = vi.fn((href: unknown, options?: unknown) => {
        void href;
        void options;
        history.pushState({}, "", "/");
        history.replaceState({}, "", "/?slug=the-rivet");
        return history.replaceState({}, "", "/location/the-rivet?world=eos-meridian");
      });
      const router = {
        push: nativePush,
        navigate: nativePush,
        replace: vi.fn(),
        dismissTo: vi.fn(),
        setParams: vi.fn(),
      };
      installWebNavigationCompatibility(router);

      router.push("/location/the-rivet?world=eos-meridian" as never);
      expect(nativePush).toHaveBeenCalledWith({
        pathname: '/location/[slug]',
        params: { slug: 'the-rivet', world: 'eos-meridian' },
      }, undefined);
      expect(browser.location.assign).not.toHaveBeenCalled();
      expect(browser.location.href).toBe("https://kivelli.app/location/the-rivet?world=eos-meridian");
      expect(classes.has(WEB_ROUTE_TRANSITION_CLASS)).toBe(true);
      expect(completePendingWebRouteTransition('/location/the-rivet')).toBe(true);
      expect(classes.has(WEB_ROUTE_TRANSITION_CLASS)).toBe(false);
      history.replaceState({}, '', '/');
      expect(browser.location.pathname).toBe('/');
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconciles Expo against the protected destination after a root alias", async () => {
    vi.useFakeTimers();
    try {
      const { browser, history, routeEvents } = browserAt("https://kivelli.app/explore");
      const nativePush = vi.fn((_href?: unknown) => {
        void _href;
        return history.pushState({}, "", "/");
      });
      const router = {
        push: nativePush,
        navigate: nativePush,
        replace: vi.fn(),
        dismissTo: vi.fn(),
        setParams: vi.fn(),
      };
      installWebNavigationCompatibility(router);

      router.push("/location/the-rivet?world=eos-meridian" as never);
      expect(browser.location.href).toBe("https://kivelli.app/location/the-rivet?world=eos-meridian");
      expect(routeEvents).toEqual([]);

      await vi.advanceTimersByTimeAsync(100);
      expect(routeEvents).toEqual(["popstate"]);
      expect(completePendingWebRouteTransition('/location/the-rivet')).toBe(true);
      expect(browser.location.assign).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to one direct browser transition when Expo cannot resolve a route", async () => {
    vi.useFakeTimers();
    try {
      const { browser } = browserAt("https://kivelli.app/explore");
      const nativePush = vi.fn((href?: unknown, options?: unknown) => {
        void href;
        void options;
      });
      const router = { push: nativePush, navigate: vi.fn(), replace: vi.fn(), dismissTo: vi.fn(), setParams: vi.fn() };
      router.navigate = nativePush;
      installWebNavigationCompatibility(router);

      router.push("/(tabs)/singles?world=eos-meridian" as never);
      await vi.advanceTimersByTimeAsync(1_500);

      expect(nativePush).toHaveBeenCalledWith("/(tabs)/singles?world=eos-meridian", undefined);
      expect(browser.location.assign).toHaveBeenCalledWith("/singles?world=eos-meridian");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves Expo's tab route identity while its captured URL remains protected", () => {
    const { browser } = browserAt("https://kivelli.app/explore?world=eos-meridian");
    Object.assign(browser, { __KIVELLE_ENTRY_HREF__: "/explore?world=eos-meridian" });
    const nativeReplace = vi.fn();
    const router = {
      push: vi.fn(),
      navigate: vi.fn(),
      replace: nativeReplace,
      dismissTo: vi.fn(),
      setParams: vi.fn(),
    };
    installWebNavigationCompatibility(router);

    router.replace("/explore?world=eos-meridian" as never);

    expect(nativeReplace).toHaveBeenCalledWith("/(tabs)/explore?world=eos-meridian", undefined);
    expect(browser.location.href).toBe("https://kivelli.app/explore?world=eos-meridian");
  });

  it("uses a full browser transition for explicit cross-screen safety calls", () => {
    vi.useFakeTimers();
    try {
      const { browser, classes, history, storage } = browserAt("https://kivelli.app/chat?character=iris");
      const originalPushState = history.pushState;

      expect(navigateLocalRouteOnWeb("/subscription?intent=voice")).toBe(true);

      expect(browser.location.assign).toHaveBeenCalledWith("/subscription?intent=voice");
      expect(originalPushState).not.toHaveBeenCalled();
      expect(classes.has(WEB_ROUTE_TRANSITION_CLASS)).toBe(true);
      expect(JSON.parse(storage.get(WEB_ROUTE_TRANSITION_KEY) ?? "{}").destination).toBe("/subscription");
      expect(completePendingWebRouteTransition("/chat")).toBe(false);
      expect(completePendingWebRouteTransition("/subscription")).toBe(true);
      expect(classes.has(WEB_ROUTE_TRANSITION_CLASS)).toBe(false);
      expect(storage.has(WEB_ROUTE_TRANSITION_KEY)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("merges and removes route selector parameters in place", () => {
    const { browser, history } = browserAt("https://kivelli.app/explore?world=juniper-city&intent=people");

    expect(updateLocalRouteParamsOnWeb({ world: "eos-meridian", intent: undefined })).toBe(true);

    expect(browser.location.href).toBe("https://kivelli.app/explore?world=eos-meridian");
    expect(history.replaceState).toHaveBeenCalledOnce();
  });
});
