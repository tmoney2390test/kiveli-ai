import { describe, expect, it } from "vitest";
import {
  groupMediaNeedsRefresh,
  groupRecipientRequest,
  groupTimelineDayLabel,
  groupTurnStatusLabel,
  groupWelcomePrompts,
} from "./groupChatPresentation";

describe("group chat timeline presentation", () => {
  const now = new Date("2026-08-22T12:00:00");

  it("labels the first message today and suppresses repeated same-day labels", () => {
    expect(groupTimelineDayLabel("2026-08-22T08:00:00", undefined, now)).toBe(
      "TODAY",
    );
    expect(
      groupTimelineDayLabel("2026-08-22T09:00:00", "2026-08-22T08:00:00", now),
    ).toBeNull();
  });

  it("labels yesterday and older local dates", () => {
    expect(groupTimelineDayLabel("2026-08-21T18:00:00", undefined, now)).toBe(
      "YESTERDAY",
    );
    expect(groupTimelineDayLabel("2026-08-19T18:00:00", undefined, now))
      .toContain("AUG");
  });

  it("keeps refreshing accepted group photos until their media is terminal", () => {
    expect(groupMediaNeedsRefresh([], [{
      status: "accepted",
      generated_media_id: "photo",
    }])).toBe(true);
    expect(groupMediaNeedsRefresh([{ id: "photo", status: "generating" }], [
      { status: "accepted", generated_media_id: "photo" },
    ])).toBe(true);
    expect(groupMediaNeedsRefresh([{ id: "photo", status: "ready" }], [{
      status: "accepted",
      generated_media_id: "photo",
    }])).toBe(false);
    expect(groupMediaNeedsRefresh([{ id: "photo", status: "failed" }], [{
      status: "accepted",
      generated_media_id: "photo",
    }])).toBe(false);
  });

  it("turns recipient choices into safe per-message routing overrides", () => {
    expect(groupRecipientRequest("automatic", ["a", "b"])).toEqual({});
    expect(groupRecipientRequest("everyone", ["a", "b"])).toEqual({
      broadGroupRequest: true,
    });
    expect(groupRecipientRequest("b", ["a", "b"])).toEqual({
      manualSpeakerInstanceId: "b",
    });
    expect(groupRecipientRequest("removed", ["a", "b"])).toEqual({});
  });

  it("describes routing and active replies clearly", () => {
    expect(groupTurnStatusLabel([], true)).toBe("Choosing who responds…");
    expect(groupTurnStatusLabel([{ name: "Iris" }], true)).toBe(
      "Iris is replying…",
    );
    expect(groupTurnStatusLabel([{ name: "Iris" }, { name: "Maya" }], true))
      .toBe("Iris and Maya are replying…");
    expect(groupTurnStatusLabel([], false)).toBeNull();
  });

  it("builds useful empty-group prompts from the current roster", () => {
    expect(groupWelcomePrompts(["Iris", "Maya"])).toEqual([
      "What is everyone up to right now?",
      "Iris, ask Maya something you have always wondered.",
      "Let us make a plan together.",
    ]);
  });
});
