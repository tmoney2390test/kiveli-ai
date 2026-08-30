import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
  },
}));

import {
  loadInboxFilter,
  messageInboxFilterKey,
  normalizeInboxFilter,
  saveInboxFilter,
} from "./messageInboxPreference";

describe("message inbox filter preference", () => {
  beforeEach(() => storage.clear());

  it("scopes the saved filter to the account and Life", () => {
    expect(messageInboxFilterKey("user-1", "life-2")).toBe(
      "kivelle:message-inbox-filter:v1:user-1:life-2",
    );
  });

  it("round-trips every supported filter", async () => {
    await saveInboxFilter("user-1", "life-1", "unread");
    expect(await loadInboxFilter("user-1", "life-1")).toBe("unread");
  });

  it("falls back to All for corrupt or obsolete values", () => {
    expect(normalizeInboxFilter("priority")).toBe("all");
    expect(normalizeInboxFilter(null)).toBe("all");
  });
});
