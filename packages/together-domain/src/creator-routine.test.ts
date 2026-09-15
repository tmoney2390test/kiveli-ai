import { expect, it } from "vitest";
import {
  buildCreatorWeek,
  concreteRoutineActivity,
  scheduleBuildIssues,
} from "./creator-routine.ts";
import { routineConflicts } from "./creator.ts";
const activities = [
  "Music",
  "Video games",
  "Books",
  "Cooking",
  "Photography",
  "Painting",
  "Gardening",
  "Movies",
  "Exercise",
  "Masturbation",
];
let id = 0;
const input = {
  weekIndex: 0,
  preset: "regular",
  description: "Weekday work with quiet evenings at home.",
  occupation: "Chef",
  activities,
  homeLocationId: "home",
  workLocationId: "restaurant",
  locations: [{
    id: "restaurant",
    name: "Kitchen",
    category: "food",
    possible_activities: ["cooking"],
  }, {
    id: "gallery",
    name: "Gallery",
    category: "art",
    possible_activities: ["painting"],
  }],
  id: () => String(id++),
};
it("requires a real typical-week description and four distinct activities", () => {
  expect(scheduleBuildIssues("", activities.slice(0, 3))).toHaveLength(2);
  expect(
    scheduleBuildIssues(input.description, [
      "Music",
      " music ",
      "Music",
      "Cooking",
    ]),
  ).toHaveLength(1);
  expect(scheduleBuildIssues(input.description, activities)).toEqual([]);
});
it("uses concrete activity labels", () => {
  expect(concreteRoutineActivity("Making time for music")).toBe(
    "Listening to music",
  );
  expect(concreteRoutineActivity("Video games")).toBe("Playing video games");
});
it("fits all ten activities alongside work and home without overlap", () => {
  const blocks = buildCreatorWeek(input);
  expect(blocks.length).toBeLessThanOrEqual(28);
  expect(routineConflicts(blocks)).toEqual([]);
  for (const activity of activities) {
    expect(
      blocks.some((block) =>
        block.activity === concreteRoutineActivity(activity)
      ),
    ).toBe(true);
  }
  expect(
    blocks.filter((block) => block.activity === "Preparing food").every(
      (block) => block.locationId === "restaurant",
    ),
  ).toBe(true);
  expect(blocks.filter((block) => block.activity === "Sleeping")).toHaveLength(
    7,
  );
  const adult = blocks.find((block) =>
    block.activity === "Masturbating in private"
  );
  expect(adult).toMatchObject({ locationId: "home", availability: "busy" });
});
it("does not assign employment shifts to a retired character", () => {
  expect(
    buildCreatorWeek({ ...input, occupation: "Retired chef" }).some((block) =>
      block.activity === "Preparing food"
    ),
  ).toBe(false);
});
