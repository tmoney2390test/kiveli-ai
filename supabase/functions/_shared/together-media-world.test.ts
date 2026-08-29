import {
  buildMediaWorldContainmentInstruction,
  resolveRequestedMediaSetting,
  validateReferenceAssetWorldScope,
  type MediaSettingCandidate,
} from "./together-media-world.ts";
import { buildImagePrompt, type CanonicalImageGenerationRequest } from "./together-media-base.ts";
import { buildVeniceImagePrompt, buildWaveSpeedGroupImagePrompt } from "./together-media-providers.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const candidates: MediaSettingCandidate[] = [
  {
    id: "observatory", worldId: "eos", name: "Nightglass Observatory", slug: "nightglass-observatory", category: "observatory", locationType: "venue", description: "Dark workstations under aurora glass.", possibleActivities: ["astronomy"], mediaAliases: [], visualText: "telescope domes aurora glass ice horizon", loreText: "", sortOrder: 1,
  },
  {
    id: "baths", worldId: "eos", name: "Foundry Baths", slug: "foundry-baths", category: "spa", locationType: "venue", description: "Geothermal bathing inside the pressure habitat.", possibleActivities: ["bathing", "recovery", "swimming"], mediaAliases: ["pool", "hydrotherapy pool"], visualText: "stone pools reactor steam locker alcoves low amber light", loreText: "communal body comfort", sortOrder: 2,
  },
];

Deno.test("generic pool requests resolve to a canonical same-world place and remove ambiguous setting wording", () => {
  const result = resolveRequestedMediaSetting("send me a nude photo in the pool", candidates);
  assert(result?.candidate?.id === "baths", "pool must resolve to Foundry Baths");
  assert(result?.providerRequestText === "send me a nude photo", "raw generic pool wording must not reach the provider");
});

Deno.test("real-world modifiers are removed with the requested setting clause", () => {
  const result = resolveRequestedMediaSetting("send a topless photo in a Miami hotel pool with your hair down", candidates);
  assert(result?.candidate?.id === "baths", "the setting must remain in the resident world");
  assert(!result?.providerRequestText.toLowerCase().includes("miami"), "real-world modifier must be removed");
  assert(Boolean(result?.providerRequestText.includes("topless") && result.providerRequestText.includes("hair down")), "content and pose direction must survive setting normalization");
});

Deno.test("exact authored locations take precedence over generic category matching", () => {
  const result = resolveRequestedMediaSetting("take a candid at Nightglass Observatory", candidates);
  assert(result?.match === "exact" && result.candidate?.id === "observatory", "exact location must win");
  assert(result?.providerRequestText === "take a candid", "exact location phrase must be structured, not repeated as raw intent");
});

Deno.test("unrelated requests do not force a location", () => {
  assert(resolveRequestedMediaSetting("send a close portrait with your hair down", candidates) === null, "ordinary portrait must preserve current presence");
  assert(resolveRequestedMediaSetting("send a studio-quality portrait with natural light", candidates) === null, "photographic style language must not be mistaken for a place");
});

Deno.test("world containment instructions make the world and forbidden drift explicit", () => {
  const instruction = buildMediaWorldContainmentInstruction({
    worldId: "eos", worldSlug: "eos-meridian", worldName: "Eos Meridian", worldDescription: "A colony on a tidally locked planet.",
    worldVisualContext: { setting: "pressure habitats in permanent twilight", architecture: ["worn alloy modules"], recurring_elements: ["amber utility light"], avoid: ["Earth skyline", "palm resort"] },
    locationId: "baths", locationName: "Foundry Baths", resolutionReason: "requested_setting_match", requestedSetting: "pool", providerRequestText: "send me a nude photo",
  });
  assert(instruction.includes("only in Eos Meridian") && instruction.includes("Exact setting: Foundry Baths") && instruction.includes("amber utility light") && instruction.includes("Earth skyline"), "containment must name the world, location, recurring visual cues and forbidden cues");
});

Deno.test("reference scope drops cross-world and wrong-location environment assets", () => {
  const rows = validateReferenceAssetWorldScope([
    { id: "identity", asset_role: "character_identity", character_version_id: "iris" },
    { id: "wrong-identity", asset_role: "character_identity", character_version_id: "other" },
    { id: "location", asset_role: "location_canonical", location_id: "baths" },
    { id: "wrong-location", asset_role: "location_canonical", location_id: "earth-pool" },
    { id: "world", asset_role: "world_canonical", world_id: "eos" },
    { id: "wrong-world", asset_role: "world_canonical", world_id: "juniper" },
  ], { worldId: "eos", locationId: "baths", characterVersionIds: ["iris"] });
  assert(rows.map((row) => row.id).join(",") === "identity,location,world", "only exact scoped references may survive");
});

Deno.test("single and provider-specific prompts retain the verified world lock", () => {
  const containment = {
    worldId: "eos", worldSlug: "eos-meridian", worldName: "Eos Meridian", worldDescription: "A colony on a tidally locked planet.",
    worldVisualContext: { setting: "pressure habitats in permanent twilight", architecture: ["worn alloy modules"], avoid: ["Earth resort pool"] },
    locationId: "baths", locationName: "Foundry Baths", resolutionReason: "requested_setting_match" as const, requestedSetting: "pool", providerRequestText: "send me a nude photo. Set the environment only at Foundry Baths, inside Eos Meridian.",
  };
  const request: CanonicalImageGenerationRequest = {
    mediaId: "iris-pool", companion: { templateId: "iris-template", versionId: "iris-version", name: "Iris Vale", age: 19 },
    visualIdentity: { canonicalDescription: "A fictional adult Eos resident.", age: 19, referenceStoragePaths: [] }, referenceImages: [],
    context: { location: { id: "baths", name: "Foundry Baths", description: "Stone geothermal pools inside the colony pressure habitat.", category: "spa" }, activity: "bathing", mood: "relaxed", timeOfDay: "evening", worldId: "eos", worldContainment: containment },
    composition: { shotType: "portrait", aspectRatio: "4:5" }, contentLevel: "standard", qualityTier: "standard", generationIntent: { requestText: "send me a portrait. Set the environment only at Foundry Baths, inside Eos Meridian.", requestedContentLevel: "standard" },
  };
  const general = buildImagePrompt(request), venice = buildVeniceImagePrompt({ ...request, mediaType: "image" });
  assert(general.includes("HARD WORLD LOCK") && general.includes("only in Eos Meridian") && general.includes("Foundry Baths"), "general prompt must contain verified world grounding");
  assert(venice.includes("WORLD/SETTING LOCK") && venice.includes("Eos Meridian") && venice.includes("Foundry Baths"), "short Venice prompt must preserve containment");
});

Deno.test("two-person WaveSpeed prompts include world containment before creative direction", () => {
  const identity = (id: string, name: string) => ({ characterInstanceId: id, companion: { templateId: `${id}-template`, versionId: `${id}-version`, name, age: 24 }, visualIdentity: { canonicalDescription: `${name} canonical adult identity`, age: 24, referenceStoragePaths: [] }, referenceImages: [] });
  const request: CanonicalImageGenerationRequest = {
    mediaId: "eos-group", companion: identity("iris", "Iris Vale").companion, visualIdentity: identity("iris", "Iris Vale").visualIdentity,
    subjects: [identity("iris", "Iris Vale"), identity("nova", "Nova Reyes")],
    referenceImages: [
      { role: "character_identity", characterInstanceId: "iris", signedUrl: "https://example.test/iris.jpg", contentType: "image/jpeg", name: "iris.jpg" },
      { role: "character_identity", characterInstanceId: "nova", signedUrl: "https://example.test/nova.jpg", contentType: "image/jpeg", name: "nova.jpg" },
    ],
    context: { activity: "relaxing", mood: "warm", worldId: "eos", worldContainment: { worldId: "eos", worldSlug: "eos-meridian", worldName: "Eos Meridian", worldDescription: "A colony world.", worldVisualContext: { avoid: ["Earth skyline"] }, locationId: "baths", locationName: "Foundry Baths", resolutionReason: "requested_setting_match", requestedSetting: "pool", providerRequestText: "one photo together" } },
    composition: { shotType: "portrait", aspectRatio: "4:5" }, contentLevel: "standard", qualityTier: "standard", generationIntent: { requestText: "one photo together", requestedContentLevel: "standard" },
  };
  const prompt = buildWaveSpeedGroupImagePrompt({ ...request, mediaType: "image" }, request.referenceImages);
  assert(prompt.includes("WORLD/SETTING LOCK") && prompt.includes("Eos Meridian") && prompt.includes("Foundry Baths") && prompt.indexOf("WORLD/SETTING LOCK") < prompt.indexOf("Approved request"), "group prompt must establish world before user direction");
});
