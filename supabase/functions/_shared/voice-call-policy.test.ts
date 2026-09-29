import {
  resolveRealtimeVoiceContentMode,
  resolveConversationVoiceContentMode,
  voiceCallFallbackLifeRun,
} from "./voice-call-policy.ts";

const eligible = {
  requestedMode: "explicit",
  ageVerified: true,
  characterAge: 29,
  romanceEnabled: true,
  friendsOnly: false,
  verifiedWebSurface: true,
  webAdultEnabled: true,
};

Deno.test('real saved Spicy preferences reach voice authorization without the text-provider cap',()=>{
  const input={profile:{age_verified_at:'2026-09-22T01:43:38Z',adult_eligible_at:'2026-09-22T01:43:38Z',content_preferences:{contentMode:'explicit',romanceEnabled:true}},conversation:{metadata:{chatPreferences:{contentMode:'explicit'}}},characterAge:18,verifiedWebSurface:true,webAdultEnabled:true};
  assert(resolveConversationVoiceContentMode(input)==='explicit');
  assert(resolveConversationVoiceContentMode({...input,verifiedWebSurface:false})==='mature');
  assert(resolveConversationVoiceContentMode({...input,characterAge:undefined})!=='explicit');
  assert(resolveConversationVoiceContentMode({...input,profile:{...input.profile,age_verified_at:null,adult_eligible_at:null}})!=='explicit');
  assert(resolveConversationVoiceContentMode({...input,relationship:{romance_path_status:'friends_only'}})==='standard');
  assert(resolveConversationVoiceContentMode({...input,conversation:{metadata:{chatPreferences:{contentMode:'romance'}}}})==='romance');
});

Deno.test("verified adult website calls inherit explicit chat mode", () => {
  assert(resolveRealtimeVoiceContentMode(eligible) === "explicit");
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
      webAdultEnabled: false,
    }) === "mature",
  );
});

Deno.test("native and unverified calls retain the non-explicit cap", () => {
  assert(resolveRealtimeVoiceContentMode({ ...eligible, verifiedWebSurface: false }) === "mature");
  for (const characterAge of [undefined, null, 0, 17, "unknown"]) {
    assert(resolveRealtimeVoiceContentMode({ ...eligible, characterAge }) !== "explicit");
  }
});

Deno.test("realtime non-explicit modes preserve romance boundaries", () => {
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      requestedMode: "romance",
      webAdultEnabled: false,
    }) === "romance",
  );
  assert(
    resolveRealtimeVoiceContentMode({
      ...eligible,
      requestedMode: "mature",
      webAdultEnabled: false,
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
