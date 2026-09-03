import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import { estimatedMediaProviderCost } from "../../../packages/together-domain/src/media-economics.ts";
import type { CanonicalImageGenerationRequest, MediaReferenceImage } from "./together-media-base.ts";
import {
  buildWaveSpeedAdultImagePrompt,
  buildWaveSpeedAdultScenePrompt,
  configuredMediaRegistry,
  providerAttemptsFromError,
  routeCanonicalMedia,
  WaveSpeedMediaProvider,
  WAVESPEED_ADULT_COMPOSED_ROUTE_ID,
  WAVESPEED_ADULT_QWEN_ROUTE_ID,
  waveSpeedAdultFaceSwapInput,
  waveSpeedAdultSceneInput,
  waveSpeedInput,
} from "./together-media-providers.ts";
import type { WaveSpeedClient } from "./wavespeed.ts";
import { AppError } from "./types.ts";

const MANAGED_ENV = [
  "WAVESPEED_API_KEY",
  "WAVESPEED_MODEL_ADULT_EDIT",
  "WAVESPEED_MODEL_ADULT_SCENE",
  "WAVESPEED_MODEL_ADULT_IDENTITY",
  "KIVELLE_WAVESPEED_ENABLED",
  "KIVELLE_WAVESPEED_ADULT_IMAGES_ENABLED",
  "KIVELLE_WAVESPEED_ADULT_COMPOSED_PIPELINE_ENABLED",
  "KIVELLE_WAVESPEED_ADULT_IMAGE_CANARY_PERCENT",
  "KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED",
  "KIVELLE_ADULT_MEDIA_ENABLED",
  "VENICE_API_KEY",
  "KIVELLE_VENICE_ENABLED",
  "KIVELLE_VENICE_ADULT_ROUTE_VALIDATED",
  "KIVELLE_IMAGE_PROVIDER",
] as const;

function withProviderEnv(run: () => void) {
  const previous = Object.fromEntries(MANAGED_ENV.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set("WAVESPEED_API_KEY", "test-key");
    Deno.env.set("KIVELLE_WAVESPEED_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_IMAGES_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_COMPOSED_PIPELINE_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_IMAGE_CANARY_PERCENT", "100");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_ADULT_MEDIA_ENABLED", "true");
    Deno.env.set("VENICE_API_KEY", "test-key");
    Deno.env.set("KIVELLE_VENICE_ENABLED", "true");
    Deno.env.set("KIVELLE_VENICE_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_IMAGE_PROVIDER", "venice");
    run();
  } finally {
    for (const name of MANAGED_ENV) {
      const value = previous[name];
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

async function withProviderEnvAsync(run: () => Promise<void>) {
  const previous = Object.fromEntries(MANAGED_ENV.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set("WAVESPEED_API_KEY", "test-key");
    Deno.env.set("KIVELLE_WAVESPEED_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_IMAGES_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_COMPOSED_PIPELINE_ENABLED", "true");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_IMAGE_CANARY_PERCENT", "100");
    Deno.env.set("KIVELLE_WAVESPEED_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_ADULT_MEDIA_ENABLED", "true");
    Deno.env.set("VENICE_API_KEY", "test-key");
    Deno.env.set("KIVELLE_VENICE_ENABLED", "true");
    Deno.env.set("KIVELLE_VENICE_ADULT_ROUTE_VALIDATED", "true");
    Deno.env.set("KIVELLE_IMAGE_PROVIDER", "venice");
    await run();
  } finally {
    for (const name of MANAGED_ENV) {
      const value = previous[name];
      if (value == null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

function reference(role: MediaReferenceImage["role"], name: string): MediaReferenceImage {
  return {
    role,
    characterInstanceId: role === "character_identity" ? "elena" : undefined,
    signedUrl: `https://signed.test/${name}.webp`,
    contentType: "image/webp",
    name: `${name}.webp`,
  };
}

function request(contentLevel: CanonicalImageGenerationRequest["contentLevel"] = "explicit"): CanonicalImageGenerationRequest {
  return {
    mediaId: "adult-wave-image-1",
    adultPipelineAuthorized: contentLevel !== "standard",
    generationKind: "companion_photo",
    companion: { templateId: "elena-template", versionId: "elena-v1", name: "Elena", age: 29 },
    visualIdentity: {
      canonicalDescription: "Elena has warm olive skin, dark wavy hair, brown eyes, and distinct angular features.",
      age: 29,
      referenceStoragePaths: [],
      hair: "dark wavy hair",
      eyes: "brown",
      skinTone: "warm olive",
      build: "athletic",
      identifyingFeatures: ["angular features"],
      tattoos: [],
      piercings: [],
      fashionStyle: "modern",
      recurringAccessories: [],
      visualDoNotChange: [],
      photoStyle: {},
    },
    referenceImages: [reference("character_identity", "elena"), reference("location_environment", "suite")],
    context: {
      location: { id: "suite", name: "Private suite", description: "a warm private suite" },
      activity: "relaxing privately",
      worldId: "northvale",
    },
    composition: { shotType: "full_body", aspectRatio: "4:5", framing: "natural full-body composition" },
    contentLevel,
    qualityTier: "standard",
    generationIntent: contentLevel === "standard" ? undefined : {
      requestText: "A tasteful fully nude private photo with natural realistic anatomy.",
      requestedContentLevel: contentLevel,
    },
  };
}

Deno.test("adult WaveSpeed registry uses a reference-capable Qwen route with auditable cost", () => withProviderEnv(() => {
  const route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_ADULT_QWEN_ROUTE_ID);
  assert(route?.enabled);
  assertEquals(route.model, "wavespeed-ai/qwen-image-2.0-pro/edit");
  assert(route.supportsCharacterReference);
  assert(route.supportsLocationReference);
  assertEquals(route.maxReferenceImages, 3);
  assertEquals(route.contentLevels, ["suggestive", "mature", "explicit"]);
  assertEquals(estimatedMediaProviderCost(WAVESPEED_ADULT_QWEN_ROUTE_ID), 0.07);
}));

Deno.test("adult composed registry uses Wan Realism scene generation plus fictional identity", () => withProviderEnv(() => {
  const route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_ADULT_COMPOSED_ROUTE_ID);
  assert(route?.enabled);
  assertEquals(route.model, "wavespeed-ai/wan-2.2/text-to-image-realism");
  assertEquals(route.modelFamily, "photoreal-face-swap");
  assert(route.supportsCharacterReference);
  assert(!route.supportsLocationReference);
  assertEquals(route.maxReferenceImages,1);
  assert(!route.supportsImageEditing);
  assertEquals(route.estimatedCost, .035);
  assert(route.asynchronous);
}));

Deno.test("adult WaveSpeed rollout overrides Venice only for adult images", () => withProviderEnv(() => {
  const adult = routeCanonicalMedia({ ...request(), mediaType: "image" }, { source: "user_request", userTier: "kivelle_max" });
  assertEquals(adult.route.capability.id, WAVESPEED_ADULT_COMPOSED_ROUTE_ID);
  assertEquals(adult.provider.id, "wavespeed");

  const standard = routeCanonicalMedia({ ...request("standard"), mediaType: "image" }, { source: "user_request", userTier: "kivelle_max" });
  assertEquals(standard.provider.id, "venice");
  assert(standard.route.capability.id.startsWith("venice-"));
}));

Deno.test("disabling the composed pipeline leaves Qwen available for adult edits", () => withProviderEnv(() => {
  Deno.env.set("KIVELLE_WAVESPEED_ADULT_COMPOSED_PIPELINE_ENABLED", "false");
  const routed = routeCanonicalMedia({ ...request(), mediaType: "image" }, { source: "user_request", userTier: "kivelle_max" });
  assertEquals(routed.route.capability.id, WAVESPEED_ADULT_QWEN_ROUTE_ID);
}));

Deno.test("source edits and intentionally hidden faces stay on the identity-preserving Qwen route",()=>withProviderEnv(()=>{
  const source=reference("previous_media","approved-source"),edited=routeCanonicalMedia({...request(),mediaType:"image",generationKind:"photo_edit",sourceImage:source,referenceImages:[source,...request().referenceImages]},{source:"user_edit",userTier:"kivelle_max"});
  assertEquals(edited.route.capability.id,WAVESPEED_ADULT_QWEN_ROUTE_ID);
  const hidden=routeCanonicalMedia({...request(),mediaType:"image",generationIntent:{requestText:"Send a nude photo face down in the pillows",requestedContentLevel:"explicit"}},{source:"user_request",userTier:"kivelle_max"});
  assertEquals(hidden.route.capability.id,WAVESPEED_ADULT_QWEN_ROUTE_ID);
}));

Deno.test("adult WaveSpeed canary at zero keeps the existing Venice route", () => withProviderEnv(() => {
  Deno.env.set("KIVELLE_WAVESPEED_ADULT_IMAGE_CANARY_PERCENT", "0");
  const routed = routeCanonicalMedia({ ...request(), mediaType: "image" }, { source: "user_request", userTier: "kivelle_max" });
  assertEquals(routed.route.capability.id, "venice-adult-two-stage");
}));

Deno.test("adult WaveSpeed payload keeps identity first and uses the exact Qwen edit schema", () => withProviderEnv(() => {
  const canonical = request(), route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_ADULT_QWEN_ROUTE_ID)!;
  const input = waveSpeedInput({ ...canonical, mediaType: "image" }, route), prompt = String(input.prompt);
  assertEquals(input.images, ["https://signed.test/elena.webp", "https://signed.test/suite.webp"]);
  assertEquals(input.seed, -1);
  assertEquals(input.enable_safety_checker, false);
  assert(!("image" in input));
  assert(!("size" in input));
  assert(!("num_images" in input));
  assert(prompt.length <= 800);
  assert(prompt.includes("Image 1 supplies identity only"));
  assert(prompt.includes("fictional consenting adult age 29"));
  assert(prompt.includes("MANDATORY TARGET"));
  assert(prompt.includes("complete coherent adult anatomy"));
  assert(prompt.includes("no doll, mannequin, plastic"));
}));

Deno.test("adult WaveSpeed prompt makes requested pose and anatomy outrank the identity portrait composition", () => withProviderEnv(() => {
  const canonical={...request(),generationIntent:{requestText:"Send me a photo of you bent over with your ass and pussy showing",requestedContentLevel:"explicit" as const}},route=configuredMediaRegistry().find((item)=>item.id===WAVESPEED_ADULT_QWEN_ROUTE_ID)!;
  const input=waveSpeedInput({...canonical,mediaType:"image"},route),prompt=String(input.prompt);
  assert(prompt.length<=800);
  assert(prompt.includes("Replace its pose, clothes/robe, crop, background, and camera; do not make a small edit"));
  assert(prompt.includes("bend forward at waist"));
  assert(prompt.includes("camera behind at a rear or rear-three-quarter angle"));
  assert(prompt.includes("external vulva and labia plus buttocks and rear anatomy"));
  assert(prompt.includes("no robe, underwear, fabric"));
  assert(prompt.indexOf("MANDATORY TARGET")<prompt.indexOf("IDENTITY:"));
}));

Deno.test("Wan Realism scene payload creates a fresh photographic composition without leaking private references", () => withProviderEnv(() => {
  const canonical={...request(),generationIntent:{requestText:"Send me a photo of you bent over with your ass and pussy showing",requestedContentLevel:"explicit" as const},mediaType:"image" as const};
  const input=waveSpeedAdultSceneInput(canonical),prompt=buildWaveSpeedAdultScenePrompt(canonical);
  assertEquals(input.size,"1024*1280");
  assertEquals(input.output_format,"jpeg");
  assertEquals(input.seed,-1);
  assert(!("images" in input));
  assert(!prompt.includes("signed.test"));
  assertStringIncludes(prompt,"RAW documentary photograph captured with a full-frame professional camera");
  assertStringIncludes(prompt,"camera behind at a rear or rear-three-quarter angle");
  assertStringIncludes(prompt,"face clearly visible in a natural over-the-shoulder glance");
  assertStringIncludes(prompt,"external vulva and labia plus buttocks and rear anatomy");
  assertStringIncludes(prompt,"biologically plausible and correctly placed and integrated with the pelvis");
  assertStringIncludes(prompt,"Exactly one adult subject and no other person");
  assertStringIncludes(prompt,"No beauty-filter smoothing, airbrushing, anime, cartoon, painting, illustration, 2D or 3D render, CGI");
}));

Deno.test("face-swap payload uses only the generated scene and approved fictional identity",()=>{
  assertEquals(waveSpeedAdultFaceSwapInput("https://provider.test/scene.jpg","https://signed.test/sana.webp"),{
    image:"https://provider.test/scene.jpg",
    face_image:"https://signed.test/sana.webp",
    target_index:0,
    target_gender:"all",
    output_format:"jpeg",
  });
  assertThrows(()=>waveSpeedAdultFaceSwapInput("http://provider.test/scene.jpg","https://signed.test/sana.webp"),AppError);
});

Deno.test("composed provider runs Wan Realism then the identity face swap and records both stages",()=>withProviderEnvAsync(async()=>{
  const calls:Array<{model:string;input:Record<string,unknown>}>=[];
  const fakeClient={runToCompletion:async(model:string,input:Record<string,unknown>)=>{
    calls.push({model,input});
    const first=calls.length===1,id=first?"scene-task":"identity-task",output=first?"https://provider.test/scene.jpg":"https://provider.test/final.jpg";
    return{prediction:{id,model,status:"completed" as const,outputs:[output],inferenceMs:first?1200:400},providerRequestId:id,model,timedOut:false};
  }} as unknown as WaveSpeedClient;
  const canonical={...request(),generationIntent:{requestText:"Send me a photo of you bent over with your ass and pussy showing",requestedContentLevel:"explicit" as const},mediaType:"image" as const},route=configuredMediaRegistry().find((item)=>item.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID)!;
  const submission=await new WaveSpeedMediaProvider(fakeClient).submit(canonical,route);
  assertEquals(calls.map((item)=>item.model),["wavespeed-ai/wan-2.2/text-to-image-realism","wavespeed-ai/image-face-swap"]);
  assertEquals(calls[1]?.input,waveSpeedAdultFaceSwapInput("https://provider.test/scene.jpg","https://signed.test/elena.webp"));
  assertEquals(submission.status,"submitted");
  assertEquals(submission.providerRequestId,"identity-task");
  assertEquals(submission.result?.providerAttempts?.map((item)=>item.stage),["adult_photoreal_scene_generation","fictional_identity_face_swap"]);
  assertEquals(submission.result?.estimatedCost,.035);
}));

Deno.test("composed provider stops before identity processing when scene generation fails",()=>withProviderEnvAsync(async()=>{
  let calls=0;
  const fakeClient={runToCompletion:async(model:string)=>{calls+=1;return{prediction:{id:"failed-scene",model,status:"failed" as const,outputs:[]},providerRequestId:"failed-scene",model,timedOut:false};}} as unknown as WaveSpeedClient;
  const canonical={...request(),mediaType:"image" as const},route=configuredMediaRegistry().find((item)=>item.id===WAVESPEED_ADULT_COMPOSED_ROUTE_ID)!;
  let caught:unknown;
  try{await new WaveSpeedMediaProvider(fakeClient).submit(canonical,route);}catch(error){caught=error;}
  assert(caught instanceof AppError);
  assertEquals(calls,1);
  assertEquals(providerAttemptsFromError(caught).map((attempt)=>({stage:attempt.stage,success:attempt.success})),[{stage:"adult_photoreal_scene_generation",success:false}]);
}));

Deno.test("adult WaveSpeed edits send the owned source before identity and setting references", () => withProviderEnv(() => {
  const source = reference("previous_media", "approved-source"), canonical = {
    ...request(),
    generationKind: "photo_edit" as const,
    sourceImage: source,
    referenceImages: [...request().referenceImages],
  }, route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_ADULT_QWEN_ROUTE_ID)!;
  const input = waveSpeedInput({ ...canonical, mediaType: "image" }, route), prompt = String(input.prompt);
  assertEquals(input.images, [
    "https://signed.test/approved-source.webp",
    "https://signed.test/elena.webp",
    "https://signed.test/suite.webp",
  ]);
  assert(prompt.includes("IDENTITY: Image 2 = Elena"));
  assert(prompt.includes("Edit the approved source photo"));
}));

Deno.test("adult WaveSpeed payload fails closed without server adult authorization", () => withProviderEnv(() => {
  const canonical = { ...request(), adultPipelineAuthorized: false }, route = configuredMediaRegistry().find((item) => item.id === WAVESPEED_ADULT_QWEN_ROUTE_ID)!;
  const error = assertThrows(() => waveSpeedInput({ ...canonical, mediaType: "image" }, route), AppError);
  assertEquals(error.code, "PROVIDER_REQUEST_INVALID");
  assertEquals(error.status, 403);
  assertThrows(() => buildWaveSpeedAdultImagePrompt({ ...canonical, mediaType: "image" }, canonical.referenceImages), AppError);
}));
