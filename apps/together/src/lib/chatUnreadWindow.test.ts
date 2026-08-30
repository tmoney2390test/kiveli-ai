import { describe, expect, it } from "vitest";
import { firstUnreadMessageId, wasUnreadWhenChatOpened } from "./chatUnreadWindow";

const window = {
  lastReadAt: "2026-08-24T14:00:00.000Z",
  openedAt: "2026-08-24T14:05:00.000Z",
};

describe("wasUnreadWhenChatOpened", () => {
  it("includes a message that arrived before the chat opened", () => {
    expect(wasUnreadWhenChatOpened("2026-08-24T14:03:00.000Z", window)).toBe(true);
  });

  it("excludes a response delivered while the chat is open", () => {
    expect(wasUnreadWhenChatOpened("2026-08-24T14:05:01.000Z", window)).toBe(false);
  });

  it("excludes messages that were already read", () => {
    expect(wasUnreadWhenChatOpened("2026-08-24T14:00:00.000Z", window)).toBe(false);
  });

  it("fails closed when the unread boundary is unavailable", () => {
    expect(wasUnreadWhenChatOpened("2026-08-24T14:03:00.000Z", {
      lastReadAt: null,
      openedAt: window.openedAt,
    })).toBe(false);
  });
});

describe("firstUnreadMessageId", () => {
  it("returns the first assistant message waiting when the chat opened", () => {
    const messages = [
      { id: "newer", role: "assistant", created_at: "2026-08-30T10:04:00.000Z" },
      { id: "user", role: "user", created_at: "2026-08-30T10:02:00.000Z" },
      { id: "first", role: "assistant", created_at: "2026-08-30T10:01:00.000Z" },
    ];
    expect(firstUnreadMessageId(messages, {
      lastReadAt: "2026-08-30T10:00:00.000Z",
      openedAt: "2026-08-30T10:03:00.000Z",
    })).toBe("first");
  });
});
