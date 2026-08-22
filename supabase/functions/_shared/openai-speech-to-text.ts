import type {
  SpeechToTextInput,
  SpeechToTextProvider,
  SpeechToTextResult,
} from "./kivelle-multimodal.ts";
import { AppError } from "./types.ts";

export const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const OPENAI_API_BASE = "https://api.openai.com/v1";

type OpenAiTranscriptionEnvelope = {
  text?: unknown;
};

/** Server-only adapter for OpenAI's multipart audio transcription endpoint. */
export class OpenAiSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model = OPENAI_TRANSCRIPTION_MODEL,
    private readonly baseUrl = OPENAI_API_BASE,
    private readonly timeoutMs = 30_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
    if (!input.bytes.length) {
      throw new AppError(
        "PROVIDER_REQUEST_INVALID",
        "Record something before transcribing it.",
        422,
      );
    }
    const started = performance.now();
    const form = new FormData();
    const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(audioBuffer).set(input.bytes);
    form.append(
      "file",
      new Blob([audioBuffer], { type: input.contentType }),
      safeAudioFileName(input.fileName, input.contentType),
    );
    form.append("model", this.model);

    const response = await this.requestWithRetry(form);
    const payload = await response.json().catch(() => null) as
      | OpenAiTranscriptionEnvelope
      | null;
    const text = typeof payload?.text === "string"
      ? payload.text.replace(/\s+/g, " ").trim().slice(0, 8_000)
      : "";
    if (!text) {
      throw new AppError(
        "PROVIDER_SUBMISSION_UNKNOWN",
        "No speech could be found in that recording.",
        422,
      );
    }
    return {
      text,
      model: this.model,
      providerRequestId: response.headers.get("x-request-id") ?? undefined,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
    };
  }

  private async requestWithRetry(form: FormData): Promise<Response> {
    let lastError: AppError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
          },
          body: form,
          signal: controller.signal,
        });
        if (response.ok) return response;
        const mapped = openAiTranscriptionError(response);
        if (!mapped.retryable || attempt === 2) throw mapped;
        lastError = mapped;
      } catch (error) {
        const mapped = error instanceof AppError
          ? error
          : error instanceof DOMException && error.name === "AbortError"
          ? new AppError(
            "PROVIDER_TIMEOUT",
            "Voice-to-text took too long. Try again.",
            503,
            true,
          )
          : new AppError(
            "PROVIDER_UNAVAILABLE",
            "Voice-to-text is temporarily unavailable.",
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
    throw lastError ?? new AppError(
      "PROVIDER_UNAVAILABLE",
      "Voice-to-text is temporarily unavailable.",
      503,
      true,
    );
  }
}

export function openAiSpeechToTextConfigurationAvailable(): boolean {
  return Deno.env.get("KIVELLE_OPENAI_TRANSCRIPTION_ENABLED") === "true" &&
    Boolean(Deno.env.get("OPENAI_API_KEY")?.trim());
}

function openAiTranscriptionError(response: Response): AppError {
  if (response.status === 401 || response.status === 403) {
    return new AppError(
      "PROVIDER_AUTH",
      "Voice-to-text is not configured correctly.",
      503,
    );
  }
  if (response.status === 429) {
    return new AppError(
      "PROVIDER_QUOTA",
      "Voice-to-text is busy. Try again in a moment.",
      503,
      true,
    );
  }
  if (response.status === 400 || response.status === 413 || response.status === 422) {
    return new AppError(
      "PROVIDER_REQUEST_INVALID",
      "That recording could not be transcribed.",
      422,
    );
  }
  return new AppError(
    "PROVIDER_UNAVAILABLE",
    "Voice-to-text is temporarily unavailable.",
    503,
    response.status >= 500,
  );
}

function safeAudioFileName(value: string, contentType: string): string {
  const extension = audioExtension(contentType);
  const base = value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  return base.includes(".") ? base : `${base || "dictation"}.${extension}`;
}

function audioExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";", 1)[0];
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "wav";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/flac") return "flac";
  if (normalized === "audio/aac") return "aac";
  return "m4a";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
