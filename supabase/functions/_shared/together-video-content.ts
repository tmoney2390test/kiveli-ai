import {
  classifyPhotoIntent,
  visibleAdultAnatomyTargetLabels,
  type MediaLevel,
} from "../../../packages/together-domain/src/media.ts";

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
    return `${direction.slice(0, Math.max(0, 400 - policy.length - 1))} ${policy}`
      .replace(/\s+/g, " ").trim().slice(0, 400);
  }
  const anatomy = visibleAdultAnatomyTargetLabels(direction);
  const anatomyCue = anatomy.length
    ? `Visible complete ${anatomy.join(", ")}; no censoring, smoothing, blanking, or doll-like surfaces.`
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
