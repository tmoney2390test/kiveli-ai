import { afterEach, describe, expect, it } from "vitest";
import type { GroupDetail } from "../types";
import {
  cacheCompleteGroupDetail,
  cacheGroupDetailSummary,
  cacheInboxGroupSummary,
  clearGroupDetailCache,
  prefetchCompleteGroupDetail,
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

  it("coalesces group timeline warmups and stores the complete result", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await Promise.resolve();
      return detail("group-a", "Warm group");
    };

    const [first, second] = await Promise.all([
      prefetchCompleteGroupDetail("life-a", "group-a", loader),
      prefetchCompleteGroupDetail("life-a", "group-a", loader),
    ]);

    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(readCachedGroupDetail("life-a", "group-a")?.complete).toBe(true);
  });

  it("refreshes a complete group timeline when the caller requires fresh data", async () => {
    cacheCompleteGroupDetail("user-a:life-a",detail("group-a","Cached group"));
    let calls=0;
    const refreshed=await prefetchCompleteGroupDetail("user-a:life-a","group-a",()=>{
      calls+=1;
      return Promise.resolve(detail("group-a","Refreshed group"));
    },{maxAgeMs:-1});
    expect(calls).toBe(1);
    expect(refreshed.conversation.title).toBe("Refreshed group");
  });

  it('keeps cleared Life data out of memory and session storage after a late read', async () => {
    let finish!: (value: GroupDetail) => void;
    const pending = prefetchCompleteGroupDetail('user:life-a', 'group-a', () => new Promise(resolve => { finish = resolve; }));
    cacheCompleteGroupDetail('user:life-b', detail('group-b','Other Life'));
    clearGroupDetailCache('user:life-a');
    finish(detail('group-a','Old private group'));
    await pending;
    expect(readCachedGroupDetail('user:life-a','group-a')).toBeUndefined();
    expect(readCachedGroupDetail('user:life-b','group-b')?.complete).toBe(true);
  });

  it('preserves a new session request when the old request finishes after clearing', async () => {
    let finishOld!: (value: GroupDetail) => void;
    let finishNew!: (value: GroupDetail) => void;
    const old = prefetchCompleteGroupDetail('user:life', 'group', () => new Promise(resolve => { finishOld = resolve; }));
    clearGroupDetailCache();
    const current = prefetchCompleteGroupDetail('user:life','group', () => new Promise(resolve => { finishNew = resolve; }));
    finishOld(detail('group','Old result')); await old;
    let extraCalls = 0;
    const joined = prefetchCompleteGroupDetail('user:life','group', () => { extraCalls++; return Promise.resolve(detail('group','Unexpected')); });
    expect(joined).toBe(current);
    expect(extraCalls).toBe(0);
    finishNew(detail('group','Current result')); await current;
    expect(readCachedGroupDetail('user:life','group')?.detail.conversation.title).toBe('Current result');
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
