import { describe, expect, it } from "vitest";
import { mediaDuringRouteRecovery, mediaRouteFailureState, resolveMediaRoutePresentation } from "./mediaRouteRecovery";

describe("media route recovery", () => {
  it("loads a routed photo that is temporarily absent from the snapshot", () => {
    expect(resolveMediaRoutePresentation({ routeId: "next", snapshotReady: true, recovery: null })).toBe("loading");
    expect(resolveMediaRoutePresentation({ routeId: "next", snapshotReady: true, recovery: { id: "next", state: "loading" } })).toBe("loading");
  });

  it("shows the photo as soon as secure status recovery returns it", () => {
    expect(resolveMediaRoutePresentation({ routeId: "next", snapshotReady: true, mediaId: "next", recovery: null })).toBe("ready");
  });

  it("only calls a photo removed after the server returns not found", () => {
    expect(mediaRouteFailureState({ code: "NOT_FOUND" })).toBe("missing");
    expect(mediaRouteFailureState({ code: "INTERNAL_ERROR" })).toBe("retry");
    expect(mediaRouteFailureState(new Error("offline"))).toBe("retry");
  });

  it("keeps an open video mounted while a snapshot omission is recovered", () => {
    const video = { id: "video-1", status: "ready" };
    expect(mediaDuringRouteRecovery({ routeId: "video-1", retainedMedia: video, recovery: { id: "video-1", state: "loading" } })).toBe(video);
    expect(mediaDuringRouteRecovery({ routeId: "video-1", retainedMedia: video, recovery: { id: "video-1", state: "retry" } })).toBe(video);
  });

  it("releases retained media after the server confirms it is gone", () => {
    const video = { id: "video-1", status: "ready" };
    expect(mediaDuringRouteRecovery({ routeId: "video-1", retainedMedia: video, recovery: { id: "video-1", state: "missing" } })).toBeUndefined();
    expect(mediaDuringRouteRecovery({ routeId: "video-2", retainedMedia: video, recovery: null })).toBeUndefined();
  });
});
