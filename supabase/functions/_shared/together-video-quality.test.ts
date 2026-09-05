import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildVideoQualityPrompt,
  gateGeneratedVideoQuality,
  GeminiVideoQualityClient,
  parseVideoQualityVerdict,
  resolveVideoQualityDecision,
} from "./together-video-quality.ts";

Deno.test("a server-only manual approval bypasses quality classification for one asset", async () => {
  const writes: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.update = (value: unknown) => {
    writes.push(value);
    return chain;
  };
  chain.insert = (value: unknown) => {
    writes.push(value);
    return chain;
  };
  chain.eq = () => chain;
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: null, error: null });
  const db = {
    from: () => chain,
    rpc: (_name: string, value: unknown) => {
      writes.push(value);
      return Promise.resolve({ data: null, error: null });
    },
  } as never;
  const result = await gateGeneratedVideoQuality(db, {
    id: "job-1",
    status: "processing",
    provider_metadata: {},
  }, {
    id: "media-1",
    user_id: "user-1",
    media_type: "video",
    content_level: "standard",
    visibility_scope: "all",
    metadata: { videoQualityManualOverride: true },
  }, {
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "video/mp4",
    client: {
      assess: () => {
        throw new Error("manual approval should not invoke the verifier");
      },
    } as never,
  });
  assertEquals(result.action, "accept");
  assertEquals(result.metadata.videoQualityVerdict, "manual_approval");
  assert(writes.length >= 2);
});

function videoQualityDb() {
  const writes: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.update = (value: unknown) => {
    writes.push(value);
    return chain;
  };
  chain.insert = (value: unknown) => {
    writes.push(value);
    return chain;
  };
  chain.eq = () => chain;
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: null, error: null });
  return {
    writes,
    db: {
      from: () => chain,
      rpc: (_name: string, value: unknown) => {
        writes.push(value);
        return Promise.resolve({ data: null, error: null });
      },
    } as never,
  };
}

Deno.test("official catalog videos can deliver a youthful-adult ambiguous_age warning", async () => {
  const { db } = videoQualityDb();
  const result = await gateGeneratedVideoQuality(db, {
    id: "job-official",
    status: "processing",
    provider_metadata: {},
  }, {
    id: "media-official",
    user_id: "user-1",
    media_type: "video",
    content_level: "standard",
    visibility_scope: "all",
    metadata: { customCharacter: false },
  }, {
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "video/mp4",
    client: {
      assess: async (input: { customCharacterAgeCheck?: boolean }) => {
        if (input.customCharacterAgeCheck !== false) {
          throw new Error("official catalog video QA must use the catalog age rule");
        }
        return {
          verdict: { status: "fail", reasonCodes: ["ambiguous_age"] },
          model: "gemini-test",
          inferenceMs: 1,
          providerStatus: "completed",
        };
      },
    } as never,
  });
  assertEquals(result.action, "accept");
  assertEquals(result.reasonCodes, ["ambiguous_age"]);
});

Deno.test("custom companion videos still reject an ambiguous_age failure", async () => {
  const { db } = videoQualityDb();
  const result = await gateGeneratedVideoQuality(db, {
    id: "job-custom",
    status: "processing",
    provider_metadata: {},
  }, {
    id: "media-custom",
    user_id: "user-1",
    media_type: "video",
    content_level: "standard",
    visibility_scope: "all",
    metadata: { customCharacter: true },
  }, {
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "video/mp4",
    client: {
      assess: async () => ({
        verdict: { status: "fail", reasonCodes: ["ambiguous_age"] },
        model: "gemini-test",
        inferenceMs: 1,
        providerStatus: "completed",
      }),
    } as never,
  });
  assertEquals(result.action, "reject");
  assertEquals(result.reasonCodes, ["ambiguous_age"]);
});

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
  assertStringIncludes(adult, "should not be failed as unexpected_nudity_or_sexual_content");
  assertStringIncludes(adult, "Fail unexpected_censoring if clothing");
  assertStringIncludes(standard, "brief isolated generation glitch");
  assertStringIncludes(standard, "should PASS with duplicate_body_parts");
  const partnered = buildVideoQualityPrompt(true, true);
  assertStringIncludes(
    partnered,
    "exactly the approved fictional companion and one distinct anonymous",
  );
  assertStringIncludes(partnered, "age 25 or older");
  assertStringIncludes(partnered, "must not resemble the user");
  const official = buildVideoQualityPrompt(true, false, false);
  assertStringIncludes(official, "Fail ambiguous_age only for a clearly underage or child presentation");
  assertStringIncludes(official, "Do not fail ambiguous_age because an official catalog adult looks youthful");
  if (official.includes("underage or age-ambiguous presentation")) {
    throw new Error("official catalog video QA must not treat youthful adults as age-ambiguous");
  }
});

Deno.test("video quality verdict parsing is strict and retains anatomy failures", () => {
  assertEquals(parseVideoQualityVerdict("PASS"), {
    status: "pass",
    reasonCodes: [],
  });
  assertEquals(
    parseVideoQualityVerdict(
      "PASS: duplicate_body_parts, temporal_anatomy_inconsistency",
    ),
    {
      status: "pass",
      reasonCodes: ["duplicate_body_parts", "temporal_anatomy_inconsistency"],
    },
  );
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
  assertEquals(
    parseVideoQualityVerdict('{"verdict":"PASS","reasonCodes":[]}'),
    { status: "pass", reasonCodes: [] },
  );
  assertEquals(
    parseVideoQualityVerdict({
      verdict: "FAIL",
      reasonCodes: ["identity_drift"],
    }),
    { status: "fail", reasonCodes: ["identity_drift"] },
  );
  assertEquals(
    parseVideoQualityVerdict({
      verdict: "PASS",
      reasonCodes: ["duplicate_body_parts"],
    }),
    { status: "pass", reasonCodes: ["duplicate_body_parts"] },
  );
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
  assertEquals(
    resolveVideoQualityDecision({
      status: "pass",
      reasonCodes: ["duplicate_body_parts"],
    }, true),
    {
      action: "accept",
      reasonCodes: ["duplicate_body_parts"],
      verificationUnavailable: false,
    },
  );
  assertEquals(
    resolveVideoQualityDecision({
      status: "fail",
      reasonCodes: ["ambiguous_age"],
    }, true, true),
    {
      action: "reject",
      reasonCodes: ["ambiguous_age"],
      verificationUnavailable: false,
    },
  );
  assertEquals(
    resolveVideoQualityDecision({
      status: "fail",
      reasonCodes: ["ambiguous_age"],
    }, true, false),
    {
      action: "accept",
      reasonCodes: ["ambiguous_age"],
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

Deno.test("Gemini video inspection retries an unparseable completed verdict", async () => {
  let inspections = 0;
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url = String(input), method = String(init.method ?? "GET");
    calls.push({ url, body: init.body });
    if (url.includes("/upload/v1beta/files")) {
      return new Response("", {
        headers: { "x-goog-upload-url": "https://upload.test/retry" },
      });
    }
    if (url === "https://upload.test/retry") {
      return Response.json({
        file: {
          name: "files/retry",
          uri: "https://files.test/retry",
          mimeType: "video/mp4",
          state: "ACTIVE",
        },
      });
    }
    if (url.includes(":generateContent")) {
      inspections += 1;
      return Response.json({
        candidates: [{
          finishReason: "STOP",
          content: {
            parts: [{
              text: inspections === 1
                ? ""
                : '{"verdict":"PASS","reasonCodes":[]}',
            }],
          },
        }],
      });
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
  assertEquals(result.verdict, { status: "pass", reasonCodes: [] });
  assertEquals(inspections, 2);
  const structuredCall = calls.find((call, index) =>
    call.url.includes(":generateContent") && index > 0 &&
    String(call.body).includes('"application/json"')
  );
  assert(structuredCall);
});
