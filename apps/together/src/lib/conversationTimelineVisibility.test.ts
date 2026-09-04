import { describe, expect, it } from "vitest";
import { hasCoherentConversationTimeline } from "./conversationTimelineVisibility";

describe("conversation timeline visibility", () => {
  it("keeps timeline events hidden while a different conversation is loaded", () => {
    expect(hasCoherentConversationTimeline({
      activeConversationId: "new-chat",
      loadedConversationId: "old-chat",
    })).toBe(false);
  });

  it("reveals the timeline once the active message page is loaded", () => {
    expect(hasCoherentConversationTimeline({
      activeConversationId: "new-chat",
      loadedConversationId: "new-chat",
    })).toBe(true);
  });

  it("allows a complete group cache but rejects a summary-only group shell", () => {
    expect(hasCoherentConversationTimeline({
      activeConversationId: "group-chat",
      hasCompleteCachedTimeline: false,
    })).toBe(false);
    expect(hasCoherentConversationTimeline({
      activeConversationId: "group-chat",
      hasCompleteCachedTimeline: true,
    })).toBe(true);
  });
});
