import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  adultVideoFeatureEnabled,
  directVideoOpeningFrameRequest,
  resolveDirectVideoContentDecision,
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
  assertStringIncludes(prompt, "consenting fictional adults visibly 25+");
  assertStringIncludes(prompt, "not based on the user or any real person");
  assertStringIncludes(prompt, "no censoring");
  assertStringIncludes(prompt, "couple embraces");
  assert(prompt.length <= 400);
});

Deno.test("adult opening-frame safety survives a maximum-length direction", () => {
  const prompt = directVideoOpeningFrameRequest({
    prompt: "intimate cinematic direction ".repeat(30),
    locationName: "Snowcrest",
    contentLevel: "explicit",
    anonymousAdultPartner: true,
  });
  assertStringIncludes(prompt, "not based on the user or any real person");
  assertStringIncludes(prompt, "no censoring");
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
