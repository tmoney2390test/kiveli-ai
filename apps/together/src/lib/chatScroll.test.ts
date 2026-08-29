import { describe, expect, it } from "vitest";
import {
  chatBottomDistance,
  isChatNearBottom,
  preservedPrependOffset,
  shouldLoadOlderChatMessages,
  shouldKeepChatPinned,
} from "./chatScroll";

describe("chat scroll anchoring", () => {
  it("keeps a timeline pinned when it is already near the latest message", () => {
    expect(isChatNearBottom({
      contentHeight: 2_000,
      viewportHeight: 700,
      offsetY: 1_150,
    })).toBe(true);
  });

  it("does not pull someone away from older messages", () => {
    expect(isChatNearBottom({
      contentHeight: 2_000,
      viewportHeight: 700,
      offsetY: 700,
    })).toBe(false);
  });

  it("handles timelines shorter than the viewport", () => {
    const metrics = { contentHeight: 500, viewportHeight: 700, offsetY: 0 };
    expect(chatBottomDistance(metrics)).toBe(0);
    expect(isChatNearBottom(metrics)).toBe(true);
  });

  it("does not let insertion-driven scroll events cancel a requested bottom pin", () => {
    const metrics = {
      contentHeight: 3_000,
      viewportHeight: 700,
      offsetY: 1_000,
    };
    expect(shouldKeepChatPinned(metrics, 10_800, 10_000)).toBe(true);
    expect(shouldKeepChatPinned(metrics, 9_999, 10_000)).toBe(false);
  });

  it("preserves the visible anchor when older rows are prepended", () => {
    expect(preservedPrependOffset({
      previousOffsetY: 4_200,
      previousContentHeight: 5_000,
      nextContentHeight: 7_400,
    })).toBe(6_600);
  });

  it("loads history only from an upward user scroll, never a pinned or programmatic jump", () => {
    const base = {
      bottomAligned: true,
      offsetY: 40,
      previousOffsetY: 100,
      now: 10_000,
      programmaticScrollUntil: 0,
      forcedBottomPin: false,
    };
    expect(shouldLoadOlderChatMessages(base)).toBe(true);
    expect(shouldLoadOlderChatMessages({ ...base, forcedBottomPin: true })).toBe(false);
    expect(shouldLoadOlderChatMessages({ ...base, programmaticScrollUntil: 10_200 })).toBe(false);
    expect(shouldLoadOlderChatMessages({ ...base, offsetY: 60, previousOffsetY: 40 })).toBe(false);
  });
});
