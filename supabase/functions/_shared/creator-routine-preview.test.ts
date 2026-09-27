import { validateRoutineProposal } from "./creator-routine-preview.ts";
const home = "00000000-0000-4000-8000-000000000001",
  venue = "00000000-0000-4000-8000-000000000002";
const context = {
  weekIndex: 2,
  homeLocationId: home,
  workLocationId: venue,
  activities: ["Music", "Reading", "Painting", "Masturbation"],
  locations: [{ id: home }, { id: venue }],
  adultAllowed: true,
};
const blocks = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  startMinute: 600,
  endMinute: 660,
  locationId: venue,
  activity: [
    "Listening to music",
    "Reading",
    "Painting",
    "Masturbating in private",
  ][dayOfWeek % 4],
  sourceActivity: dayOfWeek % 4,
  availability: "available",
}));
function rejects(fn: () => unknown) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  if (!failed) throw Error("Expected validation failure");
}
Deno.test("routine preview preserves week and moves adult personal time home", () => {
  const result = validateRoutineProposal({ blocks }, context);
  if (
    !result.every((b) => b.weekIndex === 2) || result[3].locationId !== home ||
    result[3].availability !== "busy"
  ) throw Error("Invalid privacy or week");
});
Deno.test("routine preview rejects overlaps, unknown places and omitted activities", () => {
  rejects(() =>
    validateRoutineProposal({
      blocks: [...blocks, { ...blocks[0], startMinute: 610 }],
    }, context)
  );
  rejects(() =>
    validateRoutineProposal({
      blocks: blocks.map((b) => ({
        ...b,
        locationId: "00000000-0000-4000-8000-000000000009",
      })),
    }, context)
  );
  rejects(() =>
    validateRoutineProposal({
      blocks: blocks.map((b) => ({ ...b, sourceActivity: 0 })),
    }, context)
  );
});
Deno.test("routine preview rejects adult output without authorization and generic labels", () => {
  rejects(() =>
    validateRoutineProposal({ blocks }, { ...context, adultAllowed: false })
  );
  rejects(() =>
    validateRoutineProposal({
      blocks: blocks.map((b) => ({ ...b, activity: "Making time for music" })),
    }, context)
  );
});
