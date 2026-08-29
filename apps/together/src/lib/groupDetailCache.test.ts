import { describe, expect, it } from "vitest";
import type { GroupDetail } from "../types";
import {
  cacheCompleteGroupDetail,
  cacheGroupDetailSummary,
  clearGroupDetailCache,
  readCachedGroupDetail,
} from "./groupDetailCache";

function detail(id: string, title: string, messages: GroupDetail["messages"] = []) {
  return {
    conversation: { id, title } as GroupDetail["conversation"],
    participants: [],
    messages,
    reactions: [],
    generatedMedia: [],
    mediaOffers: [],
    sharedPlans: [],
    conversationActions: [],
    conversationEvents: [],
    settings: {} as GroupDetail["settings"],
  };
}

describe("group detail cache", () => {
  it("makes a rail summary available before the timeline request completes", () => {
    clearGroupDetailCache();
    cacheGroupDetailSummary("life-a", detail("group-a", "Weekend plans"));

    expect(readCachedGroupDetail("life-a", "group-a")).toMatchObject({
      complete: false,
      detail: { conversation: { title: "Weekend plans" } },
    });
  });

  it("keeps a complete timeline when a newer rail summary arrives", () => {
    clearGroupDetailCache();
    const message = { id: "message-a" } as GroupDetail["messages"][number];
    cacheCompleteGroupDetail(
      "life-a",
      detail("group-a", "Old title", [message]),
    );
    cacheGroupDetailSummary("life-a", detail("group-a", "New title"));

    const cached = readCachedGroupDetail("life-a", "group-a");
    expect(cached?.complete).toBe(true);
    expect(cached?.detail.conversation.title).toBe("New title");
    expect(cached?.detail.messages).toEqual([message]);
  });

  it("isolates cached groups by continuity", () => {
    clearGroupDetailCache();
    cacheGroupDetailSummary("life-a", detail("group-a", "Life A"));

    expect(readCachedGroupDetail("life-b", "group-a")).toBeUndefined();
  });
});
