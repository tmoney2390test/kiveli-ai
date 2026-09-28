import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildImagePrompt,
  type CanonicalImageGenerationRequest,
  selectMediaReferencesForSubjects,
} from "./together-media-base.ts";
import {
  adultGroupEditPrompt,
  buildWaveSpeedGroupImagePrompt,
  configuredGroupImageRouteAvailable,
  configuredMediaRegistry,
  routeCanonicalMedia,
  VENICE_GROUP_ADULT_ROUTE_ID,
  VeniceMediaProvider,
  WAVESPEED_GROUP_QWEN_ROUTE_ID,
  waveSpeedInput,
} from "./together-media-providers.ts";
import type { VeniceImageClient } from "./venice.ts";
import type { WaveSpeedClient } from "./wavespeed.ts";
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
  assert(prompt.includes("Treat selfie as viewpoint and framing only"));
  assert(prompt.includes("no visible phone"));
});

Deno.test("group image prompt permits a visible phone only when explicitly requested", () => {
  const input = request();
  input.generationIntent = {
    requestText: "Take a group selfie holding the phone visibly in the mirror.",
    requestedContentLevel: "standard",
  };
  const prompt = buildImagePrompt(input);
  assert(prompt.includes("explicitly asks for a visible phone or camera"));
  assert(!prompt.includes("Treat selfie as viewpoint and framing only"));
});

Deno.test("group edit prompt puts the custom adult request ahead of identity context", () => {
  const input = request();
  input.contentLevel = "explicit";
  input.generationIntent = {
    requestText: "Mara and Priya, send me a photo showing exactly this: Nude kissing",
    requestedContentLevel: "explicit",
  };
  const canonical = { ...input, mediaType: "image" as const, adultPipelineAuthorized: true };
  const prompt = buildWaveSpeedGroupImagePrompt(canonical);
  assert(prompt.includes("Approved request: Nude kissing"));
  assert(prompt.includes("Explicit fictional-adult imagery is approved"));
  assert(prompt.indexOf("Approved request") < prompt.indexOf("IDENTITY LOCK"));
  assert(prompt.includes("Figure 1→LEFT Mara") && prompt.includes("Figure 2→RIGHT Priya"));
  assert(prompt.length <= 800);
  const route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_GROUP_QWEN_ROUTE_ID);
  assert(route);
  const error = assertThrows(() => waveSpeedInput(canonical, route), AppError);
  assertEquals(error.code, "PROVIDER_UNAVAILABLE");
});

Deno.test("a long custom group direction survives the provider prompt limit", () => {
  const input = request();
  input.contentLevel = "explicit";
  input.context.worldContainment = {
    worldId: "eos", worldSlug: "eos-meridian", worldName: "Eos Meridian",
    worldDescription: "A colony world.", worldVisualContext: { avoid: ["Earth skyline"] },
    locationId: "baths", locationName: "Foundry Baths",
    resolutionReason: "requested_setting_match", requestedSetting: "pool",
    providerRequestText: "one photo together",
  };
  const direction = `Nude kissing while ${"standing close together and looking into each other's eyes, ".repeat(4)}hands touching`;
  input.generationIntent = {
    requestText: `Mara and Priya, send me a photo showing exactly this: ${direction}`,
    requestedContentLevel: "explicit",
  };
  const prompt = buildWaveSpeedGroupImagePrompt({ ...input, mediaType: "image", adultPipelineAuthorized: true });
  assert(prompt.includes(direction));
  assert(prompt.includes("Explicit fictional-adult imagery is approved"));
  assert(prompt.length <= 800);
});

Deno.test("adult group prompt keeps the exact custom direction ahead of the base-photo constraints", () => {
  const input = request();
  input.contentLevel = "explicit";
  input.generationIntent = {
    requestText: "Mara and Priya, send me a photo showing exactly this: Nude kissing",
    requestedContentLevel: "explicit",
  };
  const prompt = adultGroupEditPrompt({ ...input, mediaType: "image", adultPipelineAuthorized: true });
  assert(prompt.includes("Approved user request: Nude kissing"));
  assert(prompt.indexOf("Approved user request") < prompt.indexOf("Keep both original people"));
  assert(prompt.includes("base photo clothing is not a restriction"));
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

Deno.test("WaveSpeed Qwen group route sends bounded ordered references and refuses adult input", () => {
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
    error = assertThrows(
      () => waveSpeedInput({ ...explicitRequest, mediaType: "image" }, route),
      AppError,
    );
  assertEquals(error.code, "PROVIDER_UNAVAILABLE");
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
  assertEquals(error.code, "PROVIDER_UNAVAILABLE");
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
    assert(capability?.contentLevels.includes("standard"));
    assert(!capability?.contentLevels.includes("explicit"));
    const explicit = {
        ...request(),
        contentLevel: "explicit" as const,
        generationIntent: {
          requestText: "A consensual nude photo of Mara and Priya together.",
          requestedContentLevel: "explicit" as const,
        },
        adultPipelineAuthorized:true,
      },
      error = assertThrows(() => routeCanonicalMedia({ ...explicit, mediaType: "image" }, {
        source: "user_request",
        userTier: "free",
      }), AppError);
    assertEquals(error.code, "PROVIDER_UNAVAILABLE");
    const group = routeCanonicalMedia({ ...request(), mediaType: "image" }, {
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

Deno.test("adult group photos make a clothed identity base before the adult edit", async () => {
  const names = ["WAVESPEED_API_KEY", "KIVELLE_WAVESPEED_ENABLED", "KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED", "VENICE_API_KEY", "KIVELLE_VENICE_ENABLED", "KIVELLE_ADULT_MEDIA_ENABLED", "KIVELLE_VENICE_ADULT_ROUTE_VALIDATED", "KIVELLE_IMAGE_PROVIDER"];
  const previous = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set("WAVESPEED_API_KEY", "test-key");
    Deno.env.set("KIVELLE_WAVESPEED_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_GROUP_IMAGES_ENABLED", "true");
    Deno.env.set("VENICE_API_KEY", "test-key");
    Deno.env.set("KIVELLE_VENICE_ENABLED", "true");
    Deno.env.set("KIVELLE_ADULT_MEDIA_ENABLED", "true");
    Deno.env.set("KIVELLE_VENICE_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_IMAGE_PROVIDER", "wavespeed");
    assert(configuredGroupImageRouteAvailable("explicit"));
    const input = request();
    input.contentLevel = "explicit";
    input.generationIntent = { requestText: "Mara and Priya, send me a photo showing exactly this: Nude kissing", requestedContentLevel: "explicit" };
    const canonical = { ...input, mediaType: "image" as const, adultPipelineAuthorized: true };
    const routed = routeCanonicalMedia(canonical, { source: "user_request", userTier: "free" });
    assertEquals(routed.route.capability.id, VENICE_GROUP_ADULT_ROUTE_ID);
    const waveInputs: Record<string, unknown>[] = [], veniceInputs: Array<{ prompt: string; images: string[]; safeMode: boolean }> = [];
    const wave = { runToCompletion: async (_model: string, body: Record<string, unknown>) => {
      waveInputs.push(body);
      return { providerRequestId: "base-prediction", timedOut: false, prediction: { id: "base-prediction", model: "wavespeed-ai/qwen-image-2.0-pro/edit", status: "completed", outputs: ["https://images.test/clothed-base.webp"], inferenceMs: 400 } };
    } } as unknown as WaveSpeedClient;
    const venice = { edit: async (body: { prompt: string; images: string[]; safeMode: boolean }) => {
      veniceInputs.push(body);
      return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", providerRequestId: "adult-edit", model: "qwen-edit-uncensored", estimatedCost: .04, generationMs: 300, safety: { blurred: false, contentViolation: false, adultModelContentViolation: false } };
    } } as unknown as VeniceImageClient;
    const result = await new VeniceMediaProvider(venice, wave).submit(canonical, routed.route.capability);
    assertEquals(waveInputs.length, 1);
    assertEquals(waveInputs[0]?.enable_safety_checker, true);
    assert(!String(waveInputs[0]?.prompt).includes("Nude"));
    assertEquals(veniceInputs[0]?.images, ["https://images.test/clothed-base.webp"]);
    assertEquals(veniceInputs[0]?.safeMode, false);
    assertEquals(routed.route.capability.model, "qwen-edit-uncensored");
    assert(veniceInputs[0]?.prompt.includes("Nude kissing"));
    assertEquals(result.result?.providerMetadata?.pipeline, "clothed_group_identity_base_then_adult_edit");
    assertEquals(result.result?.providerAttempts?.length, 2);
    const source = { role: "previous_media" as const, signedUrl: "https://images.test/approved-group-photo.webp", contentType: "image/webp", name: "approved-group-photo.webp" };
    const edited = await new VeniceMediaProvider(venice, wave).submit({ ...canonical, generationKind: "photo_edit", sourceImage: source, referenceImages: [source, ...canonical.referenceImages] }, routed.route.capability);
    assertEquals(waveInputs.length, 1);
    assertEquals(veniceInputs[1]?.images, [source.signedUrl]);
    assertEquals(edited.result?.providerMetadata?.pipeline, "adult_group_source_edit");
  } finally {
    for (const name of names) restoreEnv(name, previous[name]);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) Deno.env.delete(name);
  else Deno.env.set(name, value);
}
