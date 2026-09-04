export type MediaCaptureDaypart =
  | "dawn"
  | "morning"
  | "afternoon"
  | "evening"
  | "dusk"
  | "night";

export type MediaCaptureLighting = {
  effectiveDaypart: MediaCaptureDaypart;
  source: "explicit_request" | "canonical_clock" | "context_daypart";
  instruction: string;
  qualityInstruction: string;
};

type MediaCaptureLightingInput = {
  requestText?: string;
  localTime?: string;
  localIso?: string;
  timezone?: string;
  daypart?: string;
  indoorOutdoor?: string;
};

const EXPLICIT_CAPTURE_TIMES: Array<
  { daypart: MediaCaptureDaypart; pattern: RegExp }
> = [
  { daypart: "dawn", pattern: /\b(?:sunrise|dawn|daybreak)\b/i },
  { daypart: "morning", pattern: /\b(?:early\s+morning|morning)\b/i },
  {
    daypart: "afternoon",
    pattern:
      /\b(?:midday|noon|daytime|daylight|during\s+the\s+day|broad\s+daylight|afternoon)\b/i,
  },
  { daypart: "dusk", pattern: /\b(?:golden\s+hour|sunset|dusk|twilight)\b/i },
  { daypart: "evening", pattern: /\bevening\b/i },
  {
    daypart: "night",
    pattern:
      /\b(?:night|nighttime|tonight|midnight|moonlit|after\s+dark|late[-\s]+night)\b/i,
  },
];

export function resolveMediaCaptureLighting(
  input: MediaCaptureLightingInput,
): MediaCaptureLighting {
  const explicit = EXPLICIT_CAPTURE_TIMES.find((candidate) =>
    candidate.pattern.test(String(input.requestText ?? ""))
  );
  const fromClock = daypartFromLocalTime(input.localTime);
  const effectiveDaypart = explicit?.daypart ?? fromClock ??
    normalizeDaypart(input.daypart);
  const source: MediaCaptureLighting["source"] = explicit
    ? "explicit_request"
    : fromClock
    ? "canonical_clock"
    : "context_daypart";
  const spatial = normalizeSpatialSetting(input.indoorOutdoor);
  const clockLabel = input.localTime
    ? `${
      input.localIso?.slice(0, 10) ? `${input.localIso.slice(0, 10)} ` : ""
    }${input.localTime}${input.timezone ? ` ${input.timezone}` : ""}`
    : input.daypart || effectiveDaypart;
  const authority = source === "explicit_request"
    ? `USER-SPECIFIED CAPTURE TIME: ${effectiveDaypart}. This explicit visual direction overrides the current clock.`
    : `AUTHORITATIVE CAPTURE TIME: ${clockLabel}, ${effectiveDaypart}. Unless the approved request explicitly specifies another capture time, do not change it.`;
  const lighting = lightingRequirement(effectiveDaypart, spatial);
  const qualityInstruction = qualityRequirement(effectiveDaypart, spatial);
  // Put the concrete light requirement first: some provider adapters have
  // tight prompt budgets and must retain the visual rule even when they trim
  // the longer clock explanation.
  return {
    effectiveDaypart,
    source,
    instruction: `${lighting} ${authority}`,
    qualityInstruction,
  };
}

function daypartFromLocalTime(
  value: string | undefined,
): MediaCaptureDaypart | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (hour < 5 || hour >= 21) return "night";
  if (hour < 8) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function normalizeDaypart(value: string | undefined): MediaCaptureDaypart {
  const normalized = String(value ?? "").toLowerCase().replace(/[-\s]+/g, "_");
  if (["overnight", "late_night", "night", "midnight"].includes(normalized)) {
    return "night";
  }
  if (["dawn", "sunrise", "early_morning"].includes(normalized)) return "dawn";
  if (normalized === "morning") return "morning";
  if (["afternoon", "midday", "daytime"].includes(normalized)) {
    return "afternoon";
  }
  if (["dusk", "sunset", "twilight"].includes(normalized)) return "dusk";
  return "evening";
}

function normalizeSpatialSetting(
  value: string | undefined,
): "indoor" | "outdoor" | "mixed" {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "indoor" || normalized === "interior") return "indoor";
  if (normalized === "outdoor" || normalized === "exterior") return "outdoor";
  return "mixed";
}

function lightingRequirement(
  daypart: MediaCaptureDaypart,
  spatial: "indoor" | "outdoor" | "mixed",
): string {
  if (daypart === "night") {
    if (spatial === "outdoor") {
      return "OUTDOOR NIGHT REQUIRED: show a dark night sky and plausible moonlight, streetlight, venue light, or other practical illumination. No daylight, blue daytime sky, sunlit scenery, or daytime shadows.";
    }
    if (spatial === "indoor") {
      return "NIGHT REQUIRED: keep the interior naturally readable with believable practical lighting. Any windows, doors, skylights, reflections, or exterior spill must show darkness outside; do not make the room artificially black and do not leak daylight into it.";
    }
    return "NIGHT REQUIRED: all exterior, window, doorway, reflection, and background cues must show darkness outside, with believable practical or venue lighting keeping the subject readable. No daylight, blue daytime sky, sunlit scenery, or daytime shadows.";
  }
  if (daypart === "dawn") {
    return "DAWN REQUIRED: use early low-angle light, a dawn sky, and restrained practical lights appropriate to the setting. Do not substitute midday sun or full darkness.";
  }
  if (daypart === "morning") {
    return "MORNING REQUIRED: use believable morning daylight and shadow direction. Interior practical lights may remain on, but exterior and window cues must not look like night.";
  }
  if (daypart === "afternoon") {
    return "DAYTIME REQUIRED: use believable afternoon daylight, sky, and shadows. Do not substitute night, moonlight, or a dark exterior unless the approved request explicitly asks for it.";
  }
  if (daypart === "dusk") {
    return "DUSK REQUIRED: use sunset or twilight sky color with emerging practical lights. Do not substitute midday daylight or deep midnight darkness.";
  }
  return "EVENING REQUIRED: use physically plausible late-day or early-evening light for the canonical local time, with practical lights beginning to matter. Do not substitute bright midday sun.";
}

function qualityRequirement(
  daypart: MediaCaptureDaypart,
  spatial: "indoor" | "outdoor" | "mixed",
): string {
  if (daypart === "night") {
    return spatial === "indoor"
      ? "Expected capture time is night. A well-lit interior is valid, but return FAIL time_mismatch if windows, doors, skylights, reflections, or exterior spill clearly show daylight or a daytime sky."
      : "Expected capture time is night. Return FAIL time_mismatch if any visible exterior, sky, window, doorway, reflection, or background is clearly daylight, sunlit, or uses a blue daytime sky.";
  }
  if (daypart === "afternoon" || daypart === "morning") {
    return `Expected capture time is ${daypart}. Return FAIL time_mismatch if visible exterior or window cues clearly depict night, moonlight, or deep darkness instead of plausible ${daypart} daylight.`;
  }
  if (daypart === "dawn" || daypart === "dusk") {
    return `Expected capture time is ${daypart}. Return FAIL time_mismatch if visible exterior or window cues clearly depict midday or deep night rather than plausible ${daypart} light.`;
  }
  return "Expected capture time is evening. Return FAIL time_mismatch if visible exterior or window cues clearly depict bright midday conditions or an incompatible deep-night scene.";
}
