type RelayClaims = {
  sub: string;
  callSessionId: string;
  route: "standard";
  jti: string;
  configHash: string;
  iat: number;
  exp: number;
};

export async function mintVoiceRelayToken(input: {
  userId: string;
  callSessionId: string;
  configuration: Record<string, unknown>;
  secret: string;
  ttlSeconds?: number;
}): Promise<{ token: string; expiresAt: string; configurationHash: string; jti: string }> {
  const now = Math.floor(Date.now() / 1_000);
  const exp = now + Math.max(30, Math.min(300, input.ttlSeconds ?? 120));
  const configurationHash = await sha256Base64Url(JSON.stringify(input.configuration));
  const claims: RelayClaims = {
    sub: input.userId,
    callSessionId: input.callSessionId,
    route: "standard",
    jti: crypto.randomUUID(),
    configHash: configurationHash,
    iat: now,
    exp,
  };
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson(claims);
  const unsigned = `${header}.${payload}`;
  const signature = await hmacBase64Url(unsigned, input.secret);
  return {
    token: `${unsigned}.${signature}`,
    expiresAt: new Date(exp * 1_000).toISOString(),
    configurationHash,
    jti: claims.jti,
  };
}

export async function sealVoiceRelayConfiguration(
  configuration: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await relayEncryptionKey(secret, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(configuration));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("kivelle-voice-relay-config-v1") },
    key,
    plaintext,
  ));
  return `${base64Url(iv)}.${base64Url(ciphertext)}`;
}

export async function verifyVoiceRelayUsageProof(input: {
  callSessionId: string;
  event: Record<string, unknown>;
  proof: string;
  secret: string;
}): Promise<boolean> {
  if (!input.secret || !/^[A-Za-z0-9_-]{32,128}$/.test(input.proof)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(input.proof),
    new TextEncoder().encode(usageProofPayload(input.callSessionId, input.event)),
  );
}

export function usageProofPayload(
  callSessionId: string,
  event: Record<string, unknown>,
): string {
  const number = (key: string) => Math.max(0, Math.round(Number(event[key] ?? 0)));
  return `kivelle.voice.usage.v1\0${callSessionId}\0${JSON.stringify({
    sequence: number("sequence"),
    sttBillableMs: number("sttBillableMs"),
    inputSpeechMs: number("inputSpeechMs"),
    dialogueInputTokens: number("dialogueInputTokens"),
    dialogueCachedInputTokens: number("dialogueCachedInputTokens"),
    dialogueOutputTokens: number("dialogueOutputTokens"),
    ttsCharacters: number("ttsCharacters"),
    outputAudioMs: number("outputAudioMs"),
    discardedOutputAudioMs: number("discardedOutputAudioMs"),
    sttFinalLatencyMs: event.sttFinalLatencyMs == null ? null : number("sttFinalLatencyMs"),
    dialogueFirstTokenLatencyMs: event.dialogueFirstTokenLatencyMs == null ? null : number("dialogueFirstTokenLatencyMs"),
    ttsFirstAudioLatencyMs: event.ttsFirstAudioLatencyMs == null ? null : number("ttsFirstAudioLatencyMs"),
    status: String(event.status ?? ""),
    failureCode: typeof event.failureCode === "string" ? event.failureCode : null,
  })}`;
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function hmacBase64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function relayEncryptionKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`kivelle-voice-relay-encryption-v1\0${secret}`),
  );
  return await crypto.subtle.importKey("raw", material, "AES-GCM", false, usages);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
