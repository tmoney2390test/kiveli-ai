import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { resolveMediaCaptureLighting, resolveMediaCaptureTime } from "./together-media-time.ts";

Deno.test("a confirmed photo keeps the hour when the user requested it", () => {
  const confirmedAt = new Date("2026-09-30T13:00:00Z");
  const requestedAt = resolveMediaCaptureTime("2026-09-30T02:00:00Z", confirmedAt);
  assertEquals(requestedAt.toISOString(), "2026-09-30T02:00:00.000Z");
  assertEquals(resolveMediaCaptureTime("invalid", confirmedAt), confirmedAt);
  assertEquals(resolveMediaCaptureTime("2026-10-01T02:00:00Z", confirmedAt), confirmedAt);
});

Deno.test("an outdoor request at 10 PM requires a visibly nighttime photograph", () => {
  const lighting = resolveMediaCaptureLighting({
    requestText: "send me a selfie outside",
    localTime: "22:00",
    localIso: "2026-09-03T22:00:00-04:00",
    timezone: "America/New_York",
    daypart: "late_night",
    indoorOutdoor: "outdoor",
  });

  assertEquals(lighting.effectiveDaypart, "night");
  assertEquals(lighting.source, "canonical_clock");
  assertStringIncludes(lighting.instruction, "OUTDOOR NIGHT REQUIRED");
  assertStringIncludes(lighting.instruction, "No daylight");
  assertStringIncludes(lighting.instruction, "Reference images establish identity and place, not capture time");
  assertStringIncludes(lighting.shortInstruction, "NIGHT photo");
  assertStringIncludes(lighting.qualityInstruction, "FAIL time_mismatch");
});

Deno.test("a nighttime interior stays readable while exterior cues remain dark", () => {
  const lighting = resolveMediaCaptureLighting({
    requestText: "take a photo in the hotel room",
    localTime: "22:00",
    indoorOutdoor: "indoor",
  });

  assertStringIncludes(
    lighting.instruction,
    "keep the interior naturally readable",
  );
  assertStringIncludes(
    lighting.instruction,
    "windows, doors, skylights, reflections, or exterior spill must show darkness",
  );
  assertStringIncludes(
    lighting.instruction,
    "do not make the room artificially black",
  );
});

Deno.test("an explicit requested capture time overrides the current clock", () => {
  const lighting = resolveMediaCaptureLighting({
    requestText: "send me a bright daytime selfie outside",
    localTime: "22:00",
    daypart: "late_night",
    indoorOutdoor: "outdoor",
  });

  assertEquals(lighting.effectiveDaypart, "afternoon");
  assertEquals(lighting.source, "explicit_request");
  assertStringIncludes(lighting.instruction, "DAYTIME REQUIRED");
  assertStringIncludes(lighting.instruction, "overrides the current clock");
});

Deno.test("sunset remains a distinct explicit capture time", () => {
  const lighting = resolveMediaCaptureLighting({
    requestText: "a selfie outside at sunset",
    localTime: "22:00",
    indoorOutdoor: "outdoor",
  });

  assertEquals(lighting.effectiveDaypart, "dusk");
  assertEquals(lighting.source, "explicit_request");
  assertStringIncludes(lighting.instruction, "DUSK REQUIRED");
});
