import { describe, expect, it } from "vitest";
import { chatBottomDistance, isChatNearBottom } from "./chatScroll";

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
});
