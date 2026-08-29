export type RealtimeVoiceContentMode =
  | "standard"
  | "romance"
  | "mature"
  | "explicit";

type VoiceCallCharacterState = Record<string, unknown> | null | undefined;

/**
 * Calls should still have a truthful current-state snapshot when the Life
 * engine cannot finish an unrelated background mutation. Canonical memories,
 * relationship state, plans, and conversation history are loaded separately
 * by buildKivelleConversationContext; this fallback only supplies presence.
 */
export function voiceCallFallbackLifeRun(instance: VoiceCallCharacterState) {
  const current = instance ?? {};
  return {
    state: {
      locationId: current.current_location_id ?? null,
      location: "Current place",
      activity: current.current_activity ?? "Having some unstructured time",
      mood: current.current_mood ?? "present",
      energy: current.current_energy ?? "medium",
      availability: "available",
      interruptibility: current.current_interruptibility ?? "open",
    },
    stateSource: current.current_presence_source ?? "character_state",
    presence: null,
    activeEvent: null,
    events: [],
    degraded: true,
  };
}

export function resolveRealtimeVoiceContentMode(input: {
  requestedMode: unknown;
  ageVerified: boolean;
  characterAge: unknown;
  romanceEnabled: boolean;
  friendsOnly: boolean;
  explicitProviderEnabled: boolean;
}): RealtimeVoiceContentMode {
  const requested = normalizeMode(input.requestedMode);
  const age = Number(input.characterAge);
  const adultEligible = input.ageVerified && Number.isFinite(age) && age >= 18;
  const romanceAllowed = input.romanceEnabled && !input.friendsOnly;

  if (requested === "explicit" || requested === "mature") {
    return adultEligible && romanceAllowed
      ? "mature"
      : romanceAllowed
      ? "romance"
      : "standard";
  }
  if (requested === "romance") return romanceAllowed ? "romance" : "standard";
  return "standard";
}

function normalizeMode(value: unknown): RealtimeVoiceContentMode {
  return value === "romance" || value === "mature" || value === "explicit"
    ? value
    : "standard";
}
