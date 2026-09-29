import {
  buildMediaWorldContainmentInstruction,
  resolveCanonicalMediaWorld,
  resolveRequestedMediaSetting,
  validateReferenceAssetWorldScope,
  type MediaSettingCandidate,
} from "./together-media-world.ts";
import { buildImagePrompt, type CanonicalImageGenerationRequest } from "./together-media-base.ts";
import { buildVeniceImagePrompt, buildWaveSpeedGroupImagePrompt } from "./together-media-providers.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRejects } from "jsr:@std/assert";
import { AppError } from "./types.ts";

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

type FixtureRow = Record<string, unknown>;

function personalPlaceFixture(withImage: boolean) {
  const place: FixtureRow = {
    id: "my-loft", owner_user_id: "owner", world_id: "eos", archived_at: null,
    name: "Copperlight Loft", slug: "personal-my-loft", category: "home", location_type: "residence",
    description: "A warm private loft with a green sofa and copper-horizon windows.",
    possible_activities: ["listening to music", "cooking"],
    metadata: { private: true, directoryVisibility: "private", userCreated: true, kind: "home" },
    canonical_visual_context: { canonicalPrompt: "Green sofa beside copper-horizon windows.", indoorOutdoor: "indoor" },
    custom_image_path: withImage ? "owner/places/my-loft/reference.jpg" : null,
    sort_order: 9999,
  };
  const locations: FixtureRow[] = candidates.map((candidate) => ({
    id: candidate.id, world_id: candidate.worldId, owner_user_id: null, archived_at: null,
    name: candidate.name, slug: candidate.slug, category: candidate.category,
    location_type: candidate.locationType, description: candidate.description,
    possible_activities: candidate.possibleActivities, metadata: { mediaAliases: candidate.mediaAliases },
    sort_order: candidate.sortOrder,
  }));
  locations.push(place,
    { ...place, id: "someone-elses-loft", name: "Cloudlight Loft", owner_user_id: "another-owner" },
    { ...place, id: "archived-loft", name: "Former Loft", archived_at: "2026-09-01T00:00:00Z" },
    { ...place, id: "other-world-loft", name: "Harbor Loft", world_id: "juniper" },
  );
  const tables: Record<string, FixtureRow[]> = {
    together_character_world_presence: [{ character_version_id: "sora", world_id: "eos", presence_type: "resident" }],
    together_worlds: [{ id: "eos", slug: "eos-meridian", name: "Eos Meridian", published: true }],
    together_locations: locations,
  };
  // Apply the real query's predicates to a mixed public/private fixture, so a
  // missing ownership, world, or archive restriction changes the test outcome.
  class Query {
    predicates: Array<(row: FixtureRow) => boolean> = [];
    columns: string[] = [];
    cap = Infinity;
    singleRow = false;
    constructor(readonly table: string) {}
    select(columns: string) { this.columns = columns.split(","); return this; }
    eq(key: string, value: unknown) { this.predicates.push((row) => row[key] === value); return this; }
    is(key: string, value: unknown) { this.predicates.push((row) => row[key] === value); return this; }
    in(key: string, values: unknown[]) { this.predicates.push((row) => values.includes(row[key])); return this; }
    limit(cap: number) { this.cap = cap; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    then(resolve: (value: { data: FixtureRow | FixtureRow[] | null; error: null }) => unknown) {
      const rows = (tables[this.table] ?? []).filter((row) => this.predicates.every((predicate) => predicate(row)))
        .slice(0, this.cap).map((row) => Object.fromEntries(this.columns.map((key) => [key, row[key]])));
      return Promise.resolve({ data: this.singleRow ? rows[0] ?? null : rows, error: null }).then(resolve);
    }
  }
  const db = { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
  return {
    place, locations,
    resolve: (options: Partial<Omit<Parameters<typeof resolveCanonicalMediaWorld>[0], "db">> = {}) =>
      resolveCanonicalMediaWorld({ db, userId: "owner", characterVersionIds: ["sora"], ...options }),
  };
}

for (const withImage of [false, true]) {
  const imageState = withImage ? "with an uploaded image" : "without an image";
  Deno.test(`an exact custom-place photo request resolves for its owner ${imageState}`, async () => {
    const { resolve, place } = personalPlaceFixture(withImage);
    const result = await resolve({ requestText: "Take a candid at Copperlight Loft", presenceLocationId: "observatory" });
    assert(result.locationId === place.id && result.locationName === place.name, "the owner's named place must override the current authored location");
    assert(result.resolutionReason === "requested_exact_location", "custom place names must resolve exactly");
    assert(result.providerRequestText === "Take a candid. Set the environment only at Copperlight Loft, inside Eos Meridian.", "the provider must retain the verified custom setting");
    const references = withImage ? [{ id: "custom-reference", asset_role: "location_canonical", location_id: place.id, storage_path: place.custom_image_path }] : [];
    const scopedReferences = validateReferenceAssetWorldScope(references, { worldId: result.worldId, locationId: result.locationId, characterVersionIds: ["sora"] });
    assert(scopedReferences.length === references.length, "an optional custom-place reference must stay valid for the resolved setting");
  });

  Deno.test(`a current custom place stays valid for a portrait ${imageState}`, async () => {
    const { resolve } = personalPlaceFixture(withImage);
    const result = await resolve({ requestText: "Send a portrait with your hair down", presenceLocationId: "my-loft" });
    assert(result.locationId === "my-loft" && result.resolutionReason === "current_presence", "current presence at an owned custom place must not fail world validation");
    assert(result.providerRequestText === "Send a portrait with your hair down", "a portrait request must retain its direction");
  });
}

Deno.test("an active custom place takes precedence while authored places remain available", async () => {
  const { resolve } = personalPlaceFixture(false);
  const active = await resolve({ authoritativeLocationId: "my-loft", presenceLocationId: "observatory", requestText: "Send a candid" });
  assert(active.locationId === "my-loft" && active.resolutionReason === "authoritative_location", "an active plan must retain its owned custom place");
  const authored = await resolve({ presenceLocationId: "my-loft", requestText: "Take a candid at Foundry Baths" });
  assert(authored.locationId === "baths" && authored.resolutionReason === "requested_exact_location", "authored locations must remain selectable alongside a current custom place");
});

Deno.test("custom places remain available when the authored-world location query reaches its limit", async () => {
  const { resolve, locations } = personalPlaceFixture(false);
  locations.unshift(...Array.from({ length: 250 }, (_, index) => ({
    id: `venue-${index}`, world_id: "eos", owner_user_id: null, archived_at: null,
    name: `World venue ${index}`, slug: `venue-${index}`, sort_order: index,
  })));
  const result = await resolve({ authoritativeLocationId: "my-loft" });
  assert(result.locationId === "my-loft", "owned places must not be crowded out by the authored world catalogue");
});

Deno.test("another owner's, archived, and other-world private places cannot become photo settings", async () => {
  const { resolve } = personalPlaceFixture(true);
  for (const locationId of ["someone-elses-loft", "archived-loft", "other-world-loft"]) {
    for (const source of ["authoritativeLocationId", "presenceLocationId"] as const) {
      const error = await assertRejects(() => resolve({ [source]: locationId }), AppError);
      assert(error.code === "MEDIA_WORLD_MISMATCH", "inaccessible locations must be rejected before provider submission");
    }
  }
  const result = await resolve({ requestText: "Take a candid at Cloudlight Loft", presenceLocationId: "observatory" });
  assert(result.locationId === "observatory" && result.resolutionReason === "current_presence", "another owner's private place must not enter name matching");
});

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
