import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  adultVideoFeatureEnabled,
  directVideoOpeningFrameRequest,
  resolveAnimatedVideoContentLevel,
  resolveDirectVideoContentDecision,
  resolveSourcePhotoVideoDecision,
} from "./together-video-content.ts";

Deno.test("direct video keeps ordinary requests on the safe path", () => {
  assertEquals(
    resolveDirectVideoContentDecision({
      requestText: "Smile at the camera while snow falls",
      authorizedWebAdult: false,
      adultVideoFeatureEnabled: false,
    }),
    {
      contentLevel: "standard",
      adult: false,
      anonymousAdultPartner: false,
      allowed: true,
      reasonCode: "allowed",
    },
  );
});

Deno.test("direct video fails closed instead of silently sanitizing adult requests", () => {
  const disabled = resolveDirectVideoContentDecision({
    requestText: "Two adults having explicit intercourse",
    authorizedWebAdult: true,
    adultVideoFeatureEnabled: false,
  });
  assertEquals(disabled.reasonCode, "adult_video_disabled");
  const unauthorized = resolveDirectVideoContentDecision({
    requestText: "Two adults having explicit intercourse",
    authorizedWebAdult: false,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(unauthorized.reasonCode, "web_adult_authorization_required");
});

Deno.test("authorized adult video preserves the explicit level and identifies an anonymous partner", () => {
  const decision = resolveDirectVideoContentDecision({
    requestText: "A fictional adult couple having explicit intercourse",
    authorizedWebAdult: true,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(decision.contentLevel, "explicit");
  assert(decision.allowed);
  assert(decision.anonymousAdultPartner);
});

Deno.test("adult opening frames establish the requested composition without using a real-person identity", () => {
  const prompt = directVideoOpeningFrameRequest({
    prompt: "A consenting fictional adult couple embraces",
    locationName: "Snowcrest",
    contentLevel: "explicit",
    anonymousAdultPartner: true,
  });
  assertStringIncludes(prompt, "consenting fictional adults 25+");
  assertStringIncludes(prompt, "not the user or any real person");
  assertStringIncludes(prompt, "no censoring");
  assertStringIncludes(prompt, "couple embraces");
  assert(prompt.indexOf("couple embraces") < prompt.indexOf("Opening frame"));
  assert(prompt.length <= 400);
});

Deno.test("adult opening-frame safety survives a maximum-length direction", () => {
  const prompt = directVideoOpeningFrameRequest({
    prompt: "intimate cinematic direction ".repeat(30),
    locationName: "Snowcrest",
    contentLevel: "explicit",
    anonymousAdultPartner: true,
  });
  assertStringIncludes(prompt, "not the user or any real person");
  assertStringIncludes(prompt, "no censoring");
  assert(prompt.startsWith("intimate cinematic direction"));
  assert(prompt.length <= 400);
});

Deno.test("adult opening frames keep named anatomy in the stills request", () => {
  const prompt = directVideoOpeningFrameRequest({
    prompt:
      "naked photo bent over with your ass and pussy on display front and center",
    locationName: "Neon Kyo",
    contentLevel: "explicit",
    anonymousAdultPartner: false,
  });
  assertStringIncludes(prompt, "bent over");
  assertStringIncludes(prompt, "pussy");
  assertStringIncludes(prompt, "vulva");
  assert(prompt.indexOf("naked photo") < prompt.indexOf("Opening frame"));
  assert(prompt.length <= 400);
});

Deno.test("adult video requires all three server kill switches", () => {
  const values: Record<string, string> = {
    WEB_ADULT_MODE_ENABLED: "true",
    KIVELLE_ADULT_MEDIA_ENABLED: "true",
    KIVELLE_ADULT_VIDEO_ENABLED: "true",
  };
  assert(adultVideoFeatureEnabled((name) => values[name]));
  values.KIVELLE_ADULT_VIDEO_ENABLED = "false";
  assertEquals(adultVideoFeatureEnabled((name) => values[name]), false);
});

Deno.test("bring to life exposes the matching model class for its source photo", () => {
  const safe = resolveSourcePhotoVideoDecision({
    contentLevel: "romance",
    contentRating: "suggestive",
    visibilityScope: "all",
    authorizedWebAdult: false,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(safe.contentClass, "sfw");
  assert(safe.allowed);

  const adult = resolveSourcePhotoVideoDecision({
    contentLevel: "explicit",
    contentRating: "explicit",
    visibilityScope: "web_adult",
    authorizedWebAdult: true,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(adult.contentClass, "adult_capable");
  assert(adult.allowed);
});

Deno.test("bring to life fails closed for adult photos outside an authorized web session", () => {
  const denied = resolveSourcePhotoVideoDecision({
    contentLevel: "explicit",
    contentRating: "explicit",
    visibilityScope: "web_adult",
    authorizedWebAdult: false,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(denied.reasonCode, "web_adult_authorization_required");
  assertEquals(denied.allowed, false);

  const mismatched = resolveSourcePhotoVideoDecision({
    contentLevel: "explicit",
    contentRating: "explicit",
    visibilityScope: "all",
    authorizedWebAdult: true,
    adultVideoFeatureEnabled: true,
  });
  assertEquals(mismatched.reasonCode, "source_content_mismatch");
});

Deno.test("bring-to-life output inherits the higher approved photo or prompt level", () => {
  assertEquals(resolveAnimatedVideoContentLevel("explicit", "standard"), "explicit");
  assertEquals(resolveAnimatedVideoContentLevel("mature", "mature"), "mature");
  assertEquals(resolveAnimatedVideoContentLevel("standard", "suggestive"), "suggestive");
  assertEquals(resolveAnimatedVideoContentLevel("romance", "explicit"), "explicit");
});
