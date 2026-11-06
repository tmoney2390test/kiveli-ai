import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildImagePrompt,
  type CanonicalImageGenerationRequest,
} from "./together-media-base.ts";
import { type PlaceContext, placeContextSnapshot } from "./together-place.ts";
const home: PlaceContext = {
  contextVersion: 1,
  world: {
    id: "eos",
    slug: "eos-meridian",
    name: "Eos Meridian",
    description: "A pressurized colony.",
    timezone: "UTC",
    accessType: "free",
    visualContext: { setting: "Space colony" },
  },
  location: {
    id: "character-home:nia",
    slug: "nias-flat",
    name: "Nia’s flat",
    type: "residence",
    category: "home",
    description: "Patched cushions and a fold-down table.",
    hours: null,
    possibleActivities: ["Have coffee"],
    visualContext: {
      indoorOutdoor: "indoor",
      canonicalPrompt:
        "Small pressurized apartment, patched seat cushions, model rover on a shelf.",
    },
    lore: { summary: "A private home." },
    homeArtwork: {
      homeId: "home",
      artworkId: "approved-v1",
      bucket: "kivelli-home-artwork",
      path: "home/approved-v1.jpg",
    },
  },
  ancestry: [],
  adjacentDistricts: [],
  nearby: [],
  path: "Eos Meridian → Nia’s flat",
  clock: {
    timezone: "America/New_York",
    localIso: "2026-11-05T21:00",
    weekday: "Thursday",
    localTime: "21:00",
    daypart: "late_night",
  },
};
const request: CanonicalImageGenerationRequest = {
  mediaId: "media",
  companion: { templateId: "nia", versionId: "version", name: "Nia", age: 30 },
  visualIdentity: {
    canonicalDescription: "An adult mechanic with short black hair.",
    age: 30,
    referenceStoragePaths: [],
  },
  referenceImages: [],
  context: {
    place: home,
    activity: "Painting a model shuttle",
    timeOfDay: "night",
  },
  composition: { shotType: "candid", aspectRatio: "4:5" },
  contentLevel: "standard",
  qualityTier: "standard",
};
Deno.test("home catalog artwork does not accidentally generate the companion", () => {
  const prompt = buildImagePrompt({
    ...request,
    generationKind: "home_environment",
    generationIntent: {
      requestText: "A small apartment with a model rover on a shelf.",
      requestedContentLevel: "standard",
    },
  });
  assertStringIncludes(prompt, "model rover");
  assertStringIncludes(prompt, "No people");
  assert(!prompt.includes("short black hair"));
});
Deno.test("home photo requests retain character identity and exact indoor surroundings", () => {
  const prompt = buildImagePrompt(request);
  assertStringIncludes(prompt, "short black hair");
  assertStringIncludes(prompt, "patched seat cushions");
  assertStringIncludes(prompt, "model rover");
  assertStringIncludes(prompt, "2026-11-05 21:00 America/New_York");
});
Deno.test("media snapshots pin the approved home artwork rather than a mutable current image", () => {
  const saved = placeContextSnapshot(home);
  assertEquals(saved.homeArtwork, {
    homeId: "home",
    artworkId: "approved-v1",
    bucket: "kivelli-home-artwork",
    path: "home/approved-v1.jpg",
  });
  assertEquals(saved.locationId, "character-home:nia");
});
