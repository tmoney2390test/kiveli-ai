import {
  mintVoiceRelayToken,
  sealVoiceRelayConfiguration,
  usageProofPayload,
  verifyVoiceRelayUsageProof,
} from "./voice-relay-token.ts";

Deno.test("relay token is short-lived, call-bound, and does not expose its signing key", async () => {
  const secret = "server-only-relay-secret";
  const configuration = { route: "standard", model: "grok-4.3", voice: "eve" };
  const result = await mintVoiceRelayToken({
    userId: "user-1",
    callSessionId: "call-1",
    configuration,
    secret,
    ttlSeconds: 120,
  });
  const [header, payload, signature] = result.token.split(".");
  assert(Boolean(header && payload && signature));
  assert(!result.token.includes(secret));
  const claims = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
  assert(claims.sub === "user-1");
  assert(claims.callSessionId === "call-1");
  assert(claims.route === "standard");
  assert(claims.configHash === result.configurationHash);
  assert(Number(claims.exp) - Number(claims.iat) === 120);
  assert(result.jti === claims.jti);

  const changed = await mintVoiceRelayToken({
    userId: "user-1",
    callSessionId: "call-1",
    configuration: { ...configuration, voice: "ara" },
    secret,
  });
  assert(changed.configurationHash !== result.configurationHash);
});

Deno.test("sealed relay configuration does not expose private call context", async () => {
  const sensitive = "private-memory-never-sent-in-cleartext";
  const envelope = await sealVoiceRelayConfiguration({ instructions: sensitive }, "relay-secret");
  assert(!envelope.includes(sensitive));
  assert(envelope.split(".").length === 2);
});

Deno.test("relay usage proofs bind numeric telemetry to one call", async () => {
  const secret = "server-only-relay-secret";
  const event = { sequence: 1, sttBillableMs: 1_000, status: "success" };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(usageProofPayload("call-1", event)),
  ));
  const proof = encodeBase64Url(bytes);
  assert(await verifyVoiceRelayUsageProof({ callSessionId: "call-1", event, proof, secret }));
  assert(!await verifyVoiceRelayUsageProof({ callSessionId: "call-2", event, proof, secret }));
  assert(!await verifyVoiceRelayUsageProof({ callSessionId: "call-1", event: { ...event, sttBillableMs: 2_000 }, proof, secret }));
});

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
