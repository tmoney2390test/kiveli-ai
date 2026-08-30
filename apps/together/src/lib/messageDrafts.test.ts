import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    multiGet: vi.fn((keys: string[]) => Promise.resolve(keys.map((key) => [key, storage.get(key) ?? null]))),
  },
}));

import { loadMessageDrafts, messageDraftKey, saveMessageDraft } from "./messageDrafts";

describe("message draft inbox hydration", () => {
  beforeEach(() => storage.clear());

  it("loads direct and group drafts into a conversation map", async () => {
    await saveMessageDraft("user-1", "direct-1", "direct", "Hi there");
    await saveMessageDraft("user-1", "group-1", "group", "Everyone free?");
    expect(await loadMessageDrafts("user-1", [
      { id: "direct-1", kind: "direct" },
      { id: "group-1", kind: "group" },
      { id: "empty", kind: "direct" },
    ])).toEqual({ "direct-1": "Hi there", "group-1": "Everyone free?" });
    expect(storage.has(messageDraftKey("user-1", "empty", "direct"))).toBe(false);
  });
});
