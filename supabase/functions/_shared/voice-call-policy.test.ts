import {
  resolveRealtimeVoiceContentMode,
  voiceCallFallbackLifeRun,
} from "./voice-call-policy.ts";

const eligible = {
  requestedMode: "explicit",
  ageVerified: true,
  characterAge: 29,
  romanceEnabled: true,
  friendsOnly: false,
  explicitProviderEnabled: true,
};

Deno.test("realtime voice caps legacy explicit mode at mature", () => {
  assert(resolveRealtimeVoiceContentMode(eligible) === "mature");
  assert(
    resolveRealtimeVoiceContentMode({ ...eligible, ageVerified: false }) !==
      "explicit",
  );
  assert(
    resolveRealtimeVoiceContentMode({ ...eligible, characterAge: 17 }) !==
      "explicit",
  );
  assert(
    resolveRealtimeVoiceContentMode({ ...eligible, romanceEnabled: false }) ===
      "standard",
  );
  assert(
    resolveRealtimeVoiceContentMode({ ...eligible, friendsOnly: true }) ===
      "standard",
  );
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      explicitProviderEnabled: false,
    }) === "mature",
  );
});

Deno.test("realtime non-explicit modes preserve romance boundaries", () => {
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      requestedMode: "romance",
      explicitProviderEnabled: false,
    }) === "romance",
  );
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      requestedMode: "mature",
      explicitProviderEnabled: false,
    }) === "mature",
  );
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      requestedMode: "romance",
      friendsOnly: true,
    }) === "standard",
  );
});

Deno.test("voice call fallback preserves canonical character presence", () => {
  const fallback = voiceCallFallbackLifeRun({
    current_location_id: "location-id",
    current_activity: "Closing the gallery",
    current_mood: "focused",
    current_energy: "low",
    current_interruptibility: "limited",
    current_presence_source: "schedule",
  });

  assert(fallback.degraded === true);
  assert(fallback.state.locationId === "location-id");
  assert(fallback.state.activity === "Closing the gallery");
  assert(fallback.state.mood === "focused");
  assert(fallback.state.energy === "low");
  assert(fallback.state.interruptibility === "limited");
  assert(fallback.stateSource === "schedule");
});

Deno.test("voice call fallback is complete when character presence is empty", () => {
  const fallback = voiceCallFallbackLifeRun(null);

  assert(fallback.state.locationId === null);
  assert(fallback.state.activity === "Having some unstructured time");
  assert(fallback.state.availability === "available");
  assert(fallback.state.interruptibility === "open");
  assert(fallback.stateSource === "character_state");
});

function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion_failed");
}
