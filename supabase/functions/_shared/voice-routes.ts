import type { SubscriptionTier } from "../../../packages/together-domain/src/entitlements.ts";

export type VoiceCallRoute = "standard" | "express";

export const XAI_STANDARD_STT_MODEL = "grok-transcribe";
export const XAI_STANDARD_DIALOGUE_MODEL = "grok-4.3";
export const XAI_STANDARD_TTS_MODEL = "xai-text-to-speech";

export type VoiceRoutePolicy = {
  route: VoiceCallRoute;
  displayName: string;
  description: string;
  creditsPerMinute: number;
  includedMinutes: number;
  available: boolean;
  unavailableReason?: string;
};

export function normalizeVoiceCallRoute(value: unknown): VoiceCallRoute {
  return value === "standard" ? "standard" : "express";
}

export function voiceRoutePolicy(
  route: VoiceCallRoute,
  tier: SubscriptionTier | string,
): VoiceRoutePolicy {
  if (route === "express") {
    const available = envBoolean("KIVELLE_XAI_REALTIME_VOICE_ENABLED") &&
      Boolean(Deno.env.get("XAI_API_KEY")?.trim());
    return {
      route,
      displayName: "Immersive",
      description: "Fastest response and the most natural interruptions.",
      creditsPerMinute: envInteger("KIVELLE_EXPRESS_VOICE_CREDITS_PER_MINUTE", 8, 1, 100),
      includedMinutes: 0,
      available,
      ...(!available ? { unavailableReason: "Immersive Voice is not configured." } : {}),
    };
  }
  const relayUrl = Deno.env.get("KIVELLE_VOICE_RELAY_URL")?.trim() ?? "";
  const available = envBoolean("KIVELLE_XAI_CASCADED_VOICE_ENABLED") &&
    /^wss:\/\//i.test(relayUrl) &&
    Boolean(Deno.env.get("KIVELLE_VOICE_RELAY_SIGNING_SECRET")?.trim());
  return {
    route,
    displayName: "Essential",
    description: "Efficient voice for longer conversations.",
    creditsPerMinute: envInteger("KIVELLE_STANDARD_VOICE_CREDITS_PER_MINUTE", 3, 1, 100),
    includedMinutes: 0,
    available,
    ...(!available ? { unavailableReason: "Essential Voice is not configured." } : {}),
  };
}

/**
 * Deterministic account rollout. Configuration availability and account
 * eligibility are intentionally separate so operations can canary either
 * route without changing a user's selected route mid-call.
 */
export function voiceRouteRolloutEligible(
  route: VoiceCallRoute,
  userId: string,
): boolean {
  if (!userId) return true;
  const variable = route === "standard"
    ? "KIVELLE_XAI_CASCADED_VOICE_CANARY_PERCENT"
    : "KIVELLE_XAI_VOICE_CANARY_PERCENT";
  const raw = Number(Deno.env.get(variable) ?? 0);
  const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return stableHash(userId) % 100 < percent;
}

export function includedStandardMinutes(tier: SubscriptionTier | string): number {
  void tier;
  return 0;
}

export function standardVoiceModelConfiguration() {
  return {
    sttModel: Deno.env.get("KIVELLE_XAI_STREAMING_STT_MODEL")?.trim() || XAI_STANDARD_STT_MODEL,
    dialogueModel: Deno.env.get("KIVELLE_XAI_CASCADE_DIALOGUE_MODEL")?.trim() || XAI_STANDARD_DIALOGUE_MODEL,
    ttsModel: Deno.env.get("KIVELLE_XAI_STREAMING_TTS_MODEL")?.trim() || XAI_STANDARD_TTS_MODEL,
  };
}

function envBoolean(name: string): boolean {
  return ["1", "true", "yes", "on"].includes((Deno.env.get(name) ?? "").trim().toLowerCase());
}

function envInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(Deno.env.get(name));
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
