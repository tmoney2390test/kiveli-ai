import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appRouteHref,
  installWebNavigationCompatibility,
  updateLocalRouteParamsOnWeb,
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
  const history = {
    state: null,
    pushState: vi.fn((_state: unknown, _title: string, href: string) => { current = new URL(href, current); }),
    replaceState: vi.fn((_state: unknown, _title: string, href: string) => { current = new URL(href, current); }),
  };
  class TestPopStateEvent extends Event {}
  const browser = {
    get location() { return current; },
    history,
    PopStateEvent: TestPopStateEvent,
    dispatchEvent: vi.fn((event: Event) => { routeEvents.push(event.type); return true; }),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener: vi.fn() } });
  return { browser, history, routeEvents };
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

  it("intercepts imperative browser routes and notifies the mounted app", () => {
    const { browser, history, routeEvents } = browserAt("https://kivelli.app/home");
    const nativePush = vi.fn();
    const router = {
      push: nativePush,
      navigate: vi.fn(),
      replace: vi.fn(),
      dismissTo: vi.fn(),
      setParams: vi.fn(),
    };
    installWebNavigationCompatibility(router);

    router.push("/(tabs)/explore?world=eos-meridian" as never);

    expect(browser.location.pathname).toBe("/explore");
    expect(browser.location.search).toBe("?world=eos-meridian");
    expect(history.pushState).toHaveBeenCalledOnce();
    expect(routeEvents).toEqual(["popstate"]);
    expect(nativePush).not.toHaveBeenCalled();
  });

  it("merges and removes route selector parameters in place", () => {
    const { browser, history } = browserAt("https://kivelli.app/explore?world=juniper-city&intent=people");

    expect(updateLocalRouteParamsOnWeb({ world: "eos-meridian", intent: undefined })).toBe(true);

    expect(browser.location.href).toBe("https://kivelli.app/explore?world=eos-meridian");
    expect(history.replaceState).toHaveBeenCalledOnce();
  });
});
