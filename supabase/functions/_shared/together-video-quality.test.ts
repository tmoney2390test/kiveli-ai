import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildVideoQualityPrompt,
  GeminiVideoQualityClient,
  parseVideoQualityVerdict,
  resolveVideoQualityDecision,
} from "./together-video-quality.ts";

Deno.test("video quality prompt explicitly rejects doll anatomy and temporal body failures", () => {
  const standard = buildVideoQualityPrompt(false),
    adult = buildVideoQualityPrompt(true);
  for (
    const code of [
      "doll_like_anatomy",
      "missing_anatomy",
      "fused_anatomy",
      "temporal_anatomy_inconsistency",
      "unexpected_censoring",
    ]
  ) assertStringIncludes(standard, code);
  assertStringIncludes(standard, "Fail unexpected_nudity_or_sexual_content");
  assertStringIncludes(adult, "Authorized fictional-adult nudity and consensual sexual activity may pass");
  const partnered = buildVideoQualityPrompt(true, true);
  assertStringIncludes(
    partnered,
    "exactly the approved fictional companion and one distinct anonymous",
  );
  assertStringIncludes(partnered, "age 25 or older");
  assertStringIncludes(partnered, "must not resemble the user");
});

Deno.test("video quality verdict parsing is strict and retains anatomy failures", () => {
  assertEquals(parseVideoQualityVerdict("PASS"), {
    status: "pass",
    reasonCodes: [],
  });
  assertEquals(
    parseVideoQualityVerdict(
      "FAIL: doll_like_anatomy, temporal_anatomy_inconsistency",
    ),
    {
      status: "fail",
      reasonCodes: ["doll_like_anatomy", "temporal_anatomy_inconsistency"],
    },
  );
  assertEquals(parseVideoQualityVerdict("Looks acceptable"), {
    status: "unavailable",
    reasonCodes: [],
  });
  assertEquals(parseVideoQualityVerdict("FAIL: something odd"), {
    status: "fail",
    reasonCodes: ["video_quality_failed"],
  });
});

Deno.test("video delivery fails closed when quality cannot be verified", () => {
  assertEquals(
    resolveVideoQualityDecision(
      { status: "unavailable", reasonCodes: [] },
      true,
    ),
    {
      action: "reject",
      reasonCodes: ["video_quality_unverified"],
      verificationUnavailable: true,
    },
  );
  assertEquals(
    resolveVideoQualityDecision(
      { status: "unavailable", reasonCodes: [] },
      false,
    ),
    { action: "accept", reasonCodes: [], verificationUnavailable: true },
  );
  assertEquals(
    resolveVideoQualityDecision({
      status: "fail",
      reasonCodes: ["doll_like_anatomy"],
    }, true),
    {
      action: "reject",
      reasonCodes: ["doll_like_anatomy"],
      verificationUnavailable: false,
    },
  );
});

Deno.test("Gemini video inspection uploads, evaluates, and deletes the private candidate", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetcher = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url = String(input), method = String(init.method ?? "GET");
    calls.push({ url, method, body: init.body });
    if (url.includes("/upload/v1beta/files")) {
      return new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://upload.test/session" },
      });
    }
    if (url === "https://upload.test/session") {
      return Response.json({
        file: {
          name: "files/video-qa",
          uri: "https://files.test/video-qa",
          mimeType: "video/mp4",
          state: "PROCESSING",
        },
      });
    }
    if (url.endsWith("/v1beta/files/video-qa") && method === "GET") {
      return Response.json({
        name: "files/video-qa",
        uri: "https://files.test/video-qa",
        mimeType: "video/mp4",
        state: "ACTIVE",
      });
    }
    if (url.includes(":generateContent")) {
      return Response.json({
        candidates: [{
          finishReason: "STOP",
          content: { parts: [{ text: "FAIL doll_like_anatomy" }] },
        }],
      });
    }
    if (url.endsWith("/v1beta/files/video-qa") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 500 });
  };
  const client = new GeminiVideoQualityClient(
      "secret",
      "gemini-test",
      fetcher,
      async () => undefined,
    ),
    result = await client.assess({
      bytes: new Uint8Array([0, 1, 2, 3]),
      contentType: "video/mp4",
    });
  assertEquals(result.verdict, {
    status: "fail",
    reasonCodes: ["doll_like_anatomy"],
  });
  assert(calls.some((call) => call.url.includes(":generateContent")));
  assert(
    calls.some((call) =>
      call.method === "DELETE" && call.url.endsWith("/v1beta/files/video-qa")
    ),
  );
  const generation = String(
    calls.find((call) => call.url.includes(":generateContent"))?.body ?? "",
  );
  assertStringIncludes(generation, "https://files.test/video-qa");
  assertStringIncludes(generation, "doll_like_anatomy");
  assertStringIncludes(generation, '"fps":3');
});

Deno.test("Gemini safety stops are treated as a terminal video rejection", async () => {
  const fetcher = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url = String(input), method = String(init.method ?? "GET");
    if (url.includes("/upload/v1beta/files")) {
      return new Response("", {
        headers: { "x-goog-upload-url": "https://upload.test/safety" },
      });
    }
    if (url === "https://upload.test/safety") {
      return Response.json({
        file: {
          name: "files/safety",
          uri: "https://files.test/safety",
          mimeType: "video/mp4",
          state: "ACTIVE",
        },
      });
    }
    if (url.includes(":generateContent")) {
      return Response.json({ candidates: [{ finishReason: "SAFETY" }] });
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    return new Response(null, { status: 500 });
  };
  const client = new GeminiVideoQualityClient(
      "secret",
      "gemini-test",
      fetcher,
      async () => undefined,
    ),
    result = await client.assess({
      bytes: new Uint8Array([1]),
      contentType: "video/mp4",
    });
  assertEquals(result.verdict, {
    status: "fail",
    reasonCodes: ["adult_safety_violation"],
  });
});
