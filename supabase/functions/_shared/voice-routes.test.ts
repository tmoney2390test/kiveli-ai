import {
  includedStandardMinutes,
  normalizeVoiceCallRoute,
  standardVoiceModelConfiguration,
  voiceRoutePolicy,
  voiceRouteRolloutEligible,
} from "./voice-routes.ts";

Deno.test("voice routes preserve old clients on Express and accept Standard explicitly", () => {
  assert(normalizeVoiceCallRoute(undefined) === "express");
  assert(normalizeVoiceCallRoute("unexpected") === "express");
  assert(normalizeVoiceCallRoute("standard") === "standard");
});

Deno.test("standard and express canaries are deterministic and independent", () => {
  withEnv({
    KIVELLE_XAI_CASCADED_VOICE_CANARY_PERCENT: "100",
    KIVELLE_XAI_VOICE_CANARY_PERCENT: "0",
  }, () => {
    assert(voiceRouteRolloutEligible("standard", "user-1"));
    assert(!voiceRouteRolloutEligible("express", "user-1"));
    assert(voiceRouteRolloutEligible("standard", "user-1") === voiceRouteRolloutEligible("standard", "user-1"));
  });
});

Deno.test("both call routes use the shared Kivelle Credit balance", () => {
  assert(includedStandardMinutes("free") === 0);
  assert(includedStandardMinutes("kivelle_plus") === 0);
  assert(includedStandardMinutes("kivelle_max") === 0);
});

Deno.test("standard route fails closed unless relay URL, signing key, and flag are valid", () => {
  withEnv({
    KIVELLE_XAI_CASCADED_VOICE_ENABLED: "true",
    KIVELLE_VOICE_RELAY_URL: "https://relay.invalid",
    KIVELLE_VOICE_RELAY_SIGNING_SECRET: "relay-secret",
  }, () => assert(!voiceRoutePolicy("standard", "kivelle_plus").available));
  withEnv({
    KIVELLE_XAI_CASCADED_VOICE_ENABLED: "true",
    KIVELLE_VOICE_RELAY_URL: "wss://voice.example.test/call",
    KIVELLE_VOICE_RELAY_SIGNING_SECRET: "relay-secret",
  }, () => {
    const policy = voiceRoutePolicy("standard", "kivelle_plus");
    assert(policy.available && policy.displayName === "Essential" && policy.creditsPerMinute === 3 && policy.includedMinutes === 0);
  });
});

Deno.test("customer-facing voice names remain independent from stable route ids", () => {
  assert(voiceRoutePolicy("standard", "free").displayName === "Essential");
  assert(voiceRoutePolicy("express", "free").displayName === "Immersive");
});

Deno.test("standard route model defaults remain pinned and can be overridden", () => {
  withEnv({
    KIVELLE_XAI_STREAMING_STT_MODEL: "stt-test",
    KIVELLE_XAI_CASCADE_DIALOGUE_MODEL: "dialogue-test",
    KIVELLE_XAI_STREAMING_TTS_MODEL: "tts-test",
  }, () => {
    const models = standardVoiceModelConfiguration();
    assert(models.sttModel === "stt-test");
    assert(models.dialogueModel === "dialogue-test");
    assert(models.ttsModel === "tts-test");
  });
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}

function withEnv(values: Record<string, string>, run: () => void): void {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, Deno.env.get(name)]));
  try {
    for (const [name, value] of Object.entries(values)) Deno.env.set(name, value);
    run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}
