import type { SupabaseClient } from "@supabase/supabase-js";
import { track } from "./together.ts";
import { currentAdultMediaJobAuthorized } from "./web-adult-access.ts";
import { adultVideoFeatureEnabled } from "./together-video-content.ts";
import {
  blockingQualityReasonsForAgePolicy,
  customCharacterAgeCheckFromMetadata,
  isCustomCharacterTemplate,
} from "./together-media-character.ts";
import { normalizeMediaSubjectIds } from "./together-media-subjects.ts";

export type VideoQualityVerdict = {
  status: "pass" | "fail" | "unavailable";
  reasonCodes: string[];
};
export type VideoQualityGateResult = {
  action: "accept" | "reject";
  reasonCodes: string[];
  metadata: Record<string, unknown>;
  verificationUnavailable: boolean;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type WaitLike = (delayMs: number) => Promise<void>;
type GeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
  state: string;
};

const VIDEO_QUALITY_REASONS = [
  "doll_like_anatomy",
  "missing_anatomy",
  "fused_anatomy",
  "malformed_anatomy",
  "body_proportion_error",
  "duplicate_body_parts",
  "malformed_hands",
  "digit_error",
  "temporal_anatomy_inconsistency",
  "identity_drift",
  "unexpected_nudity_or_sexual_content",
  "unexpected_censoring",
  "ambiguous_age",
  "adult_safety_violation",
  "rendered_text",
  "video_quality_failed",
  "video_quality_unverified",
] as const;

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_ASSESSMENT_ATTEMPTS = 2;

export function buildVideoQualityPrompt(
  adultAuthorized = false,
  anonymousAdultPartner = false,
  customCharacterAgeCheck = true,
): string {
  const contentRule = adultAuthorized
    ? anonymousAdultPartner
      ? "Authorized fictional-adult nudity and consensual sexual activity may pass and should not be failed as unexpected_nudity_or_sexual_content. The video must contain exactly the approved fictional companion and one distinct anonymous original fictional adult partner; both must be unmistakably age 25 or older. The anonymous partner must not resemble the user or a recognizable real person. All visible anatomy, including genitals, breasts, and buttocks present in the opening frame, must stay natural, complete, coherent, uncovered, and stable through time. Fail unexpected_censoring if clothing, blur, bars, or blank anatomy appear over requested nudity."
      : "Authorized fictional-adult nudity and consensual sexual activity may pass and should not be failed as unexpected_nudity_or_sexual_content, but only when every person is unmistakably an adult and all visible anatomy, including genitals, breasts, and buttocks present in the opening frame, stays natural, complete, coherent, uncovered, and stable through time. Fail unexpected_censoring if clothing, blur, bars, or blank anatomy appear over requested nudity."
    : "This is a standard or romantic Kivelle video. Fail unexpected_nudity_or_sexual_content for exposed breasts, nipples, buttocks, genitals, sexual activity, fetish presentation, or sexual posing, including content that was not present in the opening image.";
  const ageRule = customCharacterAgeCheck
    ? "Every person must be an unambiguously fictional adult. Fail ambiguous_age or adult_safety_violation for an underage or age-ambiguous presentation, non-consent, coercion, sexual violence, incest, bestiality, trafficking, exploitation, a real person or deepfake, or illegal content."
    : "Official catalog companions are confirmed fictional adults. Fail ambiguous_age only for a clearly underage or child presentation. Do not fail ambiguous_age or adult_safety_violation because an official catalog adult looks youthful, petite, or young-adult. Fail adult_safety_violation for non-consent, coercion, sexual violence, incest, bestiality, trafficking, exploitation, a real person or deepfake, or illegal content.";
  return [
    "Act as a practical pre-delivery quality inspector for this short generated character video. Inspect the complete timeline, not only the opening frame.",
    contentRule,
    "Use a viewer-centered threshold. A brief isolated generation glitch that appears for only one sampled instant and does not obscure the subject, identity, requested action, or safety may still be delivered. Return PASS followed by any applicable comma-separated quality codes as non-blocking advisories for such minor glitches. Return FAIL only for a safety violation or a defect that is prominent, materially disruptive, or persists across multiple consecutive moments.",
    "Return PASS, optionally followed by advisory codes, when suitable for delivery. Otherwise return FAIL followed only by comma-separated codes from: doll_like_anatomy, missing_anatomy, fused_anatomy, malformed_anatomy, body_proportion_error, duplicate_body_parts, malformed_hands, digit_error, temporal_anatomy_inconsistency, identity_drift, unexpected_nudity_or_sexual_content, unexpected_censoring, ambiguous_age, adult_safety_violation, rendered_text, video_quality_failed.",
    "Fail doll_like_anatomy when a chest, pelvic, genital, buttock, or other body region looks like smooth plastic, a mannequin, a doll, or a featureless synthetic patch instead of natural adult anatomy.",
    "Fail missing_anatomy, fused_anatomy, or malformed_anatomy for absent, merged, melted, disconnected, implausibly shaped, or incoherent visible body structures. Fail unexpected_censoring for accidental blanking, smoothing, blur, bars, mosaics, invented fabric, or other visual censorship.",
    "Fail temporal_anatomy_inconsistency when body parts, proportions, coverage, or visible anatomy appear, vanish, fuse, split, or change unnaturally across multiple consecutive moments. A fleeting extra limb, hand, or digit limited to one sampled instant should PASS with duplicate_body_parts, malformed_hands, digit_error, or temporal_anatomy_inconsistency retained only as an advisory. Fail persistent duplicate parts, severe identity drift, prominent text or watermarks, or repeatedly unstable faces.",
    ageRule,
    "Do not describe the video and do not repeat any dialogue, prompt, identity, or sexual details. Output only the verdict contract.",
  ].join(" ");
}

export function parseVideoQualityVerdict(output: unknown): VideoQualityVerdict {
  const structured = structuredVideoQualityVerdict(output);
  if (structured) return structured;
  const serialized = typeof output === "string"
    ? output
    : output == null
    ? ""
    : JSON.stringify(output) ?? "";
  const text = serialized.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(
    /[`"']/g,
    "",
  ).trim();
  const lower = text.toLowerCase(),
    reasons = VIDEO_QUALITY_REASONS.filter((reason) =>
      lower.includes(reason) || lower.includes(reason.replaceAll("_", " "))
    );
  if (/^PASS\b/i.test(text)) return { status: "pass", reasonCodes: [...reasons] };
  if (!/^FAIL\b/i.test(text)) return { status: "unavailable", reasonCodes: [] };
  return {
    status: "fail",
    reasonCodes: reasons.length ? [...reasons] : ["video_quality_failed"],
  };
}

function structuredVideoQualityVerdict(
  output: unknown,
): VideoQualityVerdict | null {
  let value = output;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>,
    status = String(record.verdict ?? record.status ?? "").toUpperCase();
  const requested = Array.isArray(record.reasonCodes)
      ? record.reasonCodes.map((reason) => String(reason).toLowerCase())
      : [],
    reasons = VIDEO_QUALITY_REASONS.filter((reason) =>
      requested.includes(reason)
    );
  if (status === "PASS") return { status: "pass", reasonCodes: [...reasons] };
  if (status !== "FAIL") return null;
  return {
    status: "fail",
    reasonCodes: reasons.length ? [...reasons] : ["video_quality_failed"],
  };
}

export function resolveVideoQualityDecision(
  verdict: VideoQualityVerdict,
  failClosed = true,
  customCharacterAgeCheck = true,
): Pick<
  VideoQualityGateResult,
  "action" | "reasonCodes" | "verificationUnavailable"
> {
  if (verdict.status === "pass") {
    return {
      action: "accept",
      reasonCodes: verdict.reasonCodes,
      verificationUnavailable: false,
    };
  }
  if (verdict.status === "fail") {
    const reasonCodes = blockingQualityReasonsForAgePolicy(
      verdict.reasonCodes,
      customCharacterAgeCheck,
    );
    if (!reasonCodes.length) {
      return {
        action: "accept",
        reasonCodes: verdict.reasonCodes,
        verificationUnavailable: false,
      };
    }
    return {
      action: "reject",
      reasonCodes,
      verificationUnavailable: false,
    };
  }
  return failClosed
    ? {
      action: "reject",
      reasonCodes: ["video_quality_unverified"],
      verificationUnavailable: true,
    }
    : { action: "accept", reasonCodes: [], verificationUnavailable: true };
}

export class GeminiVideoQualityClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_MODEL,
    private readonly fetcher: FetchLike = fetch,
    private readonly wait: WaitLike = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
  ) {}

  async assess(
    input: {
      bytes: Uint8Array;
      contentType: string;
      adultAuthorized?: boolean;
      anonymousAdultPartner?: boolean;
      customCharacterAgeCheck?: boolean;
    },
  ): Promise<
    {
      verdict: VideoQualityVerdict;
      model: string;
      inferenceMs: number;
      providerStatus: string;
    }
  > {
    const started = Date.now();
    let uploaded: GeminiFile | null = null;
    try {
      uploaded = await this.upload(input.bytes, input.contentType);
      uploaded = await this.waitUntilReady(uploaded);
      const basePrompt = buildVideoQualityPrompt(
        input.adultAuthorized === true,
        input.anonymousAdultPartner === true,
        input.customCharacterAgeCheck !== false,
      );
      let lastProviderStatus = "unavailable";
      for (let attempt = 1; attempt <= MAX_ASSESSMENT_ATTEMPTS; attempt += 1) {
        const response = await this.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${
            encodeURIComponent(this.model)
          }:generateContent`,
          {
            method: "POST",
            headers: this.jsonHeaders(),
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{
                  file_data: {
                    mime_type: uploaded.mimeType,
                    file_uri: uploaded.uri,
                  },
                  video_metadata: { fps: 3 },
                }, {
                  text: attempt === 1
                    ? basePrompt
                    : `${basePrompt} The prior inspection did not return the required contract. Return JSON only with verdict set to PASS or FAIL and reasonCodes containing only allowed codes.`,
                }],
              }],
              generationConfig: attempt === 1
                ? {
                  temperature: 0,
                  maxOutputTokens: 128,
                  responseMimeType: "text/plain",
                }
                : {
                  temperature: 0,
                  maxOutputTokens: 160,
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: "OBJECT",
                    properties: {
                      verdict: { type: "STRING", enum: ["PASS", "FAIL"] },
                      reasonCodes: {
                        type: "ARRAY",
                        items: {
                          type: "STRING",
                          enum: [...VIDEO_QUALITY_REASONS].filter((reason) =>
                            reason !== "video_quality_unverified"
                          ),
                        },
                      },
                    },
                    required: ["verdict", "reasonCodes"],
                  },
                },
              safetySettings: [{
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE",
              }, {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE",
              }, {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE",
              }, {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE",
              }],
            }),
          },
          45_000,
        );
        if (!response.ok) {
          lastProviderStatus = `http_${response.status}`;
          if (
            attempt < MAX_ASSESSMENT_ATTEMPTS &&
            (response.status === 429 || response.status >= 500)
          ) {
            await this.wait(500 * attempt);
            continue;
          }
          break;
        }
        const payload = await response.json() as Record<string, any>,
          finishReason = String(payload.candidates?.[0]?.finishReason ?? "")
            .toUpperCase(),
          content = String(
            payload.candidates?.[0]?.content?.parts?.map((
              part: Record<string, unknown>,
            ) => part.text).filter(Boolean).join("") ?? "",
          );
        lastProviderStatus = finishReason || "completed";
        if (finishReason === "SAFETY") {
          return {
            verdict: {
              status: "fail",
              reasonCodes: ["adult_safety_violation"],
            },
            model: this.model,
            inferenceMs: Date.now() - started,
            providerStatus: finishReason,
          };
        }
        const verdict = parseVideoQualityVerdict(content);
        if (verdict.status !== "unavailable") {
          return {
            verdict,
            model: this.model,
            inferenceMs: Date.now() - started,
            providerStatus: lastProviderStatus,
          };
        }
        if (attempt < MAX_ASSESSMENT_ATTEMPTS) await this.wait(500 * attempt);
      }
      return {
        verdict: { status: "unavailable", reasonCodes: [] },
        model: this.model,
        inferenceMs: Date.now() - started,
        providerStatus: lastProviderStatus,
      };
    } catch {
      return {
        verdict: { status: "unavailable", reasonCodes: [] },
        model: this.model,
        inferenceMs: Date.now() - started,
        providerStatus: "unavailable",
      };
    } finally {
      if (uploaded?.name) await this.delete(uploaded.name);
    }
  }

  private async upload(
    bytes: Uint8Array,
    contentType: string,
  ): Promise<GeminiFile> {
    const start = await this.request(
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      {
        method: "POST",
        headers: {
          ...this.jsonHeaders(),
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
          "X-Goog-Upload-Header-Content-Type": contentType,
        },
        body: JSON.stringify({
          file: {
            display_name: `kivelle-video-quality-${crypto.randomUUID()}`,
          },
        }),
      },
      15_000,
    );
    if (!start.ok) {
      throw new Error(`video_quality_upload_start_${start.status}`);
    }
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl || !uploadUrl.startsWith("https://")) {
      throw new Error("video_quality_upload_url_missing");
    }
    const uploaded = await this.request(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(bytes.byteLength),
        "Content-Type": contentType,
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: bytes as unknown as BodyInit,
    }, 45_000);
    if (!uploaded.ok) {
      throw new Error(`video_quality_upload_${uploaded.status}`);
    }
    const payload = await uploaded.json() as Record<string, any>,
      file = normalizeFile(payload.file, contentType);
    if (!file) throw new Error("video_quality_file_invalid");
    return file;
  }

  private async waitUntilReady(initial: GeminiFile): Promise<GeminiFile> {
    let file = initial;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (file.state === "ACTIVE") return file;
      if (file.state === "FAILED") throw new Error("video_quality_file_failed");
      if (attempt > 0) await this.wait(Math.min(4_000, 800 * attempt));
      const response = await this.request(
        `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
        { headers: this.apiHeaders() },
        10_000,
      );
      if (!response.ok) {
        throw new Error(`video_quality_file_status_${response.status}`);
      }
      const next = normalizeFile(await response.json(), file.mimeType);
      if (!next) throw new Error("video_quality_file_status_invalid");
      file = next;
    }
    throw new Error("video_quality_file_timeout");
  }

  private async delete(name: string): Promise<void> {
    try {
      await this.request(
        `https://generativelanguage.googleapis.com/v1beta/${name}`,
        { method: "DELETE", headers: this.apiHeaders() },
        10_000,
      );
    } catch { /* Best-effort cleanup; Gemini Files expire independently. */ }
  }
  private apiHeaders(): Record<string, string> {
    return { "x-goog-api-key": this.apiKey };
  }
  private jsonHeaders(): Record<string, string> {
    return { ...this.apiHeaders(), "Content-Type": "application/json" };
  }
  private async request(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    return await this.fetcher(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  }
}

export async function gateGeneratedVideoQuality(
  db: SupabaseClient,
  job: Record<string, any>,
  media: Record<string, any>,
  input: {
    bytes: Uint8Array;
    contentType: string;
    client?: GeminiVideoQualityClient;
  },
): Promise<VideoQualityGateResult> {
  if (
    String(media.media_type) !== "video" ||
    !envEnabled("KIVELLE_VIDEO_QUALITY_GATE_ENABLED", true)
  ) {
    return {
      action: "accept",
      reasonCodes: [],
      metadata: { videoQualityGate: "disabled" },
      verificationUnavailable: false,
    };
  }
  const key = Deno.env.get("GEMINI_API_KEY"),
    model = Deno.env.get("KIVELLE_VIDEO_QUALITY_MODEL") ?? DEFAULT_MODEL,
    client = input.client ??
      (key ? new GeminiVideoQualityClient(key, model) : null),
    failClosed = envEnabled("KIVELLE_VIDEO_QUALITY_FAIL_CLOSED", true),
    mediaMetadata = (media.metadata ?? {}) as Record<string, unknown>,
    adultAuthorized = mediaMetadata.adultAuthorized === true &&
      media.visibility_scope === "web_adult" &&
      ["suggestive", "mature", "explicit"].includes(
        String(media.content_level ?? ""),
      ),
    anonymousAdultPartner = adultAuthorized &&
      mediaMetadata.anonymousAdultPartner === true,
    customCharacterAgeCheck =
      await mediaRequiresCustomCharacterAgeCheck(db, media);
  if (
    adultAuthorized &&
    (!adultVideoFeatureEnabled() ||
      !await currentAdultMediaJobAuthorized(db, media))
  ) {
    return {
      action: "reject",
      reasonCodes: ["adult_safety_violation"],
      metadata: { videoQualityGate: "adult_authorization_expired" },
      verificationUnavailable: false,
    };
  }
  // A manual approval is an explicit, per-asset operational decision. It is
  // intentionally stored only on the private server record and cannot be set
  // through the client API. Provider safety, current adult authorization, and
  // private-asset delivery checks still run before this quality-only bypass.
  if (mediaMetadata.videoQualityManualOverride === true) {
    const metadata = compact({
      videoQualityCheckedAt: new Date().toISOString(),
      videoQualityVerdict: "manual_approval",
      videoQualityReasonCodes: [],
      videoQualityProvider: "manual_review",
      videoQualityModel: null,
      videoQualityProviderStatus: "approved",
      videoQualityInferenceMs: 0,
      videoQualityFailClosed: failClosed,
    });
    await db.from("together_media_provider_jobs").update({
      provider_metadata: {
        ...((job.provider_metadata ?? {}) as Record<string, unknown>),
        ...metadata,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing");
    await track(db, String(media.user_id), "video_quality_checked", {
      mediaId: media.id,
      verdict: "manual_approval",
      reasonCodes: [],
      verificationUnavailable: false,
      qaProvider: "manual_review",
      qaModel: null,
      qaProviderStatus: "approved",
      qaInferenceMs: 0,
    });
    return {
      action: "accept",
      reasonCodes: [],
      metadata,
      verificationUnavailable: false,
    };
  }
  const assessment = client
    ? await client.assess({
      bytes: input.bytes,
      contentType: input.contentType,
      adultAuthorized,
      anonymousAdultPartner,
      customCharacterAgeCheck,
    })
    : {
      verdict: { status: "unavailable" as const, reasonCodes: [] },
      model,
      providerStatus: "not_configured",
      inferenceMs: 0,
    };
  const decision = resolveVideoQualityDecision(
    assessment.verdict,
    failClosed && (!adultAuthorized || customCharacterAgeCheck),
    customCharacterAgeCheck,
  ),
    metadata = compact({
      videoQualityCheckedAt: new Date().toISOString(),
      videoQualityVerdict: assessment.verdict.status,
      videoQualityReasonCodes: decision.reasonCodes,
      videoQualityProvider: "gemini",
      videoQualityModel: assessment.model,
      videoQualityProviderStatus: assessment.providerStatus,
      videoQualityInferenceMs: assessment.inferenceMs,
      videoQualityFailClosed: failClosed,
    });
  await db.from("together_media_provider_jobs").update({
    provider_metadata: {
      ...((job.provider_metadata ?? {}) as Record<string, unknown>),
      ...metadata,
    },
    updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("status", "processing");
  await track(db, String(media.user_id), "video_quality_checked", {
    mediaId: media.id,
    verdict: assessment.verdict.status,
    reasonCodes: decision.reasonCodes,
    verificationUnavailable: decision.verificationUnavailable,
    qaProvider: "gemini",
    qaModel: assessment.model,
    qaProviderStatus: assessment.providerStatus,
    qaInferenceMs: assessment.inferenceMs,
  });
  return { ...decision, metadata };
}

async function mediaRequiresCustomCharacterAgeCheck(
  db: SupabaseClient,
  media: Record<string, any>,
): Promise<boolean> {
  const fromMeta = customCharacterAgeCheckFromMetadata(media.metadata);
  if (fromMeta !== null) return fromMeta;
  const characterInstanceId = String(media.character_instance_id ?? "");
  if (!characterInstanceId) return true;
  try {
    const ids = normalizeMediaSubjectIds(
      characterInstanceId,
      media.subject_character_instance_ids,
    );
    const result = await db.from("together_character_instances").select(
      "together_character_templates(creator_id)",
    ).in("id", ids);
    const rows = Array.isArray(result?.data) ? result.data : [];
    if (!rows.length) return true;
    return rows.some((row: Record<string, unknown>) => {
      const template = row.together_character_templates;
      const record = Array.isArray(template) ? template[0] : template;
      return isCustomCharacterTemplate(record);
    });
  } catch {
    return true;
  }
}

function normalizeFile(
  value: unknown,
  fallbackMimeType: string,
): GeminiFile | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Record<string, unknown>,
    name = String(file.name ?? ""),
    uri = String(file.uri ?? ""),
    mimeType = String(file.mimeType ?? file.mime_type ?? fallbackMimeType),
    state = String(file.state ?? "PROCESSING").toUpperCase();
  return name.startsWith("files/") && uri.startsWith("https://")
    ? { name, uri, mimeType, state }
    : null;
}
function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}
function envEnabled(name: string, fallback = false): boolean {
  const value = Deno.env.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
