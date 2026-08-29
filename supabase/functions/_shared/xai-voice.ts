import type { CompanionVoiceProfile } from "../../../packages/together-domain/src/multimodal.ts";
import { resolveXaiVoiceId } from "../../../packages/together-domain/src/voice-provider-mapping.ts";
import { xaiVoiceLanguage } from "../../../packages/together-domain/src/chat-language.ts";
import type {
  RealtimeVoiceProvider,
  RealtimeVoiceSession,
  SpeechInput,
  SpeechResult,
  TextToSpeechProvider,
} from "./kivelle-multimodal.ts";
import { buildKivelleRealtimeVoiceConfiguration } from "./kivelle-realtime-voice.ts";
import { AppError } from "./types.ts";

export const XAI_REALTIME_VOICE_MODEL = "grok-voice-think-fast-2.0";
export const XAI_TTS_TELEMETRY_MODEL = "xai-text-to-speech";
export const XAI_TTS_CHARACTER_COST_USD = 15 / 1_000_000;
export const XAI_REALTIME_AUDIO_COST_USD_PER_MINUTE = .08;

const XAI_API_BASE = "https://api.x.ai/v1";
type XaiTtsEnvelope = {
  audio: string;
  content_type: string;
  duration: number;
};

export class XaiTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "xai";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = XAI_API_BASE,
    private readonly timeoutMs = 30_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    const text = input.text.trim();
    if (!text || text.length > 3_500) {
      throw new AppError(
        "PROVIDER_REQUEST_INVALID",
        "That message is too long for a voice note.",
        422,
        false,
      );
    }
    const voiceId = xaiVoiceId(input.voice);
    const codec = input.outputFormat === "wav" ? "wav" : "mp3";
    const started = performance.now();
    const response = await this.requestWithRetry({
      text,
      voice_id: voiceId,
      language: xaiVoiceLanguage(input.language),
      output_format: codec === "wav"
        ? { codec: "wav", sample_rate: 24_000 }
        : { codec: "mp3", sample_rate: 24_000, bit_rate: 128_000 },
      speed: clamp(Number(input.delivery?.speed ?? 1), .7, 1.5),
      text_normalization: true,
      with_timestamps: true,
    });
    const payload = await safeJson(response);
    if (!isTtsEnvelope(payload)) {
      throw new AppError(
        "PROVIDER_SUBMISSION_UNKNOWN",
        "The voice provider returned an invalid result.",
        503,
        true,
      );
    }
    const bytes = decodeBase64(payload.audio);
    const contentType = normalizeAudioContentType(payload.content_type, codec);
    if (!bytes.length || !contentType) {
      throw new AppError(
        "PROVIDER_SUBMISSION_UNKNOWN",
        "The voice provider returned an invalid result.",
        503,
        true,
      );
    }
    return {
      bytes,
      contentType,
      durationMs: Math.max(0, Math.round(payload.duration * 1_000)),
      model: Deno.env.get("KIVELLE_XAI_TTS_MODEL")?.trim() ||
        XAI_TTS_TELEMETRY_MODEL,
      providerRequestId: providerRequestId(response),
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      characterCount: text.length,
      estimatedCostUsd: voiceCostTelemetryEnabled()
        ? roundUsd(text.length * XAI_TTS_CHARACTER_COST_USD)
        : 0,
      voiceId,
    };
  }

  private async requestWithRetry(
    body: Record<string, unknown>,
  ): Promise<Response> {
    let lastError: AppError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}/tts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.ok) return response;
        const mapped = await xaiProviderError(response, "voice note");
        if (!mapped.retryable || attempt === 2) throw mapped;
        lastError = mapped;
      } catch (error) {
        const mapped = error instanceof AppError
          ? error
          : error instanceof DOMException && error.name === "AbortError"
          ? new AppError(
            "PROVIDER_TIMEOUT",
            "The voice note took too long to create.",
            503,
            true,
          )
          : new AppError(
            "PROVIDER_UNAVAILABLE",
            "Voice notes are temporarily unavailable.",
            503,
            true,
          );
        if (!mapped.retryable || attempt === 2) throw mapped;
        lastError = mapped;
      } finally {
        clearTimeout(timer);
      }
      await delay(attempt === 0 ? 250 : 750);
    }
    throw lastError ??
      new AppError(
        "PROVIDER_UNAVAILABLE",
        "Voice notes are temporarily unavailable.",
        503,
        true,
      );
  }
}

export class XaiRealtimeVoiceProvider implements RealtimeVoiceProvider {
  readonly id = "xai";

  constructor(
    private readonly apiKey: string,
    private readonly model = XAI_REALTIME_VOICE_MODEL,
    private readonly baseUrl = XAI_API_BASE,
    private readonly timeoutMs = 15_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createSession(
    input: {
      callSessionId: string;
      voice: CompanionVoiceProfile;
      context: Record<string, unknown>;
    },
  ): Promise<RealtimeVoiceSession> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/realtime/client_secrets`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expires_after: { seconds: 300 } }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw await xaiProviderError(response, "live call");
      const payload = await safeJson(response);
      const value = typeof payload.value === "string" ? payload.value : "";
      const expiresAtSeconds = Number(payload.expires_at);
      if (!value || !Number.isFinite(expiresAtSeconds)) {
        throw new AppError(
          "PROVIDER_SUBMISSION_UNKNOWN",
          "The call provider returned an invalid session.",
          503,
          true,
        );
      }
      const voiceId = xaiVoiceId(input.voice);
      const clientConfiguration = buildKivelleRealtimeVoiceConfiguration({
        model: this.model,
        voiceId,
        voice: input.voice,
        context: input.context,
        greetingSeed: input.callSessionId,
      });
      return {
        providerSessionId: `xai-pending-${input.callSessionId}`,
        clientSecret: value,
        expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
        clientConfiguration,
        providerMetadata: {
          model: this.model,
          voiceId,
          transport: "websocket_json_pcm16",
          sampleRate: clientConfiguration.sampleRate,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError(
          "PROVIDER_TIMEOUT",
          "The call provider took too long to respond.",
          503,
          true,
        );
      }
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Live calls are temporarily unavailable.",
        503,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async endSession(): Promise<void> {
    // Direct ephemeral WebSocket sessions have no server-side hangup endpoint.
    // The client closes the transport and this method preserves the neutral
    // interface for relay/SIP providers that may need explicit termination.
  }
}

export function xaiVoiceId(voice: CompanionVoiceProfile): string {
  return resolveXaiVoiceId(voice);
}

export function xaiVoiceConfigurationAvailable(
  feature: "tts" | "realtime",
): boolean {
  const key = Boolean(Deno.env.get("XAI_API_KEY")?.trim());
  if (!key) return false;
  if (feature === "tts") return envBoolean("KIVELLE_XAI_TTS_ENABLED");
  return envBoolean("KIVELLE_XAI_REALTIME_VOICE_ENABLED") &&
    Boolean(
      Deno.env.get("KIVELLE_XAI_REALTIME_VOICE_MODEL")?.trim() ||
        XAI_REALTIME_VOICE_MODEL,
    );
}

export function voiceRolloutEligible(userId: string): boolean {
  const raw = Number(Deno.env.get("KIVELLE_XAI_VOICE_CANARY_PERCENT") ?? 0);
  const percent = Number.isFinite(raw) ? clamp(raw, 0, 100) : 0;
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return stableHash(userId) % 100 < percent;
}

export function voiceCostTelemetryEnabled(): boolean {
  const value = Deno.env.get("KIVELLE_XAI_VOICE_COST_TELEMETRY_ENABLED");
  return value == null
    ? true
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function xaiProviderError(
  response: Response,
  label: string,
): Promise<AppError> {
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  if (
    response.status === 400 || response.status === 404 ||
    response.status === 415 || response.status === 422
  ) {
    return new AppError(
      "PROVIDER_REQUEST_INVALID",
      `The ${label} request could not be processed.`,
      422,
      false,
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new AppError(
      "PROVIDER_AUTH",
      `The ${label} provider needs attention.`,
      503,
      false,
    );
  }
  if (response.status === 429) {
    return new AppError(
      "RATE_LIMITED",
      `${
        label === "live call" ? "Calls are" : "Voice notes are"
      } busy right now. Try again soon.`,
      429,
      true,
    );
  }
  if (response.status >= 500) {
    return new AppError(
      "PROVIDER_UNAVAILABLE",
      `${
        label === "live call" ? "Live calls are" : "Voice notes are"
      } temporarily unavailable.`,
      503,
      true,
    );
  }
  return new AppError(
    "PROVIDER_UNAVAILABLE",
    `${
      label === "live call" ? "Live calls are" : "Voice notes are"
    } temporarily unavailable.`,
    503,
    false,
  );
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function isTtsEnvelope(
  value: Record<string, unknown>,
): value is XaiTtsEnvelope & Record<string, unknown> {
  return typeof value.audio === "string" &&
    typeof value.content_type === "string" &&
    Number.isFinite(Number(value.duration));
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = atob(value);
    const output = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      output[index] = decoded.charCodeAt(index);
    }
    return output;
  } catch {
    return new Uint8Array();
  }
}

function normalizeAudioContentType(
  value: string,
  codec: "mp3" | "wav",
): "audio/mpeg" | "audio/wav" | null {
  const normalized = value.split(";")[0]?.trim().toLowerCase();
  if (normalized === "audio/mpeg" && codec === "mp3") return "audio/mpeg";
  if (
    (normalized === "audio/wav" || normalized === "audio/x-wav") &&
    codec === "wav"
  ) return "audio/wav";
  return null;
}

function providerRequestId(response: Response): string {
  return response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("xai-request-id") ?? crypto.randomUUID();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function envBoolean(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (Deno.env.get(name) ?? "").trim().toLowerCase(),
  );
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
