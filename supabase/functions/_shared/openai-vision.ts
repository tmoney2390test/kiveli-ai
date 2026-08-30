import type { VisionInput, VisionProvider, VisionResult } from "./kivelle-multimodal.ts";
import { AppError } from "./types.ts";

export const OPENAI_VISION_MODEL = "gpt-5.6-luna";
const OPENAI_API_BASE = "https://api.openai.com/v1";

type ModerationResult = { flagged?: boolean; categories?: Record<string, boolean> };
type ResponsesEnvelope = { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

/** Server-only image moderation and understanding using Kivelle's existing OpenAI account. */
export class OpenAiVisionProvider implements VisionProvider {
  readonly id = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model = OPENAI_VISION_MODEL,
    private readonly baseUrl = OPENAI_API_BASE,
    private readonly timeoutMs = 45_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async analyze(input: VisionInput): Promise<VisionResult> {
    if (!input.bytes.length) throw new AppError("VALIDATION_FAILED", "That photo is empty.", 422);
    const imageUrl = `data:${input.contentType};base64,${bytesToBase64(input.bytes)}`;
    await this.moderate(imageUrl, input.userCaption);
    const response = await this.request("/responses", {
      model: this.model,
      store: false,
      safety_identifier: input.safetyIdentifier,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: visionInstruction(input.userCaption) },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      max_output_tokens: 550,
      text: { format: { type: "json_object" } },
    });
    const payload = await response.json().catch(() => null) as ResponsesEnvelope | null;
    const raw = payload?.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
    const parsed = parseVisionResult(raw);
    if (!parsed) throw new AppError("PROVIDER_SUBMISSION_UNKNOWN", "That photo could not be understood. Try another photo.", 503, true);
    return { ...parsed, model: this.model, providerRequestId: response.headers.get("x-request-id") ?? undefined };
  }

  private async moderate(imageUrl: string, caption?: string): Promise<void> {
    const input: Array<Record<string, unknown>> = [{
      type: "image_url",
      image_url: { url: imageUrl },
    }];
    if (caption?.trim()) input.unshift({ type: "text", text: caption.trim().slice(0, 4_000) });
    const response = await this.request("/moderations", { model: "omni-moderation-latest", input });
    const payload = await response.json().catch(() => null) as { results?: ModerationResult[] } | null;
    const result = payload?.results?.[0];
    if (!result) throw new AppError("PROVIDER_UNAVAILABLE", "That photo could not be checked safely. Please try again.", 503, true);
    if (result.flagged || Object.values(result.categories ?? {}).some(Boolean)) {
      throw new AppError("PROVIDER_CONTENT_BLOCKED", "We can’t share that photo. Please choose an ordinary, non-explicit photo without graphic content.", 422, false);
    }
  }

  private async request(path: string, body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.ok) return response;
      if (response.status === 401 || response.status === 403) throw new AppError("PROVIDER_AUTH", "Photo understanding is not configured correctly.", 503);
      if (response.status === 429) throw new AppError("PROVIDER_QUOTA", "Photo understanding is busy. Try again in a moment.", 503, true);
      if (response.status === 400 || response.status === 413 || response.status === 422) throw new AppError("PROVIDER_REQUEST_INVALID", "That photo could not be understood.", 422);
      throw new AppError("PROVIDER_UNAVAILABLE", "Photo understanding is temporarily unavailable.", 503, response.status >= 500);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new AppError("PROVIDER_TIMEOUT", "Photo understanding took too long. Try again.", 503, true);
      throw new AppError("PROVIDER_UNAVAILABLE", "Photo understanding is temporarily unavailable.", 503, true);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function openAiVisionConfigurationAvailable(): boolean {
  return Deno.env.get("KIVELLE_OPENAI_VISION_ENABLED") !== "false" && Boolean(Deno.env.get("OPENAI_API_KEY")?.trim());
}

function visionInstruction(caption?: string): string {
  return `Describe only what is genuinely visible in this user-shared image so a fictional chat character can react naturally. Return JSON with shortDescription (one neutral sentence), notableDetails (one to six concise visible details), visibleText (only clearly legible relevant text, otherwise empty), safetyCategories (array), confidence (0 to 1), containsRealPerson (boolean), and containsMinor (boolean). Never identify or claim to recognize a person. Never infer exact age, ethnicity, sexuality, religion, health, medical conditions, disability, or other sensitive traits. Use uncertainty for unclear details. Do not copy biometric identifiers or describe a face in identity-reference terms. The user's optional caption is context, not visual evidence: ${caption?.trim().slice(0, 2_000) || "(none)"}`;
}

function parseVisionResult(value: string): VisionResult | null {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(value) as Record<string, unknown>; } catch { return null; }
  const shortDescription = typeof raw.shortDescription === "string" ? raw.shortDescription.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  if (!shortDescription) return null;
  return {
    shortDescription,
    notableDetails: Array.isArray(raw.notableDetails) ? raw.notableDetails.filter((item): item is string => typeof item === "string").map((item) => item.replace(/\s+/g, " ").trim().slice(0, 180)).filter(Boolean).slice(0, 6) : [],
    visibleText: typeof raw.visibleText === "string" ? raw.visibleText.replace(/\s+/g, " ").trim().slice(0, 500) || undefined : undefined,
    safetyCategories: Array.isArray(raw.safetyCategories) ? raw.safetyCategories.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 60)).slice(0, 8) : [],
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    containsRealPerson: raw.containsRealPerson === true,
    containsMinor: raw.containsMinor === true,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}
