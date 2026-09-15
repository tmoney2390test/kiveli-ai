import { describe, expect, it } from "vitest";
import { scheduleRunsOnDate } from "./schedule-rotation.ts";
import { buildCreatorWeek, routinePresets } from "./creator-routine.ts";
import { routineConflicts } from "./creator.ts";
describe("rotating companion weeks", () => {
  it("keeps legacy schedules weekly", () =>
    expect(scheduleRunsOnDate({}, "2026-09-21")).toBe(true));
  it("rotates on Monday and repeats across years", () => {
    const metadata = {
      cycleWeeks: 3,
      weekIndex: 0,
      cycleAnchorDate: "2026-12-28",
    };
    expect(scheduleRunsOnDate(metadata, "2027-01-03")).toBe(true);
    expect(scheduleRunsOnDate(metadata, "2027-01-04")).toBe(false);
    expect(scheduleRunsOnDate({ ...metadata, weekIndex: 1 }, "2027-01-04"))
      .toBe(true);
    expect(scheduleRunsOnDate({ ...metadata, weekIndex: 2 }, "2027-01-11"))
      .toBe(true);
    expect(scheduleRunsOnDate(metadata, "2027-01-18")).toBe(true);
  });
  it("uses the local date at a week boundary and through DST", () => {
    const metadata = {
      cycleWeeks: 2,
      weekIndex: 0,
      cycleAnchorDate: "2026-10-26",
    };
    expect(
      scheduleRunsOnDate(
        metadata,
        new Date("2026-11-02T02:00:00Z"),
        "America/New_York",
      ),
    ).toBe(true);
    expect(
      scheduleRunsOnDate(
        metadata,
        new Date("2026-11-02T06:00:00Z"),
        "America/New_York",
      ),
    ).toBe(false);
    expect(scheduleRunsOnDate(metadata, "2026-11-09")).toBe(true);
  });
  it("handles dates before the anchor and rejects unsupported cycles", () => {
    expect(
      scheduleRunsOnDate({
        cycleWeeks: 3,
        weekIndex: 2,
        cycleAnchorDate: "2026-09-14",
      }, "2026-09-07"),
    ).toBe(true);
    expect(scheduleRunsOnDate({ cycleWeeks: 4 }, "2026-09-14")).toBe(false);
  });
  let id = 0;
  const make = (preset: string, weekIndex = 0) =>
    buildCreatorWeek({
      preset,
      weekIndex,
      description: "quiet afternoons",
      occupation: "Artist",
      activities: ["Painting"],
      homeLocationId: "home",
      workLocationId: "studio",
      socialLocationId: "gallery",
      id: () => String(++id),
    });
  for (const preset of routinePresets) {
    it("builds a valid " + preset.label + " preview", () => {
      const blocks = make(preset.value);
      expect(blocks.length).toBeGreaterThan(0);
      expect(routineConflicts(blocks)).toEqual([]);
      expect(
        new Set(blocks.map((b) => b.id)).size,
      ).toBe(blocks.length);
    });
  }
  it("uses home routines and rotates shift times", () => {
    expect(make("home").filter((b) => b.availability === "busy")).toHaveLength(
      0,
    );
    expect(make("shift", 0)[0]?.startMinute).not.toBe(
      make("shift", 1)[0]?.startMinute,
    );
  });
  it("allows identical slots in other weeks but rejects overlapping blocks in one week", () => {
    const first = make("regular"),
      second = make("regular", 1),
      third = make("regular", 2);
    expect(routineConflicts([...first, ...second, ...third])).toEqual([]);
    expect(
      routineConflicts([...first, { ...first[0]!, id: "collision" }]).length,
    ).toBeGreaterThan(0);
  });
});
