import { describe, expect, it } from "vitest";
import type { GroupDetail, GroupDetailDelta, GroupTimelinePage } from "../types";
import {
  applyGroupDetailDelta,
  prependGroupTimelinePage,
} from "./groupDetailReconciliation";

const base = {
  conversation: { id: "c" },
  participants: [],
  messages: [{ id: "m2", created_at: "2026-01-02" }],
  reactions: [],
  generatedMedia: [{
    id: "p",
    created_at: "2026-01-02",
    status: "generating",
    signed_url: null,
  }],
  mediaOffers: [],
  sharedPlans: [],
  conversationActions: [],
  conversationEvents: [],
  settings: { responseMode: "automatic", energy: "balanced" },
  hasMoreMessages: true,
  syncedAt: "2026-01-02",
} as unknown as GroupDetail;

describe("group detail reconciliation", () => {
  it("merges realtime deltas without replacing the loaded timeline", () => {
    const delta = {
      conversation: { id: "c", title: "Friends" },
      messages: [{ id: "m3", created_at: "2026-01-03" }],
      reactions: [],
      generatedMedia: [{
        id: "p",
        created_at: "2026-01-02",
        status: "ready",
        signed_url: "signed",
      }],
      mediaOffers: [],
      sharedPlans: [],
      conversationActions: [],
      conversationEvents: [],
      syncedAt: "2026-01-03",
    } as unknown as GroupDetailDelta;
    const next = applyGroupDetailDelta(base, delta);
    expect(next.messages.map((item) => item.id)).toEqual(["m2", "m3"]);
    expect(next.generatedMedia[0]?.status).toBe("ready");
    expect(next.conversation.title).toBe("Friends");
  });

  it("prepends an older page and preserves newer messages", () => {
    const page = {
      messages: [{ id: "m1", created_at: "2026-01-01" }],
      reactions: [],
      generatedMedia: [],
      mediaOffers: [],
      hasMore: false,
    } as unknown as GroupTimelinePage;
    const next = prependGroupTimelinePage(base, page);
    expect(next.messages.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(next.hasMoreMessages).toBe(false);
  });
});
