import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatScrollPosition,
  chatAdvancedSincePosition,
  readChatScrollPosition,
  restoredChatOffset,
  newestChatTimestamp,
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

  it("opens at the latest reply when the conversation advanced while away", () => {
    saveChatScrollPosition("conversation", {
      offsetY: 420,
      contentHeight: 1_500,
      viewportHeight: 600,
      latestMessageAt: "2026-10-05T12:00:00.000Z",
    }, 1_000);
    const saved = readChatScrollPosition("conversation", 2_000);
    expect(shouldRestoreChatScrollPosition(saved, 96, "2026-10-05T12:01:00.000Z")).toBe(false);
    expect(shouldRestoreChatScrollPosition(saved, 96, "2026-10-05T12:00:00.000Z")).toBe(true);
    expect(chatAdvancedSincePosition(saved, "2026-10-05T12:01:00.000Z")).toBe(true);
    expect(chatAdvancedSincePosition(saved, "2026-10-05T12:00:00.000Z")).toBe(false);
  });

  it('uses a newly cached reply when the inbox timestamp has not caught up', () => {
    const latest = newestChatTimestamp('2026-10-05T12:00:00.000Z', '2026-10-05T12:01:00.000Z');
    saveChatScrollPosition('conversation', {
      offsetY: 420, contentHeight: 1_500, viewportHeight: 600,
      latestMessageAt: '2026-10-05T12:00:00.000Z',
    }, 1_000);
    expect(shouldRestoreChatScrollPosition(readChatScrollPosition('conversation', 2_000), 96, latest)).toBe(false);
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
