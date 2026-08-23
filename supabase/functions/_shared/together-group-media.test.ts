import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildImagePrompt,
  type CanonicalImageGenerationRequest,
  selectMediaReferencesForSubjects,
} from "./together-media-base.ts";
import {
  configuredMediaRegistry,
  routeCanonicalMedia,
  WAVESPEED_GROUP_QWEN_ROUTE_ID,
  waveSpeedInput,
} from "./together-media-providers.ts";
import { AppError } from "./types.ts";
import type { MediaRouteCapability } from "../../../packages/together-domain/src/media-routing.ts";

function identity(name: string) {
  return {
    canonicalDescription: name === "Mara"
      ? "Mara is a fair-skinned blonde woman with gray eyes and angular features."
      : "Priya is a brown-skinned woman with black hair, brown eyes, and an oval face.",
    age: 28,
    referenceStoragePaths: [],
    hair: "dark hair",
    eyes: "brown",
    skinTone: "warm",
    build: "athletic",
    identifyingFeatures: [`${name} feature`],
    tattoos: [],
    piercings: [],
    fashionStyle: "modern",
    recurringAccessories: [],
    visualDoNotChange: [],
    photoStyle: {},
  };
}
function request(): CanonicalImageGenerationRequest {
  const maraRef = {
      role: "character_identity" as const,
      characterInstanceId: "mara",
      signedUrl: "https://signed.test/mara.jpg",
      contentType: "image/jpeg",
      name: "mara.jpg",
    },
    priyaRef = {
      role: "character_identity" as const,
      characterInstanceId: "priya",
      signedUrl: "https://signed.test/priya.jpg",
      contentType: "image/jpeg",
      name: "priya.jpg",
    };
  const subjects = [
    {
      characterInstanceId: "mara",
      companion: { templateId: "tm", versionId: "vm", name: "Mara", age: 29 },
      visualIdentity: identity("Mara"),
      referenceImages: [maraRef],
    },
    {
      characterInstanceId: "priya",
      companion: { templateId: "tp", versionId: "vp", name: "Priya", age: 31 },
      visualIdentity: identity("Priya"),
      referenceImages: [priyaRef],
    },
  ];
  return {
    mediaId: "group-media",
    companion: subjects[0]!.companion,
    visualIdentity: subjects[0]!.visualIdentity,
    subjects,
    referenceImages: [maraRef, priyaRef],
    context: { groupSceneMode: "staged_group_portrait", worldId: "juniper" },
    composition: {
      shotType: "selfie",
      aspectRatio: "4:5",
      framing: "balanced two-person selfie",
    },
    contentLevel: "standard",
    qualityTier: "standard",
    generationIntent: {
      requestText: "Mara and Priya, send a photo together.",
      requestedContentLevel: "standard",
    },
  };
}

Deno.test("group image prompt keeps two identities distinct and bounded", () => {
  const prompt = buildImagePrompt(request());
  assert(prompt.includes("SUBJECT 1: Mara"));
  assert(prompt.includes("SUBJECT 2: Priya"));
  assert(prompt.includes("Image 1 defines only Mara's exact stable identity"));
  assert(prompt.includes("Image 2 defines only Priya's exact stable identity"));
  assert(prompt.includes("Exactly two people"));
  assert(
    prompt.includes("does not establish either companion’s current location"),
  );
  assert(!prompt.includes("One person only"));
});

Deno.test("multireference provider input preserves both ordered identity references", () => {
  const route: MediaRouteCapability = {
    id: "wavespeed-kontext-pro-multiref",
    provider: "wavespeed",
    model: "test/multi",
    modelFamily: "flux",
    mediaTypes: ["image"],
    contentLevels: ["standard", "romance"],
    supportsCharacterReference: true,
    supportsLocationReference: true,
    maxReferenceImages: 5,
    supportsLoRA: false,
    loraModelFamilies: [],
    supportsImageEditing: true,
    supportsImageToVideo: false,
    qualityTiers: ["economy", "standard", "premium"],
    priority: 1,
    enabled: true,
    asynchronous: true,
  };
  const input = waveSpeedInput({ ...request(), mediaType: "image" }, route);
  assertEquals(input.images, [
    "https://signed.test/mara.jpg",
    "https://signed.test/priya.jpg",
  ]);
});

Deno.test("group reference selection keeps exactly one named identity per selected companion before supporting images", () => {
  const base = request(),
    mara = base.referenceImages[0]!,
    priya = base.referenceImages[1]!,
    unscopedMara = {
      ...mara,
      characterInstanceId: undefined,
      signedUrl: "https://signed.test/mara-unscoped.jpg",
    },
    duplicateMara = {
      ...mara,
      signedUrl: "https://signed.test/mara-duplicate.jpg",
    },
    location = {
      role: "location_environment" as const,
      signedUrl: "https://signed.test/place.jpg",
      contentType: "image/jpeg",
      name: "place.jpg",
    };
  const selected = selectMediaReferencesForSubjects({
    references: [unscopedMara, priya, duplicateMara, mara, location],
    subjectIds: ["mara", "priya"],
    limit: 3,
  });
  assertEquals(selected.map((reference) => reference.signedUrl), [
    "https://signed.test/mara-duplicate.jpg",
    "https://signed.test/priya.jpg",
    "https://signed.test/place.jpg",
  ]);
  assertEquals(selected.map((reference) => reference.characterInstanceId), [
    "mara",
    "priya",
    undefined,
  ]);
});

Deno.test("two-person edits preserve source and identity reference ordering", () => {
  const base = request(),
    source = {
      role: "previous_media" as const,
      signedUrl: "https://signed.test/source.webp",
      contentType: "image/webp",
      name: "source.webp",
    },
    route: MediaRouteCapability = {
      id: "wavespeed-kontext-pro-multiref",
      provider: "wavespeed",
      model: "test/multi",
      modelFamily: "flux",
      mediaTypes: ["image"],
      contentLevels: ["standard", "romance"],
      supportsCharacterReference: true,
      supportsLocationReference: true,
      maxReferenceImages: 5,
      supportsLoRA: false,
      loraModelFamilies: [],
      supportsImageEditing: true,
      supportsImageToVideo: false,
      qualityTiers: ["economy", "standard", "premium"],
      priority: 1,
      enabled: true,
      asynchronous: true,
    };
  const edit = {
    ...base,
    generationKind: "photo_edit" as const,
    sourceImage: source,
    referenceImages: [source, ...base.referenceImages],
    mediaType: "image" as const,
  };
  const prompt = buildImagePrompt(edit), input = waveSpeedInput(edit, route);
  assert(
    prompt.includes("Image 1 is the approved two-person source photograph"),
  );
  assert(prompt.includes("Image 2 defines only Mara's exact stable identity"));
  assert(prompt.includes("Image 3 defines only Priya's exact stable identity"));
  assertEquals(input.images, [
    "https://signed.test/source.webp",
    "https://signed.test/mara.jpg",
    "https://signed.test/priya.jpg",
  ]);
});

Deno.test("WaveSpeed Qwen group route sends bounded ordered references and disables its checker only after adult policy resolution", () => {
  const base = request(),
    route: MediaRouteCapability = {
      id: WAVESPEED_GROUP_QWEN_ROUTE_ID,
      provider: "wavespeed",
      model: "wavespeed-ai/qwen-image-2.0-pro/edit",
      modelFamily: "qwen-image",
      mediaTypes: ["image"],
      contentLevels: [
        "standard",
        "romance",
        "suggestive",
        "mature",
        "explicit",
      ],
      supportsCharacterReference: true,
      supportsLocationReference: true,
      maxReferenceImages: 3,
      supportsLoRA: false,
      loraModelFamilies: [],
      supportsImageEditing: true,
      supportsImageToVideo: false,
      qualityTiers: ["economy", "standard", "premium"],
      priority: 155,
      enabled: true,
      asynchronous: true,
    };
  const standard = waveSpeedInput({ ...base, mediaType: "image" }, route);
  assertEquals(standard.images, [
    "https://signed.test/mara.jpg",
    "https://signed.test/priya.jpg",
  ]);
  assertEquals(standard.enable_safety_checker, true);
  assert(!("size" in standard));
  assert(!("guidance_scale" in standard));
  const explicitRequest = {
      ...base,
      contentLevel: "explicit" as const,
      generationIntent: {
        requestText:
          "Mara and Priya are fully nude together in one private consensual adult photograph.",
        requestedContentLevel: "explicit" as const,
      },
    },
    explicit = waveSpeedInput(
      { ...explicitRequest, mediaType: "image" },
      route,
    ),
    prompt = String(explicit.prompt);
  assertEquals(explicit.enable_safety_checker, false);
  assert(prompt.length <= 800);
  assert(prompt.includes("Figure 1→LEFT Mara, adult 29"));
  assert(prompt.includes("Figure 2→RIGHT Priya, adult 31"));
  assert(prompt.includes("fair-skinned blonde woman with gray eyes"));
  assert(prompt.includes("brown-skinned woman with black hair"));
  assert(prompt.includes("Two visibly different people"));
  assert(prompt.includes("Preserve face, facial structure, complexion, hair, and heritage"));
  assert(prompt.includes("no copying, blending, swapping, averaging, duplication, or ethnic redesign"));
  assert(prompt.includes("Explicit fictional-adult imagery"));
  assert(prompt.includes("fully nude together"));
});

Deno.test("WaveSpeed Qwen group edit sends source then both named identity references", () => {
  const base = request(),
    source = {
      role: "previous_media" as const,
      signedUrl: "https://signed.test/source.webp",
      contentType: "image/webp",
      name: "source.webp",
    },
    route: MediaRouteCapability = {
      id: WAVESPEED_GROUP_QWEN_ROUTE_ID,
      provider: "wavespeed",
      model: "wavespeed-ai/qwen-image-2.0-pro/edit",
      modelFamily: "qwen-image",
      mediaTypes: ["image"],
      contentLevels: [
        "standard",
        "romance",
        "suggestive",
        "mature",
        "explicit",
      ],
      supportsCharacterReference: true,
      supportsLocationReference: true,
      maxReferenceImages: 3,
      supportsLoRA: false,
      loraModelFamilies: [],
      supportsImageEditing: true,
      supportsImageToVideo: false,
      qualityTiers: ["economy", "standard", "premium"],
      priority: 155,
      enabled: true,
      asynchronous: true,
    },
    edit = {
      ...base,
      generationKind: "photo_edit" as const,
      sourceImage: source,
      referenceImages: [source, ...base.referenceImages],
      mediaType: "image" as const,
      generationIntent: {
        requestText: "Keep both people and make the lighting warmer.",
        requestedContentLevel: "standard" as const,
      },
    },
    input = waveSpeedInput(edit, route),
    prompt = String(input.prompt);
  assertEquals(input.images, [
    "https://signed.test/source.webp",
    "https://signed.test/mara.jpg",
    "https://signed.test/priya.jpg",
  ]);
  assert(prompt.includes("Figure 1=approved two-person source"));
  assert(prompt.includes("Figure 2→LEFT Mara"));
  assert(prompt.includes("Figure 3→RIGHT Priya"));
});

Deno.test("adult group route fails closed without normalized approved intent", () => {
  const route: MediaRouteCapability = {
    id: WAVESPEED_GROUP_QWEN_ROUTE_ID,
    provider: "wavespeed",
    model: "wavespeed-ai/qwen-image-2.0-pro/edit",
    modelFamily: "qwen-image",
    mediaTypes: ["image"],
    contentLevels: ["explicit"],
    supportsCharacterReference: true,
    supportsLocationReference: true,
    maxReferenceImages: 3,
    supportsLoRA: false,
    loraModelFamilies: [],
    supportsImageEditing: true,
    supportsImageToVideo: false,
    qualityTiers: ["standard"],
    priority: 155,
    enabled: true,
    asynchronous: true,
  };
  const { generationIntent: _ignored, ...withoutIntent } = request(),
    error = assertThrows(
      () =>
        waveSpeedInput({
          ...withoutIntent,
          contentLevel: "explicit",
          mediaType: "image",
        }, route),
      AppError,
    );
  assertEquals(error.code, "PROVIDER_REQUEST_INVALID");
});

Deno.test("validated Qwen route is group-only and does not replace direct-chat media routing", () => {
  const names = [
      "WAVESPEED_API_KEY",
      "KIVELLE_WAVESPEED_ENABLED",
      "KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED",
      "KIVELLE_WAVESPEED_GROUP_ADULT_ROUTE_VALIDATED",
      "KIVELLE_ADULT_MEDIA_ENABLED",
      "KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED",
      "KIVELLE_VENICE_ENABLED",
      "KIVELLE_IMAGE_PROVIDER",
    ],
    previous = Object.fromEntries(
      names.map((name) => [name, Deno.env.get(name)]),
    );
  try {
    Deno.env.set("WAVESPEED_API_KEY", "test-key");
    Deno.env.set("KIVELLE_WAVESPEED_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_GROUP_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_ADULT_MEDIA_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED", "false");
    Deno.env.set("KIVELLE_VENICE_ENABLED", "false");
    Deno.env.set("KIVELLE_IMAGE_PROVIDER", "wavespeed");
    const capability = configuredMediaRegistry().find((entry) =>
      entry.id === WAVESPEED_GROUP_QWEN_ROUTE_ID
    );
    assert(capability?.contentLevels.includes("explicit"));
    const explicit = {
        ...request(),
        contentLevel: "explicit" as const,
        generationIntent: {
          requestText: "A consensual nude photo of Mara and Priya together.",
          requestedContentLevel: "explicit" as const,
        },
      },
      group = routeCanonicalMedia({ ...explicit, mediaType: "image" }, {
        source: "user_request",
        userTier: "free",
      });
    assertEquals(group.route.capability.id, WAVESPEED_GROUP_QWEN_ROUTE_ID);
    const base = request(),
      direct: CanonicalImageGenerationRequest = {
        ...base,
        subjects: undefined,
        referenceImages: [base.referenceImages[0]!],
      },
      directRoute = routeCanonicalMedia({ ...direct, mediaType: "image" }, {
        source: "user_request",
        userTier: "free",
      });
    assert(directRoute.route.capability.id !== WAVESPEED_GROUP_QWEN_ROUTE_ID);
  } finally {
    for (const name of names) restoreEnv(name, previous[name]);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) Deno.env.delete(name);
  else Deno.env.set(name, value);
}
