import {
  activeVoiceEntitlement,
  estimateRealtimeVoiceCost,
  voiceBilledMinute,
  voiceMeterMinuteAvailable,
} from "./voice-usage.ts";

Deno.test("expired voice entitlements fail closed without a client refresh", () => {
  const expired = activeVoiceEntitlement({
    tier: "kivelle_max",
    entitlement_keys: ["voice_notes", "voice_priority"],
    expires_at: "2026-08-19T00:00:00Z",
  }, new Date("2026-08-20T00:00:00Z"));
  assert(expired.tier === "free");
  assert(expired.entitlementKeys.length === 0);
  const active = activeVoiceEntitlement({
    tier: "kivelle_plus",
    entitlement_keys: ["voice_notes"],
    expires_at: "2026-08-21T00:00:00Z",
  }, new Date("2026-08-20T00:00:00Z"));
  assert(
    active.tier === "kivelle_plus" &&
      active.entitlementKeys[0] === "voice_notes",
  );
});

Deno.test("voice credits bill each started minute", () => {
  assert(voiceBilledMinute(0) === 1);
  assert(voiceBilledMinute(59_999) === 1);
  assert(voiceBilledMinute(60_000) === 2);
  assert(voiceBilledMinute(60_001) === 2);
  assert(voiceMeterMinuteAvailable("2026-08-20T12:00:00Z",new Date("2026-08-20T12:02:00.001Z"))===3);
});

Deno.test("realtime cost prefers metered input plus output audio", () => {
  withEnv("KIVELLE_XAI_VOICE_COST_TELEMETRY_ENABLED", "true", () => {
    assert(
      estimateRealtimeVoiceCost({
        connectedDurationMs: 600_000,
        inputAudioDurationMs: 60_000,
        outputAudioDurationMs: 30_000,
      }) === .12,
    );
    assert(estimateRealtimeVoiceCost({ connectedDurationMs: 60_000 }) === .08);
  });
});

Deno.test("realtime cost telemetry can be disabled without disabling voice", () => {
  withEnv("KIVELLE_XAI_VOICE_COST_TELEMETRY_ENABLED", "false", () => {
    assert(estimateRealtimeVoiceCost({ connectedDurationMs: 60_000 }) === 0);
  });
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
function withEnv(name: string, value: string, run: () => void): void {
  const original = Deno.env.get(name);
  try {
    Deno.env.set(name, value);
    run();
  } finally {
    if (original == null) Deno.env.delete(name);
    else Deno.env.set(name, original);
  }
}
