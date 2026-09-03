import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appRouteHref,
  completePendingWebRouteTransition,
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
  const entries = [{ href: new URL(initialHref), state: null as unknown }];
  let entryIndex = 0;
  const current = () => entries[entryIndex]!;
  const routeEvents: string[] = [];
  const classes = new Set<string>();
  const storage = new Map<string, string>();
  const history = {
    get state() { return current().state; },
    get length() { return entries.length; },
    pushState: vi.fn((state: unknown, _title: string, href: string) => {
      entries.splice(entryIndex + 1);
      entries.push({ href: new URL(href, current().href), state });
      entryIndex = entries.length - 1;
    }),
    replaceState: vi.fn((state: unknown, _title: string, href: string) => {
      entries[entryIndex] = { href: new URL(href, current().href), state };
    }),
    back: vi.fn(() => { if (entryIndex > 0) entryIndex -= 1; }),
  };
  const location = {
    get href() { return current().href.href; },
    get pathname() { return current().href.pathname; },
    get search() { return current().href.search; },
    get hash() { return current().href.hash; },
    get origin() { return current().href.origin; },
    assign: vi.fn((href: string) => {
      entries.splice(entryIndex + 1);
      entries.push({ href: new URL(href, current().href), state: null });
      entryIndex = entries.length - 1;
    }),
    replace: vi.fn((href: string) => {
      entries[entryIndex] = { href: new URL(href, current().href), state: null };
    }),
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
  return { browser, classes, entries, history, routeEvents, storage };
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

  it("repairs a failed imperative route that falls back to Home", async () => {
    vi.useFakeTimers();
    try {
      const { browser, history } = browserAt("https://kivelli.app/explore");
      const nativePush = vi.fn((href: string, options?: unknown) => {
        void href;
        void options;
        return history.pushState({}, "", "/");
      });
      const router = {
        push: nativePush,
        navigate: vi.fn(),
        replace: vi.fn(),
        dismissTo: vi.fn(),
        setParams: vi.fn(),
      };
      installWebNavigationCompatibility(router);

      router.push("/(tabs)/singles?world=eos-meridian" as never);
      await vi.advanceTimersByTimeAsync(300);

      expect(nativePush).toHaveBeenCalledWith("/(tabs)/singles?world=eos-meridian", undefined);
      expect(browser.location.replace).not.toHaveBeenCalled();
      expect(browser.location.assign).not.toHaveBeenCalled();
      expect(browser.location.href).toBe("https://kivelli.app/singles?world=eos-meridian");
      history.back();
      expect(browser.location.href).toBe("https://kivelli.app/explore");
    } finally {
      vi.useRealTimers();
    }
  });

  it("repairs a push that Expo serialized as a replacement", async () => {
    vi.useFakeTimers();
    try {
      const { browser, entries, history } = browserAt("https://kivelli.app/explore?world=neon-kyo");
      history.replaceState({ screen: "explore" }, "", "/explore?world=neon-kyo");
      const nativePush = vi.fn((href: string) => {
        void href;
        return history.replaceState({ screen: "location" }, "", "/location/kissaten-88?world=neon-kyo");
      });
      const router = {
        push: nativePush,
        navigate: vi.fn(),
        replace: vi.fn(),
        dismissTo: vi.fn(),
        setParams: vi.fn(),
      };
      installWebNavigationCompatibility(router);

      router.push("/location/kissaten-88?world=neon-kyo" as never);
      await vi.advanceTimersByTimeAsync(300);

      expect(entries.map((entry) => entry.href.pathname + entry.href.search)).toEqual([
        "/explore?world=neon-kyo",
        "/location/kissaten-88?world=neon-kyo",
      ]);
      history.back();
      expect(browser.location.href).toBe("https://kivelli.app/explore?world=neon-kyo");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not duplicate an Expo push that already created browser history", async () => {
    vi.useFakeTimers();
    try {
      const { entries, history } = browserAt("https://kivelli.app/explore");
      const nativePush = vi.fn((href: string) => {
        void href;
        return history.pushState({ screen: "location" }, "", "/location/kissaten-88");
      });
      const router = {
        push: nativePush,
        navigate: vi.fn(),
        replace: vi.fn(),
        dismissTo: vi.fn(),
        setParams: vi.fn(),
      };
      installWebNavigationCompatibility(router);

      router.push("/location/kissaten-88" as never);
      await vi.advanceTimersByTimeAsync(300);

      expect(entries.map((entry) => entry.href.pathname)).toEqual(["/explore", "/location/kissaten-88"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves Expo's tab route identity while recovering a captured deep link", () => {
    const { browser } = browserAt("https://kivelli.app/");
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
    expect(browser.location.href).toBe("https://kivelli.app/");
  });

  it("keeps explicit cross-screen safety calls inside the current document", () => {
    vi.useFakeTimers();
    try {
      const { browser, classes, history, storage } = browserAt("https://kivelli.app/chat?character=iris");

      expect(navigateLocalRouteOnWeb("/subscription?intent=voice")).toBe(true);

      expect(browser.location.assign).not.toHaveBeenCalled();
      expect(browser.location.replace).not.toHaveBeenCalled();
      expect(history.pushState).toHaveBeenCalledWith({}, "", "/subscription?intent=voice");
      expect(browser.location.href).toBe("https://kivelli.app/subscription?intent=voice");
      expect(browser.dispatchEvent).toHaveBeenCalled();
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

  it.each([
    "/home",
    "/explore",
    "/moments",
    "/dates",
    "/companions",
    "/settings",
    "/subscription",
    "/chat-tab?messages=1",
    "/chat?character=iris-vale&conversationId=conversation-1",
    "/chat?group=1&id=group-1",
  ])("routes a persistent-sidebar destination to %s without reloading", (destination) => {
    const startingRoute = destination.startsWith("/home") ? "/settings" : "/home";
    const { browser, history, routeEvents } = browserAt(`https://kivelli.app${startingRoute}`);

    expect(navigateLocalRouteOnWeb(destination)).toBe(true);

    expect(browser.location.assign).not.toHaveBeenCalled();
    expect(browser.location.replace).not.toHaveBeenCalled();
    expect(history.pushState).toHaveBeenCalledWith({}, "", destination);
    expect(browser.location.href).toBe(`https://kivelli.app${destination}`);
    expect(routeEvents).toEqual(["popstate"]);
  });

  it("merges and removes route selector parameters in place", () => {
    const { browser, history } = browserAt("https://kivelli.app/explore?world=juniper-city&intent=people");

    expect(updateLocalRouteParamsOnWeb({ world: "eos-meridian", intent: undefined })).toBe(true);

    expect(browser.location.href).toBe("https://kivelli.app/explore?world=eos-meridian");
    expect(history.replaceState).toHaveBeenCalledOnce();
  });
});
