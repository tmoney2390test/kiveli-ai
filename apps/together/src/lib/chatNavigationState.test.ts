import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatScrollPosition,
  readChatScrollPosition,
  restoredChatOffset,
  saveChatScrollPosition,
  shouldRestoreChatScrollPosition,
} from "./chatNavigationState";

describe("chat navigation state", () => {
  beforeEach(() => clearChatScrollPosition("conversation"));

  it("restores a meaningful reading position", () => {
    saveChatScrollPosition("conversation", {
      offsetY: 420,
      contentHeight: 1_500,
      viewportHeight: 600,
    }, 1_000);
    const saved = readChatScrollPosition("conversation", 2_000);
    expect(shouldRestoreChatScrollPosition(saved)).toBe(true);
    expect(restoredChatOffset(saved!, 1_500)).toBe(420);
  });

  it("does not restore a position already near the latest message", () => {
    saveChatScrollPosition("conversation", {
      offsetY: 850,
      contentHeight: 1_500,
      viewportHeight: 600,
    }, 1_000);
    expect(shouldRestoreChatScrollPosition(readChatScrollPosition("conversation", 2_000))).toBe(false);
  });

  it("expires old positions and clamps restored offsets", () => {
    saveChatScrollPosition("conversation", {
      offsetY: 900,
      contentHeight: 1_800,
      viewportHeight: 600,
    }, 1_000);
    const saved = readChatScrollPosition("conversation", 2_000)!;
    expect(restoredChatOffset(saved, 1_000)).toBe(400);
    expect(readChatScrollPosition("conversation", 31 * 60 * 1_000)).toBeNull();
  });
});
