import { describe, expect, it } from "vitest";
import {
  groupMediaNeedsRefresh,
  groupTimelineDayLabel,
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
});
