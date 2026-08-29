import type { SubscriptionTier } from "../../../packages/together-domain/src/index.ts";

type Row = Record<string, unknown>;

export type MemoryProductAccess = {
  inspector: boolean;
  manualControl: boolean;
  maxInsights: boolean;
};

export function projectSnapshotMemories<
  T extends { character_instance_id?: unknown },
>(
  rows: readonly T[],
  entitlementKeys: readonly string[],
): { memories: T[]; memoryCounts: Record<string, number> } {
  const memoryCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const characterInstanceId = String(row.character_instance_id ?? "");
    if (characterInstanceId) {
      counts[characterInstanceId] = (counts[characterInstanceId] ?? 0) + 1;
    }
    return counts;
  }, {});
  return {
    memories: entitlementKeys.includes("memory_inspector") ? [...rows] : [],
    memoryCounts,
  };
}

export function filterMemoriesForPreferences<
  T extends { memory_type?: unknown },
>(
  rows: readonly T[],
  preferences: Record<string, unknown> | null | undefined,
): T[] {
  return rows.filter((row) =>
    preferences?.[String(row.memory_type ?? "semantic")] !== false
  );
}

export function resolveMemoryProductAccess(
  tier: SubscriptionTier,
  entitlementKeys: readonly string[],
): MemoryProductAccess {
  const keys = new Set(entitlementKeys);
  return {
    inspector: keys.has("memory_inspector"),
    manualControl: keys.has("memory_manual_control"),
    maxInsights: tier === "kivelle_max" && keys.has("memory_inspector"),
  };
}

export function memorySourceContext(
  row: Row,
  locationName?: string | null,
): string {
  const learnedVia = String(row.learned_via ?? "");
  const metadata = row.metadata && typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const storedSourceType = String(row.source_type ?? "");
  const sourceType = metadata.manual === true
    ? "manual"
    : metadata.sharedPlanId || metadata.planId
    ? "plan"
    : metadata.dateSessionId || metadata.dateId
    ? "date"
    : metadata.sceneSessionId || metadata.episodeId
    ? "scene"
    : storedSourceType;
  if (learnedVia === "inferred_pattern") {
    return "Learned gradually from a pattern across your conversations.";
  }
  if (sourceType === "manual") {
    return "You explicitly asked your companion to remember this.";
  }
  if (sourceType === "plan") {
    return locationName
      ? `Shared during your time together at ${locationName}.`
      : "Shared during a plan you experienced together.";
  }
  if (sourceType === "date") {
    return locationName
      ? `Shared during your date at ${locationName}.`
      : "Shared during a date you experienced together.";
  }
  if (sourceType === "scene") {
    return locationName
      ? `You shared this while together at ${locationName}.`
      : "You shared this while you were together.";
  }
  if (sourceType === "moment" || sourceType === "life_event") {
    return locationName
      ? `Remembered from a shared moment at ${locationName}.`
      : "Remembered from a shared moment.";
  }
  if (locationName) {
    return `You shared this during your conversation at ${locationName}.`;
  }
  return learnedVia === "direct_user" || sourceType === "message"
    ? "You shared this in conversation."
    : "Saved from your shared history.";
}

export function manualMemoryText(
  input: { role: string; content: string; characterName: string },
): { memoryType: "semantic" | "relationship"; canonicalText: string } {
  const content = input.content.trim().replace(/\s+/g, " ").slice(0, 1600);
  return input.role === "assistant"
    ? {
      memoryType: "relationship",
      canonicalText: `${input.characterName} said: “${content}”`,
    }
    : {
      memoryType: "semantic",
      canonicalText:
        `User asked ${input.characterName} to remember: “${content}”`,
    };
}

/** Converts user-facing first/second-person memory copy back into stable
 * third-person canonical storage. Dialogue prompts must never receive an
 * ambiguous "you" that could be mistaken for the companion or model. */
export function canonicalMemoryTextFromUserInput(value: string): string {
  let text = value.trim().replace(/\s+/g, " ").slice(0, 2000);
  if (!text) return "";
  text = text
    .replace(/\bI[’']m\b/gi, "I am")
    .replace(/\bI[’']ve\b/gi, "I have")
    .replace(/\bI[’']ll\b/gi, "I will")
    .replace(/\bI[’']d\b/gi, "I would")
    .replace(/\b(?:you|I)\s+(?:do(?:es)?\s+not|don[’']t)\b/gi, "User does not")
    .replace(
      /\b(?:you\s+(?:are\s+not|aren[’']t)|I\s+am\s+not)\b/gi,
      "User is not",
    )
    .replace(/\b(?:you|I)\s+(?:have\s+not|haven[’']t)\b/gi, "User has not")
    .replace(
      /\b(?:you\s+(?:were\s+not|weren[’']t)|I\s+(?:was\s+not|wasn[’']t))\b/gi,
      "User was not",
    )
    .replace(/\b(?:your|my)\b/gi, "User's")
    .replace(/\b(?:you\s+are|I\s+am)\b/gi, "User is")
    .replace(/\b(?:you|I)\s+have\b/gi, "User has")
    .replace(/\b(?:you|I)\s+do\b/gi, "User does")
    .replace(/\b(?:you\s+were|I\s+was)\b/gi, "User was")
    .replace(
      /\b(?:you|I)\s+(like|dislike|love|hate|prefer|enjoy|want|feel|know|remember|believe|think|work|live|play|watch|read|listen|visit|avoid|need|hope|plan|value|appreciate|support|call|go|try|study|carry|miss|wish|own|follow|use|speak|cook|travel|drink|eat)\b/gi,
      (_match, verb: string) =>
        `User ${
          THIRD_PERSON_VERBS[verb.toLowerCase()] ?? `${verb.toLowerCase()}s`
        }`,
    )
    .replace(/\b(?:you|I)\b/gi, "User")
    .replace(/\s+/g, " ")
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
  if (!/[.!?…][”']?$/.test(text)) text += ".";
  return text;
}

const THIRD_PERSON_VERBS: Record<string, string> = {
  like: "likes",
  dislike: "dislikes",
  love: "loves",
  hate: "hates",
  prefer: "prefers",
  enjoy: "enjoys",
  want: "wants",
  feel: "feels",
  know: "knows",
  remember: "remembers",
  believe: "believes",
  think: "thinks",
  work: "works",
  live: "lives",
  play: "plays",
  watch: "watches",
  read: "reads",
  listen: "listens",
  visit: "visits",
  avoid: "avoids",
  need: "needs",
  hope: "hopes",
  plan: "plans",
  value: "values",
  appreciate: "appreciates",
  support: "supports",
  call: "calls",
  go: "goes",
  try: "tries",
  study: "studies",
  carry: "carries",
  miss: "misses",
  wish: "wishes",
  own: "owns",
  follow: "follows",
  use: "uses",
  speak: "speaks",
  cook: "cooks",
  travel: "travels",
  drink: "drinks",
  eat: "eats",
};
