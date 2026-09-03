import {
  classifyPhotoIntent,
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

const ADULT_LEVELS = new Set<MediaLevel>(["suggestive", "mature", "explicit"]);
const ANONYMOUS_PARTNER =
  /\b(?:couple|two\s+(?:fictional\s+)?adults?|man\s+and\s+(?:a\s+)?woman|woman\s+and\s+(?:a\s+)?man|with\s+(?:him|her|their\s+partner|a\s+partner)|intercourse|doggy(?:[- ]style)?|penetrat(?:e|es|ed|ing|ion)|having\s+sex|making\s+love)\b/i;

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

export function directVideoOpeningFrameRequest(input: {
  prompt: string;
  locationName: string;
  contentLevel: MediaLevel;
  anonymousAdultPartner: boolean;
}): string {
  const adult = ADULT_LEVELS.has(input.contentLevel);
  // canonicalRequestForMedia intentionally caps requestText at 400 characters.
  // Put the non-negotiable policy and anatomy requirements first so a long user
  // direction can never truncate them before the opening-frame provider sees it.
  const head = adult
    ? input.anonymousAdultPartner
      ? `Opening frame at ${input.locationName}. Exactly two consenting fictional adults visibly 25+: companion plus one anonymous original, non-identifiable partner not based on the user or any real person.`
      : `Opening frame at ${input.locationName}. Only the consenting fictional companion, visibly age 25+.`
    : `Opening frame at ${input.locationName}. Show one stable natural pose with the companion clearly visible.`;
  const tail = adult
    ? "Keep the intimate composition and natural complete anatomy; no censoring, smoothing, blanking, doll-like surfaces, or text."
    : "No text, captions, or extra people.";
  const fixed = `${head} Direction:  ${tail}`.replace(/\s+/g, " ").trim();
  const directionBudget = Math.max(0, 400 - fixed.length - 1);
  const direction = input.prompt.replace(/\s+/g, " ").trim().slice(
    0,
    directionBudget,
  );
  return `${head} Direction: ${direction} ${tail}`.replace(/\s+/g, " ").trim()
    .slice(0, 400);
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
