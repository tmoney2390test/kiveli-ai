import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CapabilityStatus,
  type CompanionVoiceProfile,
  deriveCompanionVoiceProfile,
  type KivelleExperienceCapabilities,
  type KivelleProviderCapability,
  type MultimodalPreferences,
  resolveExperienceCapabilities,
} from "../../../packages/together-domain/src/multimodal.ts";
import { configuredImageProvider } from "./together-media-base.ts";
import { configuredMediaRegistry } from "./together-media-providers.ts";
// Keep provider adapters in the remote Edge bundle. The Supabase deploy graph
// does not currently retain these transitive sibling imports when capabilities
// are reached through together-media-providers alone.
import "./wavespeed.ts";
import "./venice.ts";
import {
  XAI_REALTIME_VOICE_MODEL,
  XaiRealtimeVoiceProvider,
  XaiTextToSpeechProvider,
  xaiVoiceConfigurationAvailable,
} from "./xai-voice.ts";
import type { RealtimeVoiceClientConfiguration } from "./kivelle-realtime-voice.ts";
import { applyCompanionVoicePreset } from "./companion-voice-selection.ts";
import type { CompanionVoicePreset } from "../../../packages/together-domain/src/voice-presets.ts";
import type { ChatLanguagePreference } from "../../../packages/together-domain/src/chat-language.ts";
import {
  OPENAI_TRANSCRIPTION_MODEL,
  OpenAiSpeechToTextProvider,
  openAiSpeechToTextConfigurationAvailable,
} from "./openai-speech-to-text.ts";
import { XaiCascadedVoiceProvider } from "./xai-cascaded-voice.ts";
import {
  type VoiceCallRoute,
  voiceRoutePolicy,
  voiceRouteRolloutEligible,
} from "./voice-routes.ts";
import { OPENAI_VISION_MODEL, OpenAiVisionProvider, openAiVisionConfigurationAvailable } from "./openai-vision.ts";

export type VisionInput = {
  bytes: Uint8Array;
  contentType: string;
  userCaption?: string;
  safetyIdentifier?: string;
};
export type VisionResult = {
  shortDescription: string;
  notableDetails: string[];
  visibleText?: string;
  safetyCategories: string[];
  confidence: number;
  containsRealPerson?: boolean;
  containsMinor?: boolean;
  model?: string;
  providerRequestId?: string;
};
export interface VisionProvider {
  readonly id: string;
  analyze(input: VisionInput): Promise<VisionResult>;
}

export type SpeechInput = {
  text: string;
  voice: CompanionVoiceProfile;
  language?: ChatLanguagePreference;
  outputFormat?: "wav" | "mp3";
  delivery?: { speed?: number };
};
export type SpeechResult = {
  bytes: Uint8Array;
  contentType: string;
  durationMs: number;
  model: string;
  providerRequestId?: string;
  latencyMs?: number;
  characterCount?: number;
  estimatedCostUsd?: number;
  voiceId?: string;
};
export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(input: SpeechInput): Promise<SpeechResult>;
}

export type SpeechToTextInput = {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  language?: ChatLanguagePreference;
};
export type SpeechToTextResult = {
  text: string;
  model: string;
  providerRequestId?: string;
  latencyMs?: number;
};
export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult>;
}

export type RealtimeVoiceInput = {
  callSessionId: string;
  voice: CompanionVoiceProfile;
  context: Record<string, unknown>;
};
export type RealtimeVoiceSession = {
  providerSessionId: string;
  clientSecret: string;
  expiresAt: string;
  clientConfiguration?: RealtimeVoiceClientConfiguration;
  providerMetadata?: Record<string, unknown>;
};
export interface RealtimeVoiceProvider {
  readonly id: string;
  createSession(input: RealtimeVoiceInput): Promise<RealtimeVoiceSession>;
  endSession(providerSessionId: string): Promise<void>;
}

class DeterministicVisionProvider implements VisionProvider {
  readonly id = "deterministic_test";
  async analyze(input: VisionInput): Promise<VisionResult> {
    return {
      shortDescription: input.userCaption
        ? `An image shared with the caption: ${input.userCaption.slice(0, 120)}`
        : "A user-shared image.",
      notableDetails: [],
      safetyCategories: [],
      confidence: .75,
    };
  }
}

class DeterministicTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "deterministic_test";
  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    const durationMs = Math.max(
      500,
      Math.min(12_000, Math.round(input.text.split(/\s+/).length * 360)),
    );
    return {
      bytes: silentWav(durationMs),
      contentType: "audio/wav",
      durationMs,
      model: "deterministic-silence-v1",
    };
  }
}

class DeterministicSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "deterministic_test";
  async transcribe(): Promise<SpeechToTextResult> {
    return { text: "Hello from dictation.", model: "deterministic-transcript-v1" };
  }
}

class DeterministicRealtimeVoiceProvider implements RealtimeVoiceProvider {
  readonly id = "deterministic_test";
  async createSession(
    input: RealtimeVoiceInput,
  ): Promise<RealtimeVoiceSession> {
    return {
      providerSessionId: `test-${input.callSessionId}`,
      clientSecret: `test-only-${input.callSessionId}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      providerMetadata: { deterministic: true },
    };
  }
  async endSession(): Promise<void> {}
}

function explicitProvider(name: string): string {
  return (Deno.env.get(name) ?? "").trim().toLowerCase();
}

function testProvidersEnabled(): boolean {
  return Deno.env.get("KIVELLE_ENABLE_TEST_PROVIDERS") === "true";
}

type ProviderFactory<T> = () => T | null;

// Provider selection stays behind the neutral interfaces. A Venice fallback
// can be added here without changing the chat, media, or call APIs.
const textToSpeechProviderRegistry: Readonly<
  Record<string, ProviderFactory<TextToSpeechProvider>>
> = {
  deterministic_test: () =>
    testProvidersEnabled() ? new DeterministicTextToSpeechProvider() : null,
  xai: () =>
    xaiVoiceConfigurationAvailable("tts")
      ? new XaiTextToSpeechProvider(String(Deno.env.get("XAI_API_KEY")))
      : null,
};

const speechToTextProviderRegistry: Readonly<
  Record<string, ProviderFactory<SpeechToTextProvider>>
> = {
  deterministic_test: () =>
    testProvidersEnabled() ? new DeterministicSpeechToTextProvider() : null,
  openai: () =>
    openAiSpeechToTextConfigurationAvailable()
      ? new OpenAiSpeechToTextProvider(
        String(Deno.env.get("OPENAI_API_KEY")),
        Deno.env.get("KIVELLE_OPENAI_TRANSCRIPTION_MODEL")?.trim() ||
          OPENAI_TRANSCRIPTION_MODEL,
      )
      : null,
};

const realtimeVoiceProviderRegistry: Readonly<
  Record<string, ProviderFactory<RealtimeVoiceProvider>>
> = {
  deterministic_test: () =>
    testProvidersEnabled() ? new DeterministicRealtimeVoiceProvider() : null,
  xai: () =>
    xaiVoiceConfigurationAvailable("realtime")
      ? new XaiRealtimeVoiceProvider(
        String(Deno.env.get("XAI_API_KEY")),
        Deno.env.get("KIVELLE_XAI_REALTIME_VOICE_MODEL")?.trim() ||
          XAI_REALTIME_VOICE_MODEL,
      )
      : null,
};

export function configuredVisionProvider(): VisionProvider | null {
  const selected = explicitProvider("KIVELLE_VISION_PROVIDER") || (openAiVisionConfigurationAvailable() ? "openai" : "");
  if (selected === "deterministic_test" && testProvidersEnabled()) {
    return new DeterministicVisionProvider();
  }
  if (selected === "openai" && openAiVisionConfigurationAvailable()) {
    return new OpenAiVisionProvider(String(Deno.env.get("OPENAI_API_KEY")), Deno.env.get("KIVELLE_OPENAI_VISION_MODEL")?.trim() || OPENAI_VISION_MODEL);
  }
  return null;
}

export function configuredTextToSpeechProvider(): TextToSpeechProvider | null {
  const selected = explicitProvider("KIVELLE_TTS_PROVIDER");
  return textToSpeechProviderRegistry[selected]?.() ?? null;
}

export function configuredSpeechToTextProvider(): SpeechToTextProvider | null {
  const selected = explicitProvider("KIVELLE_STT_PROVIDER");
  return speechToTextProviderRegistry[selected]?.() ?? null;
}

export function configuredRealtimeVoiceProvider(
  route: VoiceCallRoute = "express",
  userId = "",
):
  | RealtimeVoiceProvider
  | null {
  if (route === "standard") {
    const relayUrl = Deno.env.get("KIVELLE_VOICE_RELAY_URL")?.trim() ?? "";
    const signingSecret = Deno.env.get("KIVELLE_VOICE_RELAY_SIGNING_SECRET")?.trim() ?? "";
    if (
      Deno.env.get("KIVELLE_XAI_CASCADED_VOICE_ENABLED") !== "true" ||
      !/^wss:\/\//i.test(relayUrl) || !signingSecret || !userId ||
      !voiceRouteRolloutEligible("standard", userId)
    ) return null;
    return new XaiCascadedVoiceProvider(relayUrl, signingSecret, userId);
  }
  if (userId && !voiceRouteRolloutEligible("express", userId)) return null;
  const selected = explicitProvider("KIVELLE_REALTIME_VOICE_PROVIDER");
  return realtimeVoiceProviderRegistry[selected]?.() ?? null;
}

export function providerCapabilityStatuses(): Record<
  KivelleProviderCapability,
  CapabilityStatus
> {
  const mediaRoutes = configuredMediaRegistry();
  const ttsSelection = explicitProvider("KIVELLE_TTS_PROVIDER"),
    sttSelection = explicitProvider("KIVELLE_STT_PROVIDER"),
    realtimeSelection = explicitProvider("KIVELLE_REALTIME_VOICE_PROVIDER");
  const ttsStatus: CapabilityStatus = configuredTextToSpeechProvider()
    ? "available"
    : ttsSelection === "xai" &&
        Deno.env.get("KIVELLE_XAI_TTS_ENABLED") === "false"
    ? "disabled"
    : "not_configured";
  const realtimeStatus: CapabilityStatus = configuredRealtimeVoiceProvider() || voiceRoutePolicy("standard", "free").available
    ? "available"
    : realtimeSelection === "xai" &&
        Deno.env.get("KIVELLE_XAI_REALTIME_VOICE_ENABLED") === "false"
    ? "disabled"
    : "not_configured";
  const speechToTextStatus: CapabilityStatus = configuredSpeechToTextProvider()
    ? "available"
    : sttSelection === "openai" &&
        Deno.env.get("KIVELLE_OPENAI_TRANSCRIPTION_ENABLED") === "false"
    ? "disabled"
    : "not_configured";
  return {
    vision: configuredVisionProvider() ? "available" : "not_configured",
    text_to_speech: ttsStatus,
    speech_to_text: speechToTextStatus,
    realtime_voice: realtimeStatus,
    image_generation:
      mediaRoutes.some((route) =>
          route.enabled && route.mediaTypes.includes("image")
        )
        ? "available"
        : "not_configured",
    image_editing:
      mediaRoutes.some((route) =>
          route.enabled && route.mediaTypes.includes("image") &&
          route.supportsImageEditing
        )
        ? "available"
        : "not_configured",
    video_generation:
      mediaRoutes.some((route) =>
          route.enabled && route.mediaTypes.includes("video")
        )
        ? "available"
        : "not_configured",
  };
}

export function resolveServerExperienceCapabilities(
  preferences?: Partial<MultimodalPreferences>,
  entitlementKeys?: string[],
): {
  experience: KivelleExperienceCapabilities;
  providers: Record<KivelleProviderCapability, CapabilityStatus>;
} {
  const providers = providerCapabilityStatuses();
  const entitlements = new Set(entitlementKeys ?? []),
    enforceEntitlements = Array.isArray(entitlementKeys);
  const entitled = (...keys: string[]) =>
    !enforceEntitlements || keys.some((key) => entitlements.has(key));
  return {
    providers,
    experience: resolveExperienceCapabilities({
      providerStatuses: providers,
      preferences,
      product: {
        userImageUploads: entitled("photo_sharing"),
        visionUnderstanding: entitled("photo_sharing"),
        voiceNotes: entitled("voice_notes"),
        // Live calls are purchased with Kivelle Credits per started minute.
        // Subscription tiers may grant more credits, but are not an access gate.
        liveVoiceCalls: true,
        // Contextual photos already use the centralized Credits ledger for access;
        // the legacy contextual_images key must not become a second paywall.
        contextualSelfies: true,
        contextualVideos: true,
        multiCharacterScenes: entitled(
          "group_interactions",
          "social_scenes_enhanced",
        ),
      },
    }),
  };
}

export async function resolveCompanionVoiceProfile(
  db: SupabaseClient,
  characterInstanceId: string,
  voicePreset?: CompanionVoicePreset | null,
): Promise<CompanionVoiceProfile> {
  const { data: instance } = await db.from("together_character_instances")
    .select("character_template_id,character_version_id").eq(
      "id",
      characterInstanceId,
    ).single();
  const templateId = String(instance?.character_template_id ?? "");
  const { data: profile } = await db.from("together_character_voice_profiles")
    .select("*").eq("character_template_id", templateId).eq("active", true)
    .maybeSingle();
  if (profile) {
    return applyCompanionVoicePreset({
      characterTemplateId: templateId,
      voiceKey: String(profile.voice_key),
      characteristics: (profile.characteristics ?? {}) as CompanionVoiceProfile[
        "characteristics"
      ],
      providerMappings: (profile.provider_mappings ?? {}) as Record<
        string,
        string
      >,
    }, voicePreset);
  }
  const { data: version } = await db.from("together_character_versions").select(
    "personality_config,communication_style",
  ).eq("id", String(instance?.character_version_id ?? "")).maybeSingle();
  return applyCompanionVoicePreset(deriveCompanionVoiceProfile({
    characterTemplateId: templateId,
    personality: (version?.personality_config ?? {}) as Record<string, unknown>,
    communicationStyle: (version?.communication_style ?? {}) as Record<
      string,
      unknown
    >,
  }), voicePreset);
}

export function normalizeMultimodalPreferences(
  value: unknown,
): MultimodalPreferences {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    userPhotoUploads: raw.userPhotoUploads !== false,
    generatedPhotos: raw.generatedPhotos !== false,
    companionVoiceNotes: raw.companionVoiceNotes !== false,
    autoplayVoiceNotes: raw.autoplayVoiceNotes === true,
    liveVoiceCalls: raw.liveVoiceCalls !== false,
    generatedVideos: raw.generatedVideos !== false,
  };
}

function silentWav(durationMs: number): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const byteLength = 44 + sampleCount * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0))
    );
  write(0, "RIFF");
  view.setUint32(4, byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  return new Uint8Array(buffer);
}
