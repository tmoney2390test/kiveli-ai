import {
  classifyPhotoIntent,
  type MediaLevel,
  visibleAdultAnatomyTargetLabels,
} from "../../../packages/together-domain/src/media.ts";
import {
  buildResponsesRequestBody,
  extractResponsesText,
  responsesProviderEndpoint,
} from "../../../packages/together-domain/src/ai-provider.ts";
import { AppError } from "./types.ts";

export type DirectVideoContentDecision = {
  contentLevel: MediaLevel;
  adult: boolean;
  anonymousAdultPartner: boolean;
  allowed: boolean;
  reasonCode:
    | "allowed"
    | "adult_video_disabled"
    | "web_adult_authorization_required";
};

export type SourcePhotoVideoDecision = {
  contentLevel: MediaLevel;
  contentClass: "sfw" | "adult_capable";
  adult: boolean;
  allowed: boolean;
  reasonCode:
    | "allowed"
    | "source_content_mismatch"
    | "adult_video_disabled"
    | "web_adult_authorization_required";
};

const ADULT_LEVELS = new Set<MediaLevel>(["suggestive", "mature", "explicit"]);
const CONTENT_LEVEL_RANK: Record<MediaLevel, number> = {
  standard: 0,
  romance: 1,
  suggestive: 2,
  mature: 3,
  explicit: 4,
};
const ANONYMOUS_PARTNER =
  /\b(?:couple|two\s+(?:fictional\s+)?adults?|man\s+and\s+(?:a\s+)?woman|woman\s+and\s+(?:a\s+)?man|with\s+(?:him|her|their\s+partner|a\s+partner)|intercourse|doggy(?:[- ]style)?|missionary(?:[- ]style)?|cowgirl|reverse\s+cowgirl|penetrat(?:e|es|ed|ing|ion)|having\s+sex|making\s+love|oral\s+sex)\b/i;

/**
 * Resolve the source photo's already-approved policy before the animation
 * prompt is considered. Restricted sources stay restricted and can only be
 * used from an authorized web-adult session.
 */
export function resolveSourcePhotoVideoDecision(input: {
  contentLevel: unknown;
  contentRating: unknown;
  visibilityScope: unknown;
  authorizedWebAdult: boolean;
  adultVideoFeatureEnabled: boolean;
}): SourcePhotoVideoDecision {
  const rawLevel = String(input.contentLevel ?? "standard") as MediaLevel;
  const validLevel =
    (["standard", "romance", "suggestive", "mature", "explicit"] as const)
      .includes(rawLevel as never);
  const restricted = ADULT_LEVELS.has(rawLevel) ||
    input.contentRating === "explicit" || input.visibilityScope === "web_adult";
  const contentLevel: MediaLevel = restricted && !ADULT_LEVELS.has(rawLevel)
    ? "explicit"
    : rawLevel;
  const sourceShapeValid = validLevel &&
    (restricted
      ? input.visibilityScope === "web_adult"
      : input.visibilityScope === "all" &&
        (input.contentRating === "safe" ||
          input.contentRating === "suggestive"));
  if (!sourceShapeValid) {
    return {
      contentLevel,
      contentClass: restricted ? "adult_capable" : "sfw",
      adult: restricted,
      allowed: false,
      reasonCode: "source_content_mismatch",
    };
  }
  if (restricted && !input.adultVideoFeatureEnabled) {
    return {
      contentLevel,
      contentClass: "adult_capable",
      adult: true,
      allowed: false,
      reasonCode: "adult_video_disabled",
    };
  }
  if (restricted && !input.authorizedWebAdult) {
    return {
      contentLevel,
      contentClass: "adult_capable",
      adult: true,
      allowed: false,
      reasonCode: "web_adult_authorization_required",
    };
  }
  return {
    contentLevel,
    contentClass: restricted ? "adult_capable" : "sfw",
    adult: restricted,
    allowed: true,
    reasonCode: "allowed",
  };
}

export function resolveDirectVideoContentDecision(input: {
  requestText: string;
  authorizedWebAdult: boolean;
  adultVideoFeatureEnabled: boolean;
}): DirectVideoContentDecision {
  const contentLevel =
    classifyPhotoIntent(input.requestText).requestedContentLevel ?? "standard";
  const adult = ADULT_LEVELS.has(contentLevel);
  const anonymousAdultPartner = adult &&
    ANONYMOUS_PARTNER.test(input.requestText);
  if (adult && !input.adultVideoFeatureEnabled) {
    return {
      contentLevel,
      adult,
      anonymousAdultPartner,
      allowed: false,
      reasonCode: "adult_video_disabled",
    };
  }
  if (adult && !input.authorizedWebAdult) {
    return {
      contentLevel,
      adult,
      anonymousAdultPartner,
      allowed: false,
      reasonCode: "web_adult_authorization_required",
    };
  }
  return {
    contentLevel,
    adult,
    anonymousAdultPartner,
    allowed: true,
    reasonCode: "allowed",
  };
}

/** The finished video inherits whichever approved input has the higher level. */
export function resolveAnimatedVideoContentLevel(
  sourceLevel: MediaLevel,
  promptLevel: MediaLevel,
): MediaLevel {
  return CONTENT_LEVEL_RANK[promptLevel] > CONTENT_LEVEL_RANK[sourceLevel]
    ? promptLevel
    : sourceLevel;
}

export function directVideoOpeningFrameRequest(input: {
  prompt: string;
  locationName: string;
  contentLevel: MediaLevel;
  anonymousAdultPartner: boolean;
}): string {
  const adult = ADULT_LEVELS.has(input.contentLevel);
  const direction = input.prompt.replace(/\s+/g, " ").trim();
  // Stills classifiers and pose-rebuild routing read this requestText. Put the
  // user's anatomy and pose first so a 400-character cap cannot drop them.
  if (!adult) {
    const policy =
      `Opening frame at ${input.locationName}. Show one stable natural pose with the companion clearly visible. No text, captions, or extra people.`;
    return `${
      direction.slice(0, Math.max(0, 400 - policy.length - 1))
    } ${policy}`
      .replace(/\s+/g, " ").trim().slice(0, 400);
  }
  const anatomy = visibleAdultAnatomyTargetLabels(direction);
  const anatomyCue = anatomy.length
    ? `Visible complete ${
      anatomy.join(", ")
    }; no censoring, smoothing, blanking, or doll-like surfaces.`
    : "Keep complete natural adult anatomy; no censoring, smoothing, blanking, doll-like surfaces, or text.";
  const people = input.anonymousAdultPartner
    ? "Exactly two consenting fictional adults 25+: companion plus one anonymous original non-identifiable partner, not the user or any real person."
    : "Only the consenting fictional companion, visibly 25+.";
  const policy =
    `Opening frame at ${input.locationName}. ${people} ${anatomyCue} Photoreal; no text.`;
  return `${direction.slice(0, Math.max(0, 400 - policy.length - 1))} ${policy}`
    .replace(/\s+/g, " ").trim().slice(0, 400);
}

export function adultVideoFeatureEnabled(
  read: (name: string) => string | undefined = (name) => Deno.env.get(name),
): boolean {
  const enabled = (name: string) =>
    ["1", "true", "yes", "on"].includes(
      String(read(name) ?? "false").trim().toLowerCase(),
    );
  return enabled("WEB_ADULT_MODE_ENABLED") &&
    enabled("KIVELLE_ADULT_MEDIA_ENABLED") &&
    enabled("KIVELLE_ADULT_VIDEO_ENABLED");
}

export type VideoPromptEnhancementInput = {
  prompt: string;
  characterName: string;
  locationName?: string | null;
  activity?: string | null;
  routeName: string;
  duration: number;
  resolution: string;
  sound: boolean;
  aspectRatio: "9:16" | "16:9";
  contentLevel: string;
};

type VideoPromptEnhancerOptions = {
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class ConfiguredVideoPromptEnhancer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: VideoPromptEnhancerOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = responsesProviderEndpoint("xai");
    this.model = options.model ?? "grok-4.3";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async enhance(input: VideoPromptEnhancementInput): Promise<{
    prompt: string;
    model: string;
    version: string;
    latencyMs: number;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const response = await this.fetcher(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildResponsesRequestBody({
          model: this.model,
          prompt: `${
            videoEnhancementInstructions(input)
          }\n\nApproved request context:\n${
            JSON.stringify({
              direction: input.prompt,
              character: input.characterName,
              location: input.locationName ?? null,
              currentActivity: input.activity ?? null,
              video: {
                model: input.routeName,
                durationSeconds: input.duration,
                resolution: input.resolution,
                sound: input.sound,
                aspectRatio: input.aspectRatio,
                contentLevel: input.contentLevel,
              },
            })
          }`,
          maxOutputTokens: 220,
          reasoningEffort: "none",
          includeReasoning: true,
          stream: false,
          temperature: .25,
        })),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.arrayBuffer().catch(() => new ArrayBuffer(0));
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          "Prompt enhancement is temporarily unavailable.",
          503,
          true,
        );
      }
      const payload = await response.json() as Record<string, unknown>;
      const prompt = normalizeEnhancedVideoPrompt(
        extractResponsesText(payload),
      );
      if (!prompt) {
        throw new AppError(
          "PROVIDER_SUBMISSION_UNKNOWN",
          "The prompt could not be enhanced safely. Your original is unchanged.",
          503,
          true,
        );
      }
      return {
        prompt,
        model: typeof payload.model === "string" ? payload.model : this.model,
        version: "video-prompt-v1",
        latencyMs: Math.max(0, Math.round(performance.now() - started)),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError(
          "PROVIDER_TIMEOUT",
          "Prompt enhancement took too long. Your original is unchanged.",
          503,
          true,
        );
      }
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Prompt enhancement is temporarily unavailable. Your original is unchanged.",
        503,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function configuredVideoPromptEnhancer():
  | ConfiguredVideoPromptEnhancer
  | null {
  if (
    Deno.env.get("VIDEO_PROMPT_ENHANCEMENT_ENABLED")?.trim().toLowerCase() ===
      "false"
  ) return null;
  const apiKey = Deno.env.get("XAI_API_KEY")?.trim();
  if (!apiKey) return null;
  return new ConfiguredVideoPromptEnhancer({
    apiKey,
    model: Deno.env.get("KIVELLE_VIDEO_PROMPT_ENHANCEMENT_MODEL") ?? "grok-4.3",
  });
}

export function videoEnhancementInstructions(
  input: Pick<VideoPromptEnhancementInput, "contentLevel" | "sound">,
): string {
  const adult = ["suggestive", "mature", "explicit"].includes(
    input.contentLevel,
  );
  return [
    "Rewrite an already-approved user direction into one concise, concrete image-to-video prompt of at most 400 characters.",
    "Return only the rewritten prompt, with no label, quotation marks, markdown, refusal, warning, or explanation.",
    "Preserve the exact requested action and intensity. Do not invent people, actions, nudity, clothing changes, locations, dialogue, or story events.",
    adult
      ? "The scene involves fictional consenting adults. Preserve the approved adult direction without euphemizing it or adding details the user did not request."
      : "Keep the result non-explicit and do not expose body areas covered in the source.",
    "Describe motion over time, expression, restrained camera behavior, and small environmental movement. Prefer one continuous physically coherent shot.",
    "Keep identity, face, body count, anatomy, clothing state, setting, and time of day stable. Avoid duplicated or growing limbs and abrupt morphing.",
    input.sound
      ? "Include a brief natural audio cue only when it follows directly from the request."
      : "Do not mention dialogue, music, or audio.",
    "Never introduce minors, ambiguous ages, non-consent, incest, exploitation, sexual violence, bestiality, trafficking, or a real-person likeness.",
  ].join(" ");
}

export function normalizeEnhancedVideoPrompt(value: string): string | null {
  const normalized = value
    .replace(/^\s*(?:enhanced\s+prompt|prompt)\s*:\s*/i, "")
    .trim()
    .replace(/^['"`]+/, "")
    .replace(/['"`]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 2 && normalized.length <= 400 ? normalized : null;
}
