import type { CreatorRoutineBlock } from "./creator.ts";
export const routinePresets = [
  { value: "regular", label: "Regular weekdays" },
  { value: "night", label: "Night owl" },
  { value: "flexible", label: "Flexible" },
  { value: "shift", label: "Shift work" },
  { value: "home", label: "Mostly at home" },
  { value: "custom", label: "Custom" },
];
export function routinePreset(value: string): string {
  if (routinePresets.some((p) => p.value === value)) return value;
  if (/night|late/i.test(value)) return "night";
  if (/home|gaming|video games/i.test(value)) return "home";
  if (/shift/i.test(value)) return "shift";
  if (/flexible|spontaneous/i.test(value) && !/weekday/i.test(value)) {
    return "flexible";
  }
  if (/weekday|professional|structured/i.test(value)) return "regular";
  return "custom";
}
export function buildCreatorWeek(
  input: {
    weekIndex: number;
    preset: string;
    description: string;
    occupation: string;
    activities: string[];
    homeLocationId: string;
    workLocationId?: string | null;
    socialLocationId?: string;
    id: () => string;
  },
): CreatorRoutineBlock[] {
  const blocks: CreatorRoutineBlock[] = [];
  const mode = input.preset === "custom"
    ? routinePreset(input.description)
    : input.preset;
  const hobby = input.activities[0]?.toLowerCase() || "personal interests";
  const add = (
    day: number,
    start: number,
    end: number,
    locationId: string,
    activity: string,
    availability: CreatorRoutineBlock["availability"],
  ) =>
    blocks.push({
      id: input.id(),
      weekIndex: input.weekIndex,
      dayOfWeek: day,
      startMinute: start,
      endMinute: end,
      locationId,
      activity: activity.slice(0, 160),
      availability,
      energyDelta: availability === "busy" ? -1 : 1,
    });
  const days = mode === "shift"
    ? [0, 2, 4, 6]
    : mode === "flexible"
    ? [1, 3, 5]
    : [1, 2, 3, 4, 5];
  for (const day of days) {
    if (mode === "home") {
      add(
        day,
        600,
        960,
        input.homeLocationId,
        "Making time for " + hobby,
        "limited",
      );
    } else {
      const start = mode === "night"
        ? 960
        : mode === "shift"
        ? (input.weekIndex % 2 ? 840 : 360)
        : mode === "flexible"
        ? 660
        : 540;
      add(
        day,
        start,
        Math.min(1440, start + (mode === "flexible" ? 240 : 480)),
        input.workLocationId || input.homeLocationId,
        "Working as " + input.occupation.toLowerCase(),
        "busy",
      );
    }
  }
  // Free days and interests are explicit; the preview never silently adds overlap.
  for (const day of [0, 1, 2, 3, 4, 5, 6].filter((d) => !days.includes(d))) {
    add(
      day,
      mode === "night" ? 840 : 660,
      mode === "night" ? 1020 : 840,
      input.socialLocationId || input.homeLocationId,
      "Making time for " + hobby,
      "available",
    );
  }
  if (mode === "home") {
    add(3, 1020, 1140, input.homeLocationId, "Quiet time at home", "available");
  }
  return blocks;
}
export function routineInputKey(
  life: {
    homeLocationId: string;
    workLocationId?: string | null;
    lifestyle: string;
    scheduleStyle: string;
    preferredActivities: string[];
  },
  occupation: string,
): string {
  return JSON.stringify([
    life.homeLocationId,
    life.workLocationId,
    life.lifestyle,
    life.scheduleStyle,
    life.preferredActivities,
    occupation,
  ]);
}
