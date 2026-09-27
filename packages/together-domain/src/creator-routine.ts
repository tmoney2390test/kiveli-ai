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
export function scheduleBuildIssues(
  description: string,
  activities: string[],
): string[] {
  const issues: string[] = [];
  if (description.trim().length < 20) {
    issues.push("Describe a typical week in at least 20 characters.");
  }
  if (
    new Set(
      activities.map((value) => value.trim().toLowerCase()).filter(Boolean),
    ).size < 4
  ) issues.push("Add at least 4 different activities.");
  return issues;
}
export function isPrivateRoutineActivity(value: string): boolean {
  return /\b(sex|sexual|masturbat\w*|orgasm\w*|nude|naked|erotic|bdsm|intimacy|intimate|kink\w*|porn\w*)\b/i
    .test(value);
}
export function concreteRoutineActivity(value: string): string {
  const text = value.trim().replace(
    /^(making time for|spending time on)\s+/i,
    "",
  );
  const rules: Array<[RegExp, string]> = [
    [/^(music|jazz)$/i, "Listening to " + text.toLowerCase()],
    [/^(gaming|video games)$/i, "Playing video games"],
    [/^(books|reading)$/i, "Reading a book"],
    [/^(movies|films)$/i, "Watching a film"],
    [/^(food|cooking)$/i, "Cooking a meal"],
    [/^photography$/i, "Taking photographs"],
    [/^(art|painting)$/i, "Painting"],
    [/^(fitness|gym|exercise)$/i, "Working out"],
    [/^(outdoors|nature)$/i, "Going for a walk"],
    [/^gardening$/i, "Tending the garden"],
    [/^travel$/i, "Exploring the neighborhood"],
    [/^masturbation$/i, "Masturbating in private"],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Relaxing at home";
}
export type CreatorWeekInput = {
  weekIndex: number;
  preset: string;
  description: string;
  occupation: string;
  biography?: string;
  interests?: string[];
  activities: string[];
  homeLocationId: string;
  workLocationId?: string | null;
  socialLocationId?: string;
  locations?: Array<
    {
      id: string;
      name: string;
      description?: string;
      category?: string;
      possible_activities?: string[];
      hours?: Record<string, unknown>;
    }
  >;
  id: () => string;
};
export function buildCreatorWeek(
  input: CreatorWeekInput,
): CreatorRoutineBlock[] {
  const blocks: CreatorRoutineBlock[] = [];
  const mode = input.preset === "custom"
    ? routinePreset(input.description)
    : input.preset;
  const home = input.homeLocationId;
  const workDays = mode === "shift"
    ? [0, 2, 4, 6]
    : mode === "flexible"
    ? [1, 3, 5]
    : [1, 2, 3, 4, 5];
  const hasJob = !/\b(retired|unemployed|no job|stay.at.home)\b/i.test(
    input.occupation,
  );
  const late = mode === "night",
    early = mode === "shift" && input.weekIndex % 2 === 0;
  const start = late
    ? 960
    : early
    ? 360
    : mode === "shift"
    ? 840
    : mode === "flexible"
    ? 660
    : 540;
  const end = start + (mode === "flexible" ? 240 : 480);
  const job = [
    [/chef|cook|baker/i, "Preparing food"],
    [/bartend|tavern|bar staff/i, "Serving drinks"],
    [/artist|painter/i, "Painting commissions"],
    [/musician/i, "Rehearsing music"],
    [/writer/i, "Writing"],
    [/teacher/i, "Teaching classes"],
    [/doctor|nurse/i, "Caring for patients"],
    [/developer|programmer/i, "Writing software"],
    [/architect/i, "Drawing building plans"],
    [/photographer/i, "Photographing clients"],
  ] as Array<[RegExp, string]>;
  const work = job.find(([pattern]) => pattern.test(input.occupation))?.[1] ??
    "Working a shift as " + input.occupation.toLowerCase();
  const add = (
    day: number,
    startMinute: number,
    endMinute: number,
    locationId: string,
    activity: string,
    availability: CreatorRoutineBlock["availability"],
  ) =>
    blocks.push({
      id: input.id(),
      weekIndex: input.weekIndex,
      dayOfWeek: day,
      startMinute,
      endMinute,
      locationId,
      activity: activity.slice(0, 160),
      availability,
      energyDelta: availability === "busy" ? -1 : 1,
    });
  let index = input.weekIndex;
  const hobby = (day: number, startMinute: number, endMinute: number) => {
    const raw = input.activities[index++ % input.activities.length] ||
        "Relaxing at home",
      activity = concreteRoutineActivity(raw);
    const privateActivity = isPrivateRoutineActivity(raw);
    const words = raw.toLowerCase().split(/\W+/).filter((word) =>
      word.length > 3
    );
    const place = !privateActivity &&
      input.locations?.map((place) => ({
        place,
        score: words.filter((word) =>
          [
            place.name,
            place.description,
            place.category,
            ...(place.possible_activities ?? []),
          ].join(" ").toLowerCase().includes(word)
        ).length,
      })).sort((a, b) => b.score - a.score).find((item) => item.score > 0)
        ?.place;
    add(
      day,
      startMinute,
      endMinute,
      privateActivity ? home : (place && place.id) || home,
      activity,
      privateActivity ? "busy" : "available",
    );
  };
  for (let day = 0; day < 7; day++) {
    const working = hasJob && workDays.includes(day),
      wake = working && early ? 300 : 480;
    add(day, 0, wake, home, "Sleeping", "busy");
    add(
      day,
      wake,
      wake + 60,
      home,
      "Eating breakfast and getting ready",
      "limited",
    );
    if (working) {
      add(
        day,
        start,
        end,
        mode === "home" ? home : input.workLocationId || home,
        work,
        "busy",
      );
      if (start >= 840) hobby(day, 660, 780);
      else {hobby(
          day,
          Math.max(end + 60, 1020),
          Math.min(Math.max(end + 180, 1140), 1380),
        );}
    } else {
      hobby(day, 600, 720);
      hobby(day, 960, 1080);
    }
  }
  // If a long activity list outnumbers the free-time slots, replace a breakfast
  // slot rather than dropping an interest or exceeding the 28-block limit.
  for (
    const breakfast of [...blocks].filter((block) =>
      block.activity === "Eating breakfast and getting ready"
    )
  ) {
    if (index - input.weekIndex >= input.activities.length) break;
    blocks.splice(blocks.indexOf(breakfast), 1);
    hobby(breakfast.dayOfWeek, breakfast.startMinute, breakfast.endMinute);
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
