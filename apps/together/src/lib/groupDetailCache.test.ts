import { afterEach, describe, expect, it } from "vitest";
import type { GroupDetail } from "../types";
import {
  cacheCompleteGroupDetail,
  cacheGroupDetailSummary,
  cacheInboxGroupSummary,
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
  afterEach(() => {
    clearGroupDetailCache();
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

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

  it("turns an inbox group into a renderable chat shell", () => {
    const inbox = detail("group-a", "Friends");
    inbox.conversation.metadata = {
      groupSettings: { responseMode: "choose_speaker", energy: "lively", notificationMode: "muted" },
    };
    cacheInboxGroupSummary("life-a", {
      conversation: inbox.conversation,
      participants: inbox.participants,
    });

    expect(readCachedGroupDetail("life-a", "group-a")).toMatchObject({
      complete: false,
      detail: {
        conversation: { title: "Friends" },
        settings: { responseMode: "choose_speaker", energy: "lively", notificationMode: "muted" },
        messages: [],
      },
    });
  });

  it("restores a lightweight group shell across a web document navigation", () => {
    const values = new Map<string, string>();
    const storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } as Storage;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
    const message = { id: "private-message" } as GroupDetail["messages"][number];

    cacheCompleteGroupDetail("life-a", detail("group-a", "Persistent shell", [message]));
    const persisted = [...values.values()][0];
    clearGroupDetailCache("life-a");
    if (persisted) values.set("kivelle:group-summary:v1:life-a:group-a", persisted);

    const cached = readCachedGroupDetail("life-a", "group-a");
    expect(cached?.complete).toBe(false);
    expect(cached?.detail.conversation.title).toBe("Persistent shell");
    expect(cached?.detail.messages).toEqual([]);
  });
});
