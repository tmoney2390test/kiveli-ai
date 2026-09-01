import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./context.ts";
import { AppError } from "./types.ts";
import { track } from "./together.ts";
import {
  type PlaceContext,
  placeContextSnapshot,
  resolveCharacterPlaceContext,
  resolvePlaceContext,
} from "./together-place.ts";
import {
  resolveCharacterMediaBoundaries,
  resolveMediaContentPolicy,
} from "../../../packages/together-domain/src/media-routing.ts";
import {
  CHARACTER_PHOTO_REALISM_GUIDANCE,
  classifyPhotoIntent,
  extractPhotoWardrobeDescription,
  hasUsableCharacterIdentityReference,
  type MediaPresenceState,
  photoRequestAllowsHiddenFace,
  photoRequestWantsVisibleCaptureDevice,
  resolveCanonicalMediaPresence,
  resolveMediaSceneBoundary,
  resolvePhotoComposition,
  resolvePhotoDirection,
  resolveProductionSafePhotoRequest,
} from "../../../packages/together-domain/src/media.ts";
import { isMediaGenerationAuthorized } from "../../../packages/together-domain/src/media-economics.ts";
import { generatedPhotosEnabled } from "./together-photo-preferences.ts";
import { isFictionalCompanion } from "./together-media-character.ts";
import {
  buildMediaEditConstraint,
  classifyMediaEditSemantics,
} from "../../../packages/together-domain/src/media-edit.ts";
import {
  capabilitiesForAccount,
  normalizeSubscriptionTier,
} from "../../../packages/together-domain/src/entitlements.ts";
import { hasExplicitAdultLanguage } from "../../../packages/together-domain/src/adult-language.ts";
import { resolveCompanionPresence } from "./together-schedule.ts";
import {
  loadValidatedMediaSubjects,
  normalizeMediaSubjectIds,
} from "./together-media-subjects.ts";
import {
  buildMediaWorldContainmentInstruction,
  resolveCanonicalMediaWorld,
  type MediaWorldContainment,
  validateReferenceAssetWorldScope,
} from "./together-media-world.ts";

export type MediaSource =
  | "user_request"
  | "life_event"
  | "date"
  | "moment"
  | "story";
export type MediaContentLevel =
  | "standard"
  | "romance"
  | "suggestive"
  | "mature"
  | "explicit";
export type ShotType = "selfie" | "portrait" | "candid" | "full_body" | "scene";
export type PhotoRequestIntent = {
  requested: boolean;
  subject:
    | "companion"
    | "location"
    | "activity"
    | "outfit"
    | "event"
    | "date"
    | "unknown";
  shotPreference?: ShotType;
  requestedContentLevel?: MediaContentLevel;
  confidence: number;
};
export type CompanionVisualIdentity = {
  canonicalDescription: string;
  age: number;
  referenceStoragePaths: string[];
  hair?: string;
  eyes?: string;
  skinTone?: string;
  build?: string;
  approximateHeight?: string;
  identifyingFeatures?: string[];
  tattoos?: string[];
  piercings?: string[];
  fashionStyle?: string;
  recurringAccessories?: string[];
  visualDoNotChange?: string[];
  photoStyle?: Record<string, unknown>;
};
export type MediaReferenceImage = {
  role:
    | "character_identity"
    | "character_training"
    | "location_environment"
    | "world_environment"
    | "outfit_continuity"
    | "previous_media";
  characterInstanceId?: string;
  bytes?: Uint8Array;
  signedUrl?: string;
  contentType: string;
  name: string;
  assetId?: string;
  revision?: number;
  storageBucket?: string;
  storagePath?: string;
};
export type CanonicalMediaSubject = {
  characterInstanceId: string;
  companion: {
    templateId: string;
    versionId: string;
    name: string;
    age: number;
  };
  visualIdentity: CompanionVisualIdentity;
  referenceImages: MediaReferenceImage[];
  presence?: MediaPresenceState;
  outfitKey?: string;
  outfitDescription?: string;
};
export type CanonicalImageGenerationRequest = {
  mediaId: string;
  generationKind?: "companion_photo" | "creator_identity" | "photo_edit";
  sourceImage?: MediaReferenceImage;
  companion: {
    templateId: string;
    versionId: string;
    name: string;
    age: number;
  };
  visualIdentity: CompanionVisualIdentity;
  subjects?: CanonicalMediaSubject[];
  referenceImages: MediaReferenceImage[];
  context: {
    place?: PlaceContext;
    location?: {
      id: string;
      name: string;
      description?: string;
      category?: string;
    };
    activity?: string;
    mood?: string;
    timeOfDay?: string;
    lifeEvent?: Record<string, unknown>;
    date?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    moment?: Record<string, unknown>;
    story?: Record<string, unknown>;
    outfitKey?: string;
    outfitDescription?: string;
    groupSceneMode?: string;
    worldId?: string;
    worldContainment?: MediaWorldContainment;
  };
  composition: {
    shotType: ShotType;
    framing?: string;
    aspectRatio: string;
    poseDirection?: string;
    faceDirection?: string;
    faceMayBeHidden?: boolean;
  };
  contentLevel: MediaContentLevel;
  qualityTier: "economy" | "standard" | "premium";
  generationIntent?: {
    requestText: string;
    requestedContentLevel: MediaContentLevel;
  };
  qualityRetry?: { reasonCodes: string[] };
  mediaProfile?: {
    id: string;
    provider: string;
    modelFamily: string;
    modelUrl: string;
    triggerWord?: string;
    revision: number;
  };
};
export type ImageProviderCapabilities = {
  referenceImages: boolean;
  identityFidelity: boolean;
  imageEditing: boolean;
  standard: boolean;
  romance: boolean;
  suggestive: boolean;
  mature: boolean;
  explicit: boolean;
  supportedAspectRatios: string[];
};
export type ImageGenerationResult = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  providerRequestId?: string;
  model: string;
  estimatedCost?: number;
};
export interface ImageGenerationProvider {
  id: string;
  capabilities: ImageProviderCapabilities;
  generate(
    request: CanonicalImageGenerationRequest,
  ): Promise<ImageGenerationResult>;
}

const REAL_PERSON_PATTERN =
  /\b(celebrity|public figure|look exactly like|face of|identical to)\b/i;
const SEXUAL_ACT_PATTERN =
  /\b(?:sex(?:ual|ually)?|fuck(?:ing|ed)?|masturbat(?:e|ing|ion)|orgasm|blowjob|handjob|penetrat(?:e|ion|ing)|oral sex|anal sex)\b/i;

export function classifyPhotoRequest(text: string): PhotoRequestIntent {
  return classifyPhotoIntent(text) as PhotoRequestIntent;
}

export function safeRequestText(text?: string): string | undefined {
  if (!text) return undefined;
  if (
    REAL_PERSON_PATTERN.test(text) || SEXUAL_ACT_PATTERN.test(text) ||
    hasExplicitAdultLanguage(text)
  ) return undefined;
  return text.replace(/[\r\n]+/g, " ").trim().slice(0, 180);
}

function contentCapability(
  capabilities: ImageProviderCapabilities,
  level: MediaContentLevel,
): boolean {
  return capabilities[level];
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  id = "openai";
  capabilities: ImageProviderCapabilities = {
    referenceImages: true,
    identityFidelity: true,
    imageEditing: true,
    standard: true,
    romance: true,
    suggestive: false,
    mature: false,
    explicit: false,
    supportedAspectRatios: ["1:1", "4:5", "16:9"],
  };
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}
  async generate(
    request: CanonicalImageGenerationRequest,
  ): Promise<ImageGenerationResult> {
    if (!contentCapability(this.capabilities, request.contentLevel)) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "This kind of photo is not available with the configured provider.",
        503,
      );
    }
    const prompt = buildImagePrompt(request);
    const size = request.composition.aspectRatio === "16:9"
      ? "1536x1024"
      : request.composition.aspectRatio === "1:1"
      ? "1024x1024"
      : "1024x1536";
    const quality = request.qualityTier === "economy"
      ? "low"
      : request.qualityTier === "premium"
      ? "high"
      : "medium";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      let response: Response;
      if (request.referenceImages.length) {
        const form = new FormData();
        form.set("model", this.model);
        form.set("prompt", prompt);
        form.set("size", size);
        form.set("quality", quality);
        form.set("output_format", "webp");
        form.set("input_fidelity", "high");
        for (
          const reference of request.referenceImages.filter((item) =>
            item.bytes
          ).slice(0, 2)
        ) {
          form.append(
            "image[]",
            new Blob([reference.bytes!.slice().buffer as ArrayBuffer], {
              type: reference.contentType,
            }),
            reference.name,
          );
        }
        response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: form,
          signal: controller.signal,
        });
      } else {
        response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            prompt,
            size,
            quality,
            output_format: "webp",
            n: 1,
          }),
          signal: controller.signal,
        });
      }
      const payload = await response.json().catch(() => ({})) as {
        data?: Array<{ b64_json?: string }>;
        error?: { message?: string; code?: string };
        id?: string;
      };
      if (!response.ok || !payload.data?.[0]?.b64_json) {
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          response.status === 429
            ? "Photo requests are busy right now. Try again soon."
            : "The photo could not be taken right now.",
          response.status === 429 ? 429 : 503,
          true,
        );
      }
      const binary = atob(payload.data[0].b64_json);
      const bytes = Uint8Array.from(
        binary,
        (character) => character.charCodeAt(0),
      );
      const [width, height] = size.split("x").map(Number);
      return {
        bytes,
        contentType: "image/webp",
        width: width!,
        height: height!,
        providerRequestId: payload.id,
        model: this.model,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The photo could not be taken right now.",
        503,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GeminiImageProvider implements ImageGenerationProvider {
  id = "gemini";
  capabilities: ImageProviderCapabilities = {
    referenceImages: true,
    identityFidelity: true,
    imageEditing: true,
    standard: true,
    romance: true,
    suggestive: false,
    mature: false,
    explicit: false,
    supportedAspectRatios: ["1:1", "4:5", "16:9"],
  };
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}
  async generate(
    request: CanonicalImageGenerationRequest,
  ): Promise<ImageGenerationResult> {
    if (!contentCapability(this.capabilities, request.contentLevel)) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "This kind of photo is not available with the configured provider.",
        503,
      );
    }
    const parts: Array<Record<string, unknown>> = [{
      text: buildImagePrompt(request),
    }];
    for (
      const reference of request.referenceImages.filter((item) => item.bytes)
        .slice(0, 2)
    ) {
      parts.push({
        inline_data: {
          mime_type: reference.contentType,
          data: uint8ToBase64(reference.bytes!),
        },
      });
    }
    const imageSize = request.qualityTier === "economy" ? "512" : "1K";
    const aspectRatio = {
      "1:1": "ASPECT_RATIO_ONE_BY_ONE",
      "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
      "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
    }[request.composition.aspectRatio];
    const providerImageSize = imageSize === "512"
      ? "IMAGE_SIZE_FIVE_TWELVE"
      : "IMAGE_SIZE_ONE_K";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${
          encodeURIComponent(this.model)
        }:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseModalities: ["IMAGE"],
              responseFormat: {
                image: { aspectRatio, imageSize: providerImageSize },
              },
            },
          }),
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        responseId?: string;
        candidates?: Array<
          {
            content?: {
              parts?: Array<
                {
                  inlineData?: { data?: string; mimeType?: string };
                  inline_data?: { data?: string; mime_type?: string };
                }
              >;
            };
          }
        >;
        error?: { message?: string; code?: number; status?: string };
      };
      const output = payload.candidates?.[0]?.content?.parts?.find((part) =>
        part.inlineData?.data || part.inline_data?.data
      );
      const data = output?.inlineData?.data ?? output?.inline_data?.data;
      const contentType = output?.inlineData?.mimeType ??
        output?.inline_data?.mime_type ?? "image/png";
      if (!response.ok || !data) {
        const diagnostic = {
          provider: this.id,
          model: this.model,
          httpStatus: response.status,
          providerStatus: payload.error?.status,
          providerCode: payload.error?.code,
          message: payload.error?.message?.replace(/[\r\n]+/g, " ").slice(
            0,
            240,
          ),
          hasCandidate: Boolean(payload.candidates?.length),
        };
        console.error("Gemini image generation failed", diagnostic);
        if (response.status === 429) {
          const quotaBlocked =
            /quota|billing/i.test(payload.error?.message ?? "") ||
            payload.error?.status === "RESOURCE_EXHAUSTED";
          if (quotaBlocked) {
            throw new AppError(
              "PROVIDER_QUOTA",
              "Photos are unavailable until provider capacity is restored.",
              503,
              false,
            );
          }
          throw new AppError(
            "RATE_LIMITED",
            "Photo requests are busy right now. Try again soon.",
            429,
            true,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AppError(
            "PROVIDER_AUTH",
            "The photo provider needs attention.",
            503,
            true,
          );
        }
        if (response.status === 404) {
          throw new AppError(
            "PROVIDER_MODEL",
            "The configured photo model is unavailable.",
            503,
            true,
          );
        }
        if (response.status === 400) {
          throw new AppError(
            "PROVIDER_REQUEST_INVALID",
            "The photo request could not be processed.",
            503,
            true,
          );
        }
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          "The photo could not be taken right now.",
          503,
          true,
        );
      }
      const binary = atob(data);
      const bytes = Uint8Array.from(
        binary,
        (character) => character.charCodeAt(0),
      );
      const [width, height] = request.composition.aspectRatio === "16:9"
        ? [1024, 576]
        : request.composition.aspectRatio === "4:5"
        ? [819, 1024]
        : [1024, 1024];
      return {
        bytes,
        contentType,
        width: imageSize === "512" ? Math.round(width / 2) : width,
        height: imageSize === "512" ? Math.round(height / 2) : height,
        providerRequestId: payload.responseId,
        model: this.model,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The photo could not be taken right now.",
        503,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  return btoa(binary);
}

export function configuredImageProvider(): ImageGenerationProvider | null {
  const selected = (Deno.env.get("KIVELLE_IMAGE_PROVIDER") ??
    (Deno.env.get("OPENAI_API_KEY")
      ? "openai"
      : Deno.env.get("GEMINI_API_KEY")
      ? "gemini"
      : "none")).toLowerCase();
  if (selected === "none") return null;
  // Venice handles established companion photos through the canonical media
  // router. Creator appearance generation has no identity reference yet, so it
  // intentionally keeps the existing text-to-image provider until an identity
  // has been selected; this prevents the provider switch from breaking Creator.
  if (selected === "venice") {
    const openAIKey = Deno.env.get("OPENAI_API_KEY");
    if (openAIKey) {
      return new OpenAIImageProvider(
        openAIKey,
        Deno.env.get("KIVELLE_CREATOR_IMAGE_MODEL") ??
          Deno.env.get("KIVELLE_IMAGE_MODEL") ?? "gpt-image-2",
      );
    }
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
      return new GeminiImageProvider(
        geminiKey,
        Deno.env.get("KIVELLE_CREATOR_IMAGE_MODEL") ?? "gemini-3.1-flash-image",
      );
    }
    return null;
  }
  if (selected === "openai") {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return null;
    return new OpenAIImageProvider(
      key,
      Deno.env.get("KIVELLE_IMAGE_MODEL") ?? "gpt-image-2",
    );
  }
  if (selected === "gemini") {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return null;
    return new GeminiImageProvider(
      key,
      Deno.env.get("KIVELLE_IMAGE_MODEL") ?? "gemini-3.1-flash-image",
    );
  }
  return null;
}

export function routeImageProvider(
  level: MediaContentLevel,
): ImageGenerationProvider {
  const provider = configuredImageProvider();
  if (!provider || !contentCapability(provider.capabilities, level)) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "That kind of photo is not available right now.",
      503,
    );
  }
  return provider;
}

function line(value: unknown, fallback = "not specified"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function list(value: unknown): string {
  return Array.isArray(value)
    ? value.map(String).filter(Boolean).join(", ")
    : "";
}
export function buildImagePrompt(
  request: CanonicalImageGenerationRequest,
): string {
  if ((request.subjects?.length ?? 1) > 1) {
    return buildGroupImagePrompt(request);
  }
  const identity = request.visualIdentity;
  if (request.generationKind === "photo_edit") {
    const instruction = request.generationIntent?.requestText?.trim();
    if (!instruction) {
      throw new AppError(
        "PROVIDER_REQUEST_INVALID",
        "The photo edit instruction was incomplete.",
        422,
      );
    }
    return [
      "EDIT AN EXISTING KIVELLE PHOTOGRAPH",
      buildMediaEditConstraint(
        instruction,
        classifyMediaEditSemantics(instruction),
      ),
      "IDENTITY",
      `${request.companion.name} is one fictional adult age ${request.companion.age}. Preserve the exact same recognizable identity, facial geometry, hair, skin, body identity, adult age, and identifying features from the source photograph.`,
      "PHOTOREALISM",
      CHARACTER_PHOTO_REALISM_GUIDANCE,
      "ANATOMY",
      "Keep one coherent body with plausible joints and natural proportions. Every visible hand must have five distinct naturally arranged fingers and a correct thumb. Correct only anatomy the request explicitly asks to repair; never hide a requested repair with cropping or blur.",
      "CONTENT LEVEL",
      contentLevelPrompt(request.contentLevel),
      "WORLD / LOCATION LOCK",
      buildMediaWorldContainmentInstruction(request.context.worldContainment),
      "CANONICAL SAFETY",
      "This edit is downstream visual media. It must not imply that Kivelle location, activity, relationship, plans, memories, or scene state changed. Output only the edited photograph with no text, UI, collage, border, watermark, or embedded source image.",
    ].join("\n");
  }
  const place = request.context.place, location = request.context.location;
  const visibleCaptureDevice = photoRequestWantsVisibleCaptureDevice(
    request.generationIntent?.requestText,
  );
  const sceneBoundary = resolveMediaSceneBoundary({
    locationName: place?.location.name ?? location?.name ??
      "the current canonical place",
    locationType: place?.location.type,
    category: place?.location.category ?? location?.category,
    indoorOutdoor: place?.location.visualContext.indoorOutdoor,
  });
  const characterReference = request.referenceImages.some((item) =>
    item.role === "character_identity"
  );
  const referenceRule = characterReference
    ? "Image 1 defines only the same fictional adult companion’s stable physical identity. Its clothing, accessories, pose, framing, background, and lighting are not canonical and must not be copied."
    : "Use the canonical identity description exactly and keep it stable across images.";
  const referenceInstructions = request.referenceImages.map((
    reference,
    index,
  ) =>
    `Image ${index + 1} ${
      reference.role === "character_identity"
        ? "defines only face, hair, eyes, skin tone, adult age, body identity, and stable identifying features—not wardrobe, pose, framing, background, or lighting"
        : reference.role === "location_environment"
        ? "defines the canonical location environment and its architecture, materials, layout cues, recurring objects, and atmosphere"
        : reference.role === "world_environment"
        ? "defines the wider canonical world identity"
        : reference.role === "outfit_continuity"
        ? "defines same-day clothing continuity and is the only image allowed to define wardrobe"
        : reference.role === "previous_media"
        ? "defines continuity from the approved previous media"
        : "is a curated character-training identity reference whose wardrobe and background are non-canonical"
    }.`
  ).join(" ");
  const environmentRule = place?.location.referencePolicy === "text_only"
    ? "This private home has no location reference image by design. Build the environment only from the exact canonical home text and visual anchors below; never borrow its room, décor, lighting, or layout from the character identity portrait."
    : "Use a dedicated location reference when supplied; otherwise build the environment from the exact canonical location text below.";
  const outfitReference = request.referenceImages.some((item) =>
    item.role === "outfit_continuity"
  );
  const district = place?.district ??
    [...(place?.ancestry ?? [])].reverse().find((item) =>
      item.type === "district"
    );
  const districtVisual = district?.visualContext ?? {};
  const resolvedDirection = resolvePhotoDirection({
      requestText: request.generationIntent?.requestText,
      shotType: request.composition.shotType,
      seed: request.mediaId,
    }),
    direction = {
      poseDirection: request.composition.poseDirection ??
        resolvedDirection.poseDirection,
      faceDirection: request.composition.faceDirection ??
        resolvedDirection.faceDirection,
      faceMayBeHidden: request.composition.faceMayBeHidden ??
        resolvedDirection.faceMayBeHidden,
    };
  const hiddenFaceAllowed = direction.faceMayBeHidden ||
      photoRequestAllowsHiddenFace(request.generationIntent?.requestText),
    faceGuidance = hiddenFaceAllowed
      ? "The approved composition intentionally permits the face to be covered, turned away, cropped out, or outside the frame. Do not force the face into view. If any face is visible, keep it anatomically natural and identity-consistent."
      : "Keep the companion face recognizable and identity-consistent whenever visible; follow the facial direction below instead of forcing a rigid straight-on head angle.";
  const wardrobe = request.context.outfitDescription
    ? `Use exactly this canonical clothing description from the companion's message: ${request.context.outfitDescription}`
    : outfitReference
    ? "Continue the clothing shown in the dedicated outfit-continuity reference. Do not take clothing from identity or location references."
    : `Choose natural ${
      line(identity.fashionStyle, "contemporary")
    } clothing appropriate to this exact place, activity, weather, and time. Do not copy clothing from any identity or character-training reference.`;
  return [
    "PHOTOREALISM REQUIREMENT",
    CHARACTER_PHOTO_REALISM_GUIDANCE,
    "IDENTITY",
    referenceRule,
    `${request.companion.name} is a fictional adult age ${request.companion.age}.`,
    line(identity.canonicalDescription),
    `Hair: ${line(identity.hair)}. Eyes: ${line(identity.eyes)}. Skin tone: ${
      line(identity.skinTone)
    }. Build: ${line(identity.build)}.`,
    `Identifying features: ${
      list(identity.identifyingFeatures) || "preserve the canonical identity"
    }.`,
    "REFERENCE ROLES",
    `${referenceRule} ${referenceInstructions} ${environmentRule} Location references define the exact environment. World references define only the wider regional identity and must never replace the exact location. Allow a natural new camera angle rather than copying the source composition. Every reference is invisible conditioning material only: never reproduce a source image as a framed photograph, poster, screen, thumbnail, profile card, collage, split screen, picture-in-picture, or image held by the subject.`,
    "WORLD",
    place
      ? `${place.world.name}. ${place.world.description}\nSetting: ${
        line(place.world.visualContext.setting)
      }. Architecture: ${
        list(place.world.visualContext.architecture)
      }. Climate: ${
        line(place.world.visualContext.climate)
      }. Recurring elements: ${
        list(place.world.visualContext.recurringElements)
      }. Avoid: ${
        list(place.world.visualContext.avoid)
      }. These wider world cues are subordinate to the exact location below.`
      : "Use the canonical current Kivelle world.",
    "DISTRICT / AREA",
    district
      ? `${district.name}. ${
        line(district.description)
      } Canonical district look: ${
        line(districtVisual.canonicalPrompt)
      }. Architecture: ${list(districtVisual.architecture)}. Materials: ${
        list(districtVisual.materials)
      }. Visual anchors: ${list(districtVisual.visualAnchors)}. Atmosphere: ${
        list(districtVisual.atmosphere)
      }. Avoid: ${
        list(districtVisual.avoid)
      }. District cues establish the surrounding area only and are subordinate to stronger exact-location anchors below.`
      : "Use only the world and exact-location context; no separate district is established.",
    "LOCATION PATH",
    place?.path ?? location?.name ?? "Current canonical place",
    "EXACT LOCATION",
    place
      ? `${
        place.location.visualContext.canonicalPrompt ??
          place.location.lore.summary ?? place.location.description
      }. Materials: ${
        list(place.location.visualContext.materials)
      }. Lighting: ${
        list(place.location.visualContext.lighting)
      }. Visual anchors: ${
        list(place.location.visualContext.visualAnchors) ||
        list(place.location.lore.signatureDetails)
      }. Atmosphere: ${
        list(place.location.visualContext.atmosphere) ||
        list(place.location.lore.atmosphere)
      }. Sensory/environmental cues: ${
        list(place.location.lore.sensoryDetails)
      }. Avoid: ${list(place.location.visualContext.avoid)}.`
      : location
      ? `${location.name}. ${
        line(
          location.description,
          "A believable real environment consistent with this location.",
        )
      }`
      : "A believable environment consistent with the current Kivelle world.",
    "ACTIVITY",
    line(request.context.activity, "a natural moment from the current day"),
    "MOOD",
    line(request.context.mood, "natural and relaxed"),
    "TIME / LIGHTING",
    `${
      place
        ? `${place.clock.weekday} ${place.clock.localTime} (${place.clock.timezone}), ${place.clock.daypart}`
        : line(request.context.timeOfDay, "current local time")
    }; believable available light.`,
    "WARDROBE",
    wardrobe,
    "COMPOSITION",
    `${
      request.composition.shotType.replace("_", " ")
    } photo, ${request.composition.aspectRatio}, ${
      line(
        request.composition.framing,
        "grounded framing with useful environmental context",
      )
    }. Pose: ${direction.poseDirection}. Facial direction: ${direction.faceDirection}. The identity reference defines appearance only and must never pull the pose, head angle, gaze, or expression back to its source orientation.`,
    "CAMERA STYLE",
    `One coherent photorealistic personal smartphone or camera photograph, natural lighting, subtle sensor and lens character, realistic environment, natural expression, and visible natural skin detail. ${faceGuidance} No illustration, anime, painting, CGI, 3D render, doll-like face, waxy or plastic skin, collage, inset, diptych, screenshot, user interface, phone screen displaying a portrait, printed portrait, framed portrait, reference sheet, caption, prompt text, location label, watermark, or logo. Avoid glossy advertising, glamour-campaign staging, fantasy rendering, oversaturation, malformed or duplicated facial features, smeared eyes or mouth, impossible mirror geometry, and identity drift.`,
    "CAPTURE DEVICE",
    visibleCaptureDevice
      ? "The approved request explicitly asks for a visible phone or camera. Include only that requested device, held naturally without obscuring the companion’s identity or introducing impossible mirror geometry."
      : "The photograph may use a close selfie viewpoint, but the capture device is outside the frame. Do not show a phone, smartphone, camera, selfie stick, device reflection, phone screen, or a hand posed as though visibly holding one.",
    "ANATOMICAL REALISM",
    "Preserve a coherent adult skeleton and natural body proportions from head through torso and limbs. Shoulders, elbows, wrists, hips, knees, and ankles must connect and bend plausibly. Every visible hand has one palm, five distinct naturally arranged fingers, correct thumb placement, separated digits, and believable nails. Do not fuse, erase, duplicate, stretch, twist, or add limbs, joints, fingers, toes, facial features, or body parts. Visible adult anatomy must have natural contours, believable volume, fine skin texture, and complete photographic detail rather than smooth, melted, vague, featureless, or synthetic regions.",
    "CONTINUITY REQUIREMENTS",
    "World state is authoritative. Do not change the location, activity, time, canonical wardrobe description, or companion identity. Identity references never establish wardrobe. Do not add people unless they are explicitly part of the event context.",
    "CONTENT LEVEL",
    contentLevelPrompt(request.contentLevel),
    ...(request.generationIntent?.requestText
      ? [
        "APPROVED USER INTENT",
        `Use this approved visual request as creative direction without changing canonical identity, place, activity, consent boundaries, or content level: ${request.generationIntent.requestText}`,
      ]
      : []),
    ...(request.qualityRetry
      ? [
        "QUALITY RETRY",
        `The previous candidate was rejected by visual quality control (${
          request.qualityRetry.reasonCodes.map((reason) =>
            reason === "sexual_content"
              ? "general-audience wardrobe or pose violation"
              : reason
          ).join(", ")
        }). Produce a fresh single photograph with one clear, detailed, naturally proportioned face and fully coherent adult anatomy. Correct the named defects rather than hiding them with blur, crop, hands behind the body, crossed limbs, shadows, or missing detail. Do not reuse the previous composition or reproduce any reference image inside the scene.`,
      ]
      : []),
    "WORLD / LOCATION LOCK",
    buildMediaWorldContainmentInstruction(request.context.worldContainment),
    "FINAL SCENE GROUNDING",
    `${sceneBoundary.instruction} Do not show: ${
      sceneBoundary.avoid.join(", ")
    }. This exact spatial requirement overrides conflicting exterior/interior cues from the world description, generic photographic priors, earlier media, or the approved user wording.`,
    "FINAL WARDROBE GROUNDING",
    `${wardrobe} Clothing visible in identity or character-training references is source-image residue and must not appear unless it independently matches this wardrobe instruction.`,
    "DO-NOT-CHANGE IDENTITY",
    `Preserve facial identity, adult age, body proportions, hair, eye color, and distinguishing features. ${
      list(identity.visualDoNotChange)
    }. Do not redesign the person and do not imitate any real person or celebrity. The output must contain only the requested camera image—never a visible copy of an identity reference or any rendered instructions.`,
  ].join("\n");
}

export function buildGroupImagePrompt(
  request: CanonicalImageGenerationRequest,
): string {
  const subjects = request.subjects ?? [],
    place = request.context.place,
    location = request.context.location,
    staged = request.context.groupSceneMode === "staged_group_portrait";
  const visibleCaptureDevice = photoRequestWantsVisibleCaptureDevice(
    request.generationIntent?.requestText,
  );
  if (subjects.length !== 2) {
    throw new AppError(
      "PROVIDER_REQUEST_INVALID",
      "Group photos currently require exactly two selected companions.",
      422,
    );
  }
  const referenceInstructions = request.referenceImages.map(
    (reference, index) => {
      const subject = reference.characterInstanceId
        ? subjects.find((item) =>
          item.characterInstanceId === reference.characterInstanceId
        )
        : undefined;
      if (reference.role === "character_identity" && subject) {
        return `Image ${
          index + 1
        } defines only ${subject.companion.name}'s exact stable identity: face, hair, eyes, skin tone, adult age, body identity, and identifying features. It does not define wardrobe, pose, background, or lighting.`;
      }
      if (reference.role === "previous_media") {
        return `Image ${
          index + 1
        } is the approved two-person source photograph being edited. Preserve its two distinct people and established composition except for the exact requested change; use the named identity references to prevent swaps or drift.`;
      }
      if (reference.role === "location_environment") {
        return `Image ${
          index + 1
        } defines the shared environment only, never either person's identity.`;
      }
      if (reference.role === "world_environment") {
        return `Image ${
          index + 1
        } defines the wider world atmosphere only, never either person's identity.`;
      }
      return `Image ${
        index + 1
      } is supporting continuity material and must not be reproduced inside the result.`;
    },
  ).join(" ");
  const identities = subjects.map((subject, index) => {
    const identity = subject.visualIdentity,
      side = index === 0 ? "left" : "right";
    return [
      `SUBJECT ${index + 1}: ${subject.companion.name}`,
      `${subject.companion.name} is one distinct fictional adult age ${subject.companion.age}, positioned primarily on the ${side} side of the composition.`,
      identity.canonicalDescription,
      `Hair: ${line(identity.hair)}. Eyes: ${line(identity.eyes)}. Skin tone: ${
        line(identity.skinTone)
      }. Build: ${line(identity.build)}. Identifying features: ${
        list(identity.identifyingFeatures) ||
        "preserve the corresponding identity reference exactly"
      }.`,
      `Never blend, swap, average, duplicate, or transfer ${subject.companion.name}'s face, hair, body identity, features, or age with the other subject.`,
    ].join("\n");
  }).join("\n");
  const scene = staged
    ? "This is a staged creative two-person portrait within their shared Kivelle world. It does not establish either companion’s current location, schedule, activity, relationship state, or world state. Use a neutral believable setting consistent with supplied world cues and do not imply a new canonical event."
    : `Both companions are canonically co-present at ${
      place?.path ?? location?.name ?? "the established shared location"
    }. Preserve that exact common setting, time, and activity.`;
  const edit = request.generationKind === "photo_edit"
    ? "Edit the existing approved two-person Kivelle photograph while preserving both exact identities, subject count, and left/right identity assignment."
    : "Create one new coherent photorealistic personal photograph containing exactly these two selected companions.";
  return [
    "TWO-PERSON KIVELLE PHOTOGRAPH",
    edit,
    "PHOTOREALISM REQUIREMENT",
    CHARACTER_PHOTO_REALISM_GUIDANCE,
    "IDENTITY ASSIGNMENT",
    identities,
    "REFERENCE ASSIGNMENT",
    referenceInstructions,
    "Each character identity reference belongs only to its named subject. Never copy one identity into both people. Never render any reference as a print, screen, inset, collage, or picture-in-picture.",
    "SCENE",
    scene,
    "COMPOSITION",
    `${
      request.composition.shotType.replace("_", " ")
    } photo, ${request.composition.aspectRatio}. ${
      line(
        request.composition.framing,
        "Balanced two-person framing with both faces large, crisp, unobstructed, and equally recognizable.",
      )
    }`,
    "Keep both intended subjects readable in one camera image. Exactly two people: no third person, duplicate person, extra face, merged body, or cropped-away selected companion.",
    "CAPTURE DEVICE",
    visibleCaptureDevice
      ? "The approved request explicitly asks for a visible phone or camera. Include only that requested device and keep both companion identities unobstructed."
      : "Treat selfie as viewpoint and framing only. The capture device is outside the image: no visible phone, smartphone, camera, selfie stick, device reflection, phone screen, or device-holding hand.",
    "WARDROBE",
    "Give each subject distinct natural clothing appropriate to the approved request and shared setting unless the approved adult request explicitly changes coverage. Identity references never define wardrobe.",
    "ANATOMICAL REALISM",
    "Render two separate coherent adult bodies with plausible proportions, joints, limbs, hands, and facial anatomy. Do not fuse limbs or faces between subjects. Every visible hand has five naturally arranged fingers and a correct thumb.",
    "CONTENT LEVEL",
    contentLevelPrompt(request.contentLevel),
    "WORLD / LOCATION LOCK",
    buildMediaWorldContainmentInstruction(request.context.worldContainment),
    ...(request.generationIntent?.requestText
      ? [
        "APPROVED USER INTENT",
        `Follow only this approved visual direction without changing either identity, subject roster, consent boundary, or content level: ${request.generationIntent.requestText}`,
      ]
      : []),
    ...(request.qualityRetry
      ? [
        "QUALITY RETRY",
        `The previous two-person candidate failed quality control (${
          request.qualityRetry.reasonCodes.map((reason) =>
            reason === "sexual_content"
              ? "general-audience wardrobe or pose violation"
              : reason
          ).join(", ")
        }). Generate a fresh composition containing the same two distinct companions, correct the defects, and preserve both identity assignments.`,
      ]
      : []),
    "FINAL CONSTRAINT",
    "Output one photograph containing exactly the two selected fictional adults. No illustration, anime, CGI, doll-like skin, identity blending, face swap, duplicate face, extra person, missing subject, text, watermark, UI, or collage.",
  ].join("\n");
}

function timeOfDay(date = new Date()): string {
  const hour = date.getHours();
  return hour < 6
    ? "night"
    : hour < 12
    ? "morning"
    : hour < 17
    ? "afternoon"
    : hour < 21
    ? "evening"
    : "night";
}
function requestKey(
  input: QueueMediaInput,
  intent: PhotoRequestIntent,
): string {
  return [
    input.source,
    normalizeMediaSubjectIds(
      input.characterInstanceId,
      input.subjectCharacterInstanceIds,
    ).join("+"),
    input.messageId ?? input.lifeEventId ?? input.dateSessionId ??
      input.momentId ?? input.storyArcId ?? input.idempotencyKey ??
      intent.subject,
  ].join(":");
}

export type MediaEconomicAuthorization = {
  kind: "accepted_offer" | "included_benefit";
  mediaOfferId: string;
  creditTransactionId?: string | null;
  creditCost: number;
  creditAction: "companion_photo";
  includedBenefit?: boolean;
  includedBenefitType?: "date_completion_photo" | "daily_companion_photo" | null;
  includedBenefitReservationKey?: string | null;
  subscriptionTier: string;
};
export type QueueMediaInput = {
  userId: string;
  characterInstanceId: string;
  subjectCharacterInstanceIds?: string[];
  source: MediaSource;
  conversationId?: string;
  messageId?: string;
  lifeEventId?: string;
  dateSessionId?: string;
  momentId?: string;
  storyArcId?: string;
  sceneSessionId?: string;
  sceneActionId?: string;
  sharedPlanId?: string;
  requestText?: string;
  companionResponseText?: string;
  idempotencyKey?: string;
  force?: boolean;
  canonicalPresence?: MediaPresenceState;
  economicAuthorization?: MediaEconomicAuthorization;
  qualityTierOverride?: "economy" | "standard" | "premium";
  shotTypeOverride?: ShotType;
};
export async function queueMediaRequest(
  db: SupabaseClient,
  input: QueueMediaInput,
): Promise<Record<string, unknown> | null> {
  if (
    !isMediaGenerationAuthorized(
      input.source,
      input.economicAuthorization?.kind,
    )
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Spontaneous media must be accepted before generation.",
      403,
    );
  }
  const intent = classifyPhotoRequest(input.requestText ?? "");
  const productionRequest = resolveProductionSafePhotoRequest({
    requestText: input.requestText,
    requestedContentLevel: intent.requestedContentLevel,
    fallbackLevel: input.source === "date" ? "romance" : "standard",
  });
  if (input.source === "user_request" && !intent.requested && !input.force) {
    return null;
  }
  const subjectIds = normalizeMediaSubjectIds(
    input.characterInstanceId,
    input.subjectCharacterInstanceIds,
  );
  const [
    subjects,
    { data: profile },
    { data: relationships },
    { data: entitlement },
  ] = await Promise.all([
    loadValidatedMediaSubjects(db, {
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
      subjectCharacterInstanceIds: subjectIds,
      conversationId: input.conversationId,
    }),
    db.from("together_profiles").select(
      "age_verified_at,content_preferences,photo_preferences,multimodal_preferences",
    ).eq("user_id", input.userId).maybeSingle(),
    db.from("together_relationship_states").select("*").in(
      "character_instance_id",
      subjectIds,
    ).eq("user_id", input.userId),
    db.from("together_entitlements").select("tier,metadata,expires_at").eq(
      "user_id",
      input.userId,
    ).maybeSingle(),
  ]);
  const instance =
    subjects.find((subject) =>
      String(subject.id) === input.characterInstanceId
    ) ?? subjects[0];
  if (!instance) {
    throw new AppError("NOT_FOUND", "That companion is unavailable.", 404);
  }
  const relationshipByCharacterId = new Map(
    (relationships ?? []).map((
      row: any,
    ) => [String(row.character_instance_id), row]),
  );
  const preferences = (profile?.photo_preferences ?? {}) as Record<
    string,
    unknown
  >;
  if (!generatedPhotosEnabled(profile)) return null;
  if (
    input.source !== "user_request" && preferences.automaticPhotos === false &&
    !input.economicAuthorization
  ) return null;
  const template = instance.together_character_templates as Record<
      string,
      unknown
    >,
    characterVersion = (instance.together_character_versions ?? {}) as Record<
      string,
      unknown
    >;
  if (
    !profile?.age_verified_at || subjects.some((subject) =>
      Number(
          (subject.together_character_templates as Record<string, unknown>).age,
        ) < 18 ||
      !isFictionalCompanion(
        subject.together_character_templates,
        subject.together_character_versions,
      )
    )
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Photos require confirmed adult fictional characters and accounts.",
      403,
    );
  }
  const key = requestKey(input, intent);
  const { data: duplicate } = await db.from("together_generated_media").select(
    "*",
  ).eq("user_id", input.userId).eq("request_key", key).maybeSingle();
  if (duplicate) return duplicate;
  const now = new Date();
  const recentSince = new Date(now.getTime() - 24 * 3600000).toISOString();
  const { data: recent } = await db.from("together_generated_media").select(
    "id,created_at,status,metadata",
  ).eq("user_id", input.userId).eq(
    "character_instance_id",
    input.characterInstanceId,
  ).gte("created_at", recentSince).in("status", [
    "queued",
    "generating",
    "ready",
  ]).order("created_at", { ascending: false });
  const entitlementExpired = Boolean(
    entitlement?.expires_at &&
      new Date(entitlement.expires_at).getTime() <= now.getTime(),
  );
  const mediaCapabilities = capabilitiesForAccount(
    entitlementExpired ? "free" : normalizeSubscriptionTier(entitlement?.tier),
    entitlement?.metadata,
  );
  const requestedPhotoLimit = mediaCapabilities.userRequestedPhotoDailyLimit;
  if (
    input.source === "user_request" && requestedPhotoLimit !== null &&
    (recent ?? []).filter((item) =>
        String((item.metadata as Record<string, unknown>)?.source) ===
          "user_request"
      ).length >= requestedPhotoLimit
  ) {
    throw new AppError(
      "RATE_LIMITED",
      "You have asked for several photos today. Try again later.",
      429,
      true,
    );
  }
  // Proactive-event throttles prevent offer spam. Once a user has accepted an
  // offer (or is claiming a bounded included benefit), that authorization must
  // not be rejected by an unrelated proactive-photo cooldown.
  if (input.source !== "user_request" && !input.economicAuthorization) {
    if (
      (recent ?? []).filter((item) =>
        String((item.metadata as Record<string, unknown>)?.source) !==
          "user_request"
      ).length >= 2
    ) return null;
    if (
      recent?.some((item) =>
        String((item.metadata as Record<string, unknown>)?.source) !==
          "user_request" &&
        now.getTime() - new Date(item.created_at).getTime() < 8 * 3600000
      )
    ) return null;
  }
  let authoritativeLocationId: string | undefined;
  if (input.lifeEventId) {
    const { data: event } = await db.from("together_life_events").select(
      "location_id",
    ).eq("id", input.lifeEventId).eq("user_id", input.userId).maybeSingle();
    if (event?.location_id) authoritativeLocationId = String(event.location_id);
  }
  if (input.dateSessionId) {
    const { data: date } = await db.from("together_date_sessions").select(
      "together_date_templates(location_id)",
    ).eq("id", input.dateSessionId).eq("user_id", input.userId).maybeSingle();
    const template = date?.together_date_templates as unknown as
      | Record<string, unknown>
      | null;
    if (template?.location_id) {
      authoritativeLocationId = String(template.location_id);
    }
  }
  if (input.momentId) {
    const { data: moment } = await db.from("together_moments").select(
      "location_id",
    ).eq("id", input.momentId).eq("user_id", input.userId).maybeSingle();
    if (moment?.location_id) {
      authoritativeLocationId = String(moment.location_id);
    }
  }
  if (input.sceneSessionId) {
    const { data: scene } = await db.from("together_scene_sessions").select(
      "location_id",
    ).eq("id", input.sceneSessionId).eq("user_id", input.userId).eq(
      "character_instance_id",
      input.characterInstanceId,
    ).maybeSingle();
    if (scene?.location_id) authoritativeLocationId = String(scene.location_id);
  }
  // Confirmation is deliberately fast and carries only a lightweight scene
  // snapshot. Refresh canonical presence after Accept, immediately before the
  // image prompt and reference assets are resolved.
  const refreshedPresences = input.source === "user_request"
    ? await Promise.all(subjects.map(async (subject) => ({
      characterInstanceId: String(subject.id),
      presence: await resolveCompanionPresence({
        db,
        userId: input.userId,
        characterInstanceId: String(subject.id),
        now,
        ensure: false,
      }).catch((error) => {
        console.warn(
          JSON.stringify({
            level: "warn",
            operation: "accepted_photo_presence_refresh",
            characterInstanceId: String(subject.id),
            message: error instanceof Error ? error.message : "unknown_error",
          }),
        );
        return null;
      }),
    })))
    : [];
  const refreshedPresence =
    refreshedPresences.find((item) =>
      item.characterInstanceId === String(instance.id)
    )?.presence ?? null;
  const refreshedPresenceState = refreshedPresence
    ? {
      locationId: refreshedPresence.locationId,
      activity: refreshedPresence.activity,
      activityKey: refreshedPresence.activityKey,
      mood: refreshedPresence.mood,
      source: refreshedPresence.source,
      resolvedAt: now.toISOString(),
    }
    : null;
  const mediaPresence = resolveCanonicalMediaPresence({
    character: refreshedPresenceState ?? {
      locationId: String(instance.current_location_id ?? "") || null,
      activity: String(instance.current_activity ?? ""),
      mood: String(instance.current_mood ?? ""),
      source: String(instance.current_presence_source ?? "character_state"),
    },
    canonical: refreshedPresenceState ?? input.canonicalPresence,
    ...(authoritativeLocationId ? { authoritativeLocationId } : {}),
  });
  const refreshedLocationIds = refreshedPresences.map((item) =>
      item.presence?.locationId
    ).filter(Boolean).map(String),
    coPresent = subjectIds.length === 1 ||
      (refreshedLocationIds.length === subjectIds.length &&
        new Set(refreshedLocationIds).size === 1),
    stagedGroupPortrait = subjectIds.length > 1 && !coPresent;
  const { data: groupConversation } = input.conversationId
    ? await db.from("together_conversations").select("group_world_id").eq(
      "id",
      input.conversationId,
    ).eq("user_id", input.userId).maybeSingle()
    : { data: null };
  const worldContainment = await resolveCanonicalMediaWorld({
    db,
    characterVersionIds: subjects.map((subject) =>
      String(subject.character_version_id)
    ),
    requestText: input.requestText,
    authoritativeLocationId,
    presenceLocationId: stagedGroupPortrait
      ? undefined
      : mediaPresence.locationId ?? undefined,
    groupWorldId: String(groupConversation?.group_world_id ?? "") || undefined,
  });
  const presenceLocationId = worldContainment.locationId;
  const [{ data: anchorLocation }, { data: opportunities }] = await Promise.all(
    [
      presenceLocationId
        ? db.from("together_locations").select("*").eq("id", presenceLocationId)
          .maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("together_photo_opportunities").select("*").eq("active", true),
    ],
  );
  const requestedLocation = [
    "requested_exact_location",
    "requested_setting_match",
    "authoritative_location",
  ].includes(worldContainment.resolutionReason);
  const place = !presenceLocationId
    ? null
    : requestedLocation
    ? await resolvePlaceContext({
      db,
      locationId: presenceLocationId,
      now,
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
    })
    : await resolveCharacterPlaceContext({
      db,
      characterVersionId: String(instance.character_version_id),
      locationId: presenceLocationId,
      activity: mediaPresence.activity,
      activityKey: mediaPresence.activityKey,
      now,
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
    });
  const virtualHome = place?.location.virtualType === "character_home";
  const locationId = virtualHome ? undefined : presenceLocationId;
  const location = virtualHome ? null : anchorLocation;
  const effectiveWorldContainment: MediaWorldContainment = {
    ...worldContainment,
    ...(place
      ? { locationName: place.location.name, locationPath: place.path }
      : {}),
    ...(virtualHome ? { locationId: undefined } : {}),
  };
  const mediaActivity = requestedLocation && effectiveWorldContainment.locationName
    ? `taking a personal photo at ${effectiveWorldContainment.locationName}`
    : mediaPresence.activity;
  const opportunity = scorePhotoOpportunities(opportunities ?? [], {
    locationSlug: String(location?.slug ?? ""),
    relationshipStage: String(instance.relationship_stage),
    source: input.source,
    intent,
    recent: recent ?? [],
  });
  const requestedLevel: MediaContentLevel = productionRequest.contentLevel;
  const contentPreferences = (profile.content_preferences ?? {}) as Record<
      string,
      unknown
    >,
    requestText = input.requestText ?? "";
  const policies = subjects.map((subject) => {
    const subjectTemplate = subject.together_character_templates as Record<
        string,
        unknown
      >,
      subjectVersion = (subject.together_character_versions ?? {}) as Record<
        string,
        unknown
      >,
      romanceAllowed = Boolean(contentPreferences.romanceEnabled !== false) &&
        ["flirting", "dating", "exclusive", "long_term"].includes(
          String(subject.relationship_stage),
        ),
      requestedForPolicy = requestedLevel === "romance" && !romanceAllowed
        ? "standard"
        : requestedLevel,
      boundaries = resolveCharacterMediaBoundaries(
        subjectVersion.content_boundaries,
        subjectTemplate.content_boundaries,
      ),
      characterAllowsRequestedLevel = requestedForPolicy === "standard"
        ? true
        : requestedForPolicy === "romance"
        ? boundaries.allows_romance !== false
        : requestedForPolicy === "suggestive"
        ? boundaries.allows_suggestive === true ||
          boundaries.allows_mature === true
        : requestedForPolicy === "mature"
        ? boundaries.allows_mature === true
        : boundaries.allows_explicit === true;
    return {
      characterInstanceId: String(subject.id),
      policy: resolveMediaContentPolicy({
        requestedLevel: requestedForPolicy,
        source: input.source,
        automatic: input.source !== "user_request",
        ageVerified: Boolean(profile?.age_verified_at),
        characterAge: Number(subjectTemplate.age),
        fictionalCharacter: isFictionalCompanion(
          subjectTemplate,
          subjectVersion,
        ),
        realPersonRequest: REAL_PERSON_PATTERN.test(requestText),
        nonConsensualRequest:
          /\b(non.?consensual|without (?:her|his|their) consent|secretly nude)\b/i
            .test(requestText),
        minorRelatedRequest: /\b(minor|underage|schoolgirl|schoolboy|child)\b/i
          .test(requestText),
        characterAllowsRequestedLevel,
        romanceEnabled: Boolean(contentPreferences.romanceEnabled !== false),
        suggestiveMediaEnabled:
          contentPreferences.suggestiveMediaEnabled === true,
        matureMediaEnabled: contentPreferences.matureMediaEnabled === true,
        explicitMediaEnabled: contentPreferences.explicitMediaEnabled === true,
        adultVideoEnabled: contentPreferences.adultVideoEnabled === true,
        mediaType: "image",
        adultMediaFeatureEnabled: envEnabled("KIVELLE_ADULT_MEDIA_ENABLED"),
      }),
    };
  });
  const denied = policies.find((item) => !item.policy.allowed);
  if (denied) {
    throw new AppError(
      "FORBIDDEN",
      mediaPolicyMessage(denied.policy.reasonCode),
      403,
    );
  }
  const levels: MediaContentLevel[] = [
      "standard",
      "romance",
      "suggestive",
      "mature",
      "explicit",
    ],
    contentLevel =
      policies.map((item) => item.policy.resolvedLevel as MediaContentLevel)
        .sort((a, b) => levels.indexOf(a) - levels.indexOf(b))[0] ?? "standard",
    policy = policies[0]!.policy;
  if (
    subjectIds.length > 1 &&
    levels.indexOf(contentLevel) < levels.indexOf(requestedLevel)
  ) {
    throw new AppError(
      "FORBIDDEN",
      "One selected companion isn't eligible for that photo yet.",
      403,
    );
  }
  const shotType = input.shotTypeOverride ?? intent.shotPreference ??
    String(
      opportunity?.shot_type ??
        (input.source === "user_request" ? "selfie" : "candid"),
    ) as ShotType;
  const composition = resolvePhotoComposition({
    source: input.source,
    shotType,
    requestText: productionRequest.requestText,
  });
  const aspectRatio = composition.aspectRatio;
  const qualityTier = input.qualityTierOverride ??
    (input.source === "date" || input.source === "moment" ||
        input.source === "story"
      ? "premium"
      : input.source === "user_request"
      ? "standard"
      : "economy");
  const outfitKey = await resolveOutfitKey(db, input, instance, now, place);
  const outfitDescription = input.companionResponseText
    ? extractPhotoWardrobeDescription(input.companionResponseText)
    : undefined;
  const worldId = effectiveWorldContainment.worldId;
  const environmentReferenceAssets = await snapshotReferenceAssets(db, {
    worldId,
    locationId,
    characterVersionIds: subjects.map((subject) =>
      String(subject.character_version_id)
    ),
  });
  const characterReferenceGroups = await Promise.all(
    subjects.map(async (subject) => ({
      characterInstanceId: String(subject.id),
      assets: (await snapshotReferenceAssets(db, {
        characterVersionId: String(subject.character_version_id),
      })).filter((asset) =>
        ["character_identity", "character_training", "outfit_continuity"]
          .includes(String(asset.role))
      ).map((asset): Record<string, unknown> => ({
        ...asset,
        subjectCharacterInstanceId: String(subject.id),
      })),
    })),
  );
  const referenceAssets = [
    ...characterReferenceGroups.flatMap((group) => group.assets),
    ...environmentReferenceAssets.filter((asset) =>
      !["character_identity", "character_training", "outfit_continuity"]
        .includes(String(asset.role))
    ),
  ];
  const visualIdentity = (characterVersion.visual_identity ?? {}) as Record<
      string,
      unknown
    >,
    identityReferencePaths = Array.isArray(visualIdentity.referenceStoragePaths)
      ? visualIdentity.referenceStoragePaths.map(String).filter(Boolean)
      : [];
  const missingReference = subjects.find((subject) => {
    const subjectVersion =
        (subject.together_character_versions ?? {}) as Record<string, unknown>,
      subjectIdentity = (subjectVersion.visual_identity ?? {}) as Record<
        string,
        unknown
      >,
      paths = Array.isArray(subjectIdentity.referenceStoragePaths)
        ? subjectIdentity.referenceStoragePaths
        : [];
    return !referenceAssets.some((asset) =>
      String(asset.role) === "character_identity" &&
      String(asset.subjectCharacterInstanceId) === String(subject.id)
    ) && !paths.length;
  });
  if (missingReference) {
    throw new AppError(
      "CHARACTER_REFERENCE_REQUIRED",
      "Each selected companion needs a canonical reference photo before a group photo can be generated.",
      409,
    );
  }
  const sceneBoundary = resolveMediaSceneBoundary({
    locationName: String(
      place?.location.name ?? location?.name ?? "the current canonical place",
    ),
    locationType: place?.location.type,
    category: String(place?.location.category ?? location?.category ?? ""),
    indoorOutdoor: place?.location.visualContext.indoorOutdoor,
  });
  const hasLocationReference = referenceAssets.some((asset) =>
      asset.role === "location_canonical" || asset.role === "location_alternate"
    ),
    hasWorldReference = sceneBoundary.setting !== "indoor" &&
      referenceAssets.some((asset) => asset.role === "world_canonical");
  const authorization = input.economicAuthorization;
  const mediaSubjects = subjects.map((subject) => {
    const subjectTemplate = subject.together_character_templates as Record<
        string,
        unknown
      >,
      presence = refreshedPresences.find((item) =>
        item.characterInstanceId === String(subject.id)
      )?.presence,
      relationship = relationshipByCharacterId.get(String(subject.id));
    return {
      characterInstanceId: String(subject.id),
      characterVersionId: String(subject.character_version_id),
      name: String(subjectTemplate.name),
      age: Number(subjectTemplate.age),
      relationshipStage: String(subject.relationship_stage),
      relationshipDirection: String(relationship?.recent_direction ?? "steady"),
      presence: presence
        ? {
          locationId: presence.locationId,
          activity: presence.activity,
          activityKey: presence.activityKey,
          mood: presence.mood,
          source: presence.source,
          resolvedAt: now.toISOString(),
        }
        : null,
    };
  });
  const metadata = {
    source: input.source,
    photoOpportunitySlug: opportunity?.slug ?? null,
    shotType,
    framing: subjectIds.length > 1
      ? "two-person composition with both companions equally prominent, both faces large enough to recognize, and neither person cropped out"
      : composition.framing,
    locationId: locationId ?? null,
    sceneSessionId: input.sceneSessionId ?? null,
    sceneActionId: input.sceneActionId ?? null,
    requestedContentLevel: requestedLevel,
    resolvedContentLevel: contentLevel,
    mediaPolicyReason: policy.reasonCode,
    productionMediaDowngraded: productionRequest.downgraded,
    productionMediaReason: productionRequest.reasonCode,
    mediaPolicyBySubject: policies.map((item) => ({
      characterInstanceId: item.characterInstanceId,
      reasonCode: item.policy.reasonCode,
      resolvedLevel: item.policy.resolvedLevel,
    })),
    qualityTier,
    aspectRatio,
    requestKey,
    requestIntent: { subject: intent.subject, confidence: intent.confidence },
    generationIntent: input.source === "user_request" && input.requestText
      ? {
        requestText: String(productionRequest.requestText ?? "").slice(0, 400),
        requestedContentLevel: requestedLevel,
      }
      : null,
    requestHint: safeRequestText(productionRequest.requestText),
    referenceAssets,
    mediaSubjects,
    subjectCount: subjectIds.length,
    groupSceneMode: stagedGroupPortrait
      ? "staged_group_portrait"
      : subjectIds.length > 1
      ? "co_present_group_photo"
      : "single_companion",
    characterReferenceRequired: true,
    photorealismRequired: true,
    sceneBoundary: sceneBoundary.setting,
    locationReferenceResolution: hasLocationReference
      ? "location"
      : hasWorldReference
      ? "world"
      : "text",
    location_reference_fallback: !hasLocationReference && hasWorldReference
      ? "world"
      : null,
    sceneSummary: subjectIds.length > 1
      ? `${
        mediaSubjects.map((item) => item.name).join(" and ")
      } in one two-person photograph.`
      : `${String(template.name)} ${
        shotType === "scene" ? "shared a view from" : "sent a photo while at"
      } ${
        String(place?.path ?? location?.name ?? "their current place")
      } during ${mediaActivity}.`,
    activity: mediaActivity,
    mood: mediaPresence.mood,
    presenceSource: mediaPresence.source,
    presenceResolvedAt: mediaPresence.resolvedAt ?? now.toISOString(),
    timeOfDay: place?.clock.daypart ?? timeOfDay(now),
    outfitKey,
    outfitDescription: outfitDescription ?? null,
    relationshipStage: String(instance.relationship_stage),
    relationshipDirection: String(
      relationshipByCharacterId.get(String(instance.id))?.recent_direction ??
        "steady",
    ),
    placeContext: place ? placeContextSnapshot(place) : null,
    worldContainment: effectiveWorldContainment,
    ...(authorization
      ? {
        mediaOfferId: authorization.mediaOfferId,
        creditTransactionId: authorization.creditTransactionId ?? null,
        creditCost: authorization.creditCost,
        creditAction: authorization.creditAction,
        creditRefunded: false,
        includedBenefit: Boolean(authorization.includedBenefit),
        includedBenefitType: authorization.includedBenefitType ?? null,
        dailyPhotoReservationKey:
          authorization.includedBenefitReservationKey ?? null,
        subscriptionTier: authorization.subscriptionTier,
        economicAuthorization: authorization.kind,
      }
      : {}),
  };
  const row = {
    user_id: input.userId,
    character_instance_id: input.characterInstanceId,
    subject_character_instance_ids: subjectIds,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    life_event_id: input.lifeEventId ?? null,
    date_session_id: input.dateSessionId ?? null,
    moment_id: input.momentId ?? null,
    story_arc_id: input.storyArcId ?? null,
    scene_session_id: input.sceneSessionId ?? null,
    scene_action_id: input.sceneActionId ?? null,
    shared_plan_id: input.sharedPlanId ?? null,
    media_offer_id: authorization?.mediaOfferId ?? null,
    world_id: worldId,
    location_id: locationId ?? null,
    media_type: "image",
    content_level: contentLevel,
    provider: configuredImageProvider()?.id ?? null,
    status: "queued",
    request_key: key,
    metadata,
  };
  const { data, error } = await db.from("together_generated_media").insert(row)
    .select("*").single();
  if (error) {
    const { data: race } = await db.from("together_generated_media").select("*")
      .eq("user_id", input.userId).eq("request_key", key).maybeSingle();
    if (race) return race;
    throw new AppError(
      "INTERNAL_ERROR",
      "The photo request could not be queued.",
      500,
      true,
    );
  }
  await track(db, input.userId, "media_queued", {
    mediaId: data.id,
    source: input.source,
    characterInstanceId: input.characterInstanceId,
    subjectCount: subjectIds.length,
    shotType,
    contentLevel,
    groupSceneMode: metadata.groupSceneMode,
    worldId,
    locationId: locationId ?? null,
    sceneResolutionReason: effectiveWorldContainment.resolutionReason,
    requestedSettingResolved: Boolean(
      effectiveWorldContainment.requestedSetting,
    ),
  });
  return data;
}

export function scorePhotoOpportunities(
  rows: Array<Record<string, unknown>>,
  context: {
    locationSlug: string;
    relationshipStage: string;
    source: MediaSource;
    intent: PhotoRequestIntent;
    recent: Array<Record<string, unknown>>;
  },
): Record<string, unknown> | null {
  const recentSlugs = new Set(
    context.recent.map((item) =>
      String(
        (item.metadata as Record<string, unknown>)?.photoOpportunitySlug ?? "",
      )
    ),
  );
  const stages = [
    "stranger",
    "acquaintance",
    "friend",
    "flirting",
    "dating",
    "exclusive",
    "long_term",
  ];
  return rows.map((row) => {
    const tags = Array.isArray(row.location_tags)
      ? row.location_tags.map(String)
      : [];
    const allowed = Array.isArray(row.relationship_stages)
      ? row.relationship_stages.map(String)
      : [];
    let score = context.source === "user_request" ? 8 : 0;
    if (tags.includes(context.locationSlug)) score += 6;
    else if (tags.length) score -= 3;
    if (!allowed.length || allowed.includes(context.relationshipStage)) {
      score += 2;
    } else score -= 8;
    if (
      context.intent.shotPreference &&
      row.shot_type === context.intent.shotPreference
    ) score += 4;
    if (recentSlugs.has(String(row.slug))) score -= 7;
    if (stages.indexOf(context.relationshipStage) < 0) score -= 10;
    return { row, score };
  }).sort((a, b) => b.score - a.score)[0]?.row ?? null;
}

async function resolveOutfitKey(
  db: SupabaseClient,
  input: QueueMediaInput,
  instance: Record<string, unknown>,
  now: Date,
  place: PlaceContext | null,
): Promise<string> {
  const linked = input.lifeEventId
    ? await db.from("together_life_events").select("metadata").eq(
      "id",
      input.lifeEventId,
    ).maybeSingle()
    : null;
  const existing =
    (linked?.data?.metadata as Record<string, unknown> | undefined)?.outfitKey;
  if (typeof existing === "string") return existing;
  const day = now.toISOString().slice(0, 10);
  const style = String(
    ((instance.together_character_versions as Record<string, unknown>)
      ?.visual_identity as Record<string, unknown> | undefined)?.fashionStyle ??
      "city-casual",
  ).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);
  const climate = String(place?.world.visualContext.climate ?? "temperate")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
  const key = `${day}-${climate}-${style || "city-casual"}`;
  if (input.lifeEventId) {
    await db.from("together_life_events").update({
      metadata: {
        ...((linked?.data?.metadata ?? {}) as Record<string, unknown>),
        outfitKey: key,
      },
    }).eq("id", input.lifeEventId).eq("user_id", input.userId);
  }
  return key;
}

export async function canonicalRequestForMedia(
  db: SupabaseClient,
  media: Record<string, unknown>,
): Promise<CanonicalImageGenerationRequest> {
  const subjectIds = normalizeMediaSubjectIds(
      String(media.character_instance_id),
      media.subject_character_instance_ids,
    ),
    subjectInstances = await loadValidatedMediaSubjects(db, {
      userId: String(media.user_id),
      characterInstanceId: String(media.character_instance_id),
      subjectCharacterInstanceIds: subjectIds,
      conversationId: typeof media.conversation_id === "string"
        ? media.conversation_id
        : undefined,
    }),
    instance = subjectInstances[0];
  if (!instance) {
    throw new AppError(
      "NOT_FOUND",
      "The companion for this photo is unavailable.",
      404,
    );
  }
  const template = instance.together_character_templates as Record<
    string,
    unknown
  >;
  const version = instance.together_character_versions as Record<
    string,
    unknown
  >;
  const identity = (version.visual_identity ?? {}) as Record<string, unknown>;
  if (Number(template.age) < 18) {
    throw new AppError(
      "FORBIDDEN",
      "Photo generation is unavailable for this character.",
      403,
    );
  }
  const meta = (media.metadata ?? {}) as Record<string, unknown>;
  const storedGenerationForWorld =
    meta.generationIntent && typeof meta.generationIntent === "object"
      ? meta.generationIntent as Record<string, unknown>
      : null;
  const storedLocationId = String(media.location_id ?? meta.locationId ?? "");
  const verifiedWorldContainment = await resolveCanonicalMediaWorld({
    db,
    characterVersionIds: subjectInstances.map((subject) =>
      String(subject.character_version_id)
    ),
    requestText: typeof storedGenerationForWorld?.requestText === "string"
      ? storedGenerationForWorld.requestText
      : undefined,
    authoritativeLocationId: storedLocationId || undefined,
    groupWorldId: String(media.world_id ?? "") || undefined,
  });
  const locationId = verifiedWorldContainment.locationId ?? storedLocationId;
  const { data: location } = locationId
    ? await db.from("together_locations").select("*").eq("id", locationId)
      .maybeSingle()
    : { data: null };
  const snapshot = (meta.placeContext ?? null) as Record<string, any> | null;
  const resolvedPlace = locationId
    ? await resolvePlaceContext({
      db,
      locationId,
      userId: String(media.user_id),
      characterInstanceId: String(media.character_instance_id),
    }).catch(() => null)
    : null;
  const historicalPlace = snapshot
    ? {
      contextVersion: 1 as const,
      world: {
        id: String(snapshot.worldId),
        slug: String(snapshot.worldSlug),
        name: String(snapshot.worldName),
        description: String(snapshot.worldDescription ?? ""),
        timezone: String(snapshot.clock?.timezone ?? "UTC"),
        accessType: String(snapshot.worldAccessType ?? "historical"),
        visualContext: snapshot.worldVisualContext ?? {},
      },
      location: {
        id: String(snapshot.locationId),
        slug: String(snapshot.locationSlug),
        name: String(snapshot.locationName),
        description: String(snapshot.locationDescription ?? ""),
        type: String(
          snapshot.locationType ?? "venue",
        ) as PlaceContext["location"]["type"],
        category: String(snapshot.locationCategory ?? ""),
        hours: snapshot.locationHours ?? null,
        possibleActivities: Array.isArray(snapshot.locationPossibleActivities)
          ? snapshot.locationPossibleActivities.map(String)
          : [],
        visualContext: snapshot.locationVisualContext ?? {},
        lore: snapshot.locationLore ?? {},
        ...(snapshot.locationVirtualType === "character_home"
          ? { virtualType: "character_home" as const }
          : {}),
        ...(snapshot.locationReferencePolicy
          ? {
            referencePolicy: String(snapshot.locationReferencePolicy) as
              | "text_only"
              | "optional"
              | "required",
          }
          : {}),
      },
      ancestry: Array.isArray(snapshot.ancestry) ? snapshot.ancestry : [],
      ...(snapshot.district ? { district: snapshot.district } : {}),
      adjacentDistricts: Array.isArray(snapshot.adjacentDistricts)
        ? snapshot.adjacentDistricts
        : [],
      nearby: Array.isArray(snapshot.nearby) ? snapshot.nearby : [],
      path: String(
        snapshot.path ?? snapshot.locationName ?? "Historical place",
      ),
      clock: snapshot.clock ??
        {
          timezone: "UTC",
          localIso: "",
          weekday: "",
          localTime: "",
          daypart: "unknown",
        },
    } as PlaceContext
    : null;
  const place = historicalPlace ?? resolvedPlace;
  const references: MediaReferenceImage[] = [];
  const snapshotted = Array.isArray(meta.referenceAssets)
    ? meta.referenceAssets as Array<Record<string, unknown>>
    : [];
  const selectedRows = await resolveSnapshottedReferenceRows(db, snapshotted, {
    characterVersionIds: subjectInstances.map((subject) =>
      String(subject.character_version_id)
    ),
    locationId: locationId || undefined,
    worldId: verifiedWorldContainment.worldId,
  });
  const versionToSubjectId = new Map(
    subjectInstances.map((
      subject,
    ) => [String(subject.character_version_id), String(subject.id)]),
  );
  for (const row of selectedRows) {
    const reference = await loadReferenceAsset(db, row);
    if (reference) {
      references.push({
        ...reference,
        ...(versionToSubjectId.has(String(row.character_version_id))
          ? {
            characterInstanceId: versionToSubjectId.get(
              String(row.character_version_id),
            ),
          }
          : {}),
      });
    }
  }
  for (const subject of subjectInstances) {
    const subjectVersion =
        (subject.together_character_versions ?? {}) as Record<string, unknown>,
      subjectIdentity = (subjectVersion.visual_identity ?? {}) as Record<
        string,
        unknown
      >,
      subjectPaths = Array.isArray(subjectIdentity.referenceStoragePaths)
        ? subjectIdentity.referenceStoragePaths.map(String).slice(0, 2)
        : [];
    if (
      !references.some((item) =>
        item.role === "character_identity" &&
        item.characterInstanceId === String(subject.id)
      )
    ) {
      for (const path of subjectPaths) {
        const reference = await loadStorageReference(db, {
          role: "character_identity",
          bucket: "kivelle-character-reference",
          path,
          name: path.split("/").at(-1) ?? "reference.png",
        });
        if (reference) {
          references.push({
            ...reference,
            characterInstanceId: String(subject.id),
          });
        }
      }
    }
  }
  const missingIdentity = subjectInstances.find((subject) =>
    !hasUsableCharacterIdentityReference(
      references.filter((reference) =>
        reference.characterInstanceId === String(subject.id)
      ),
    )
  );
  if (missingIdentity) {
    throw new AppError(
      "CHARACTER_REFERENCE_REQUIRED",
      "A selected companion reference photo could not be prepared. No ungrounded group image was sent to the provider.",
      409,
      true,
    );
  }
  const outfitKey = String(meta.outfitKey ?? ""),
    outfitDescription = typeof meta.outfitDescription === "string"
      ? meta.outfitDescription
      : undefined;
  if (
    outfitKey && !outfitDescription &&
    !references.some((item) => item.role === "outfit_continuity")
  ) {
    const { data: previous } = await db.from("together_generated_media").select(
      "id,storage_path,content_type,metadata",
    ).eq("user_id", String(media.user_id)).eq(
      "character_instance_id",
      String(media.character_instance_id),
    ).eq("media_type", "image").eq("status", "ready").neq(
      "id",
      String(media.id),
    ).order("created_at", { ascending: false }).limit(8);
    const match = (previous ?? []).find((item) =>
      String((item.metadata as Record<string, unknown>)?.outfitKey ?? "") ===
        outfitKey && item.storage_path
    );
    if (match) {
      const reference = await loadStorageReference(db, {
        role: "outfit_continuity",
        bucket: "together-user-media",
        path: String(match.storage_path),
        name: `outfit-${match.id}.jpg`,
        contentType: String(match.content_type ?? "image/jpeg"),
      });
      if (reference) references.push(reference);
    }
  }
  let editSource: MediaReferenceImage | undefined;
  if (meta.generationKind === "photo_edit") {
    const parentId = String(media.parent_media_id ?? meta.parentMediaId ?? "");
    if (!parentId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The source photo for this edit is missing.",
        422,
      );
    }
    const { data: parent } = await db.from("together_generated_media").select(
      "id,storage_path,content_type",
    ).eq("id", parentId).eq("user_id", String(media.user_id)).eq(
      "character_instance_id",
      String(media.character_instance_id),
    ).eq("media_type", "image").eq("status", "ready").maybeSingle();
    if (!parent?.storage_path) {
      throw new AppError(
        "NOT_FOUND",
        "The source photo for this edit is unavailable.",
        404,
      );
    }
    editSource = await loadStorageReference(db, {
      role: "previous_media",
      bucket: "together-user-media",
      path: String(parent.storage_path),
      name: `source-${parent.id}.jpg`,
      contentType: String(parent.content_type ?? "image/jpeg"),
    }) ?? undefined;
    if (!editSource) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The source photo could not be prepared for editing.",
        500,
        true,
      );
    }
  }
  const mediaProfile = await resolveCharacterMediaProfile(
    db,
    String(instance.character_version_id),
  );
  const storedGenerationIntent =
    meta.generationIntent && typeof meta.generationIntent === "object"
      ? meta.generationIntent as Record<string, unknown>
      : null;
  const productionRequest = resolveProductionSafePhotoRequest({
    requestText: typeof storedGenerationIntent?.requestText === "string"
      ? storedGenerationIntent.requestText
      : undefined,
    requestedContentLevel: String(
      storedGenerationIntent?.requestedContentLevel ?? media.content_level ??
        "standard",
    ) as MediaContentLevel,
  });
  const sceneBoundary = resolveMediaSceneBoundary({
    locationName: String(
      place?.location.name ?? location?.name ?? "the current canonical place",
    ),
    locationType: place?.location.type,
    category: String(place?.location.category ?? location?.category ?? ""),
    indoorOutdoor: place?.location.visualContext.indoorOutdoor,
  });
  const hasExactLocationReference = references.some((item) =>
    item.role === "location_environment"
  );
  const groundedReferences = sceneBoundary.setting === "indoor" &&
      hasExactLocationReference
    ? references.filter((item) => item.role !== "world_environment")
    : references;
  const referenceLimit = subjectIds.length > 1 ? 5 : 4,
    selectedReferences = selectMediaReferencesForSubjects({
      references: groundedReferences,
      subjectIds,
      editSource,
      limit: referenceLimit,
    });
  const storedMediaSubjects = Array.isArray(meta.mediaSubjects)
    ? meta.mediaSubjects as Array<Record<string, any>>
    : [];
  const canonicalSubjects: CanonicalMediaSubject[] = subjectInstances.map(
    (subject) => {
      const subjectTemplate = subject.together_character_templates as Record<
          string,
          unknown
        >,
        subjectVersion = (subject.together_character_versions ?? {}) as Record<
          string,
          unknown
        >,
        subjectIdentity = (subjectVersion.visual_identity ?? {}) as Record<
          string,
          unknown
        >,
        subjectPaths = Array.isArray(subjectIdentity.referenceStoragePaths)
          ? subjectIdentity.referenceStoragePaths.map(String)
          : [],
        stored = storedMediaSubjects.find((item) =>
          String(item.characterInstanceId) === String(subject.id)
        );
      return {
        characterInstanceId: String(subject.id),
        companion: {
          templateId: String(subject.character_template_id),
          versionId: String(subject.character_version_id),
          name: String(subjectTemplate.name),
          age: Number(subjectTemplate.age),
        },
        visualIdentity: canonicalVisualIdentity(
          subjectIdentity,
          subjectTemplate,
          subjectPaths,
        ),
        referenceImages: selectedReferences.filter((reference) =>
          reference.characterInstanceId === String(subject.id)
        ),
        presence: stored?.presence ?? undefined,
        outfitKey: typeof stored?.outfitKey === "string"
          ? stored.outfitKey
          : undefined,
        outfitDescription: typeof stored?.outfitDescription === "string"
          ? stored.outfitDescription
          : undefined,
      };
    },
  );
  return {
    mediaId: String(media.id),
    ...(meta.generationKind === "photo_edit"
      ? { generationKind: "photo_edit" as const, sourceImage: editSource }
      : {}),
    companion: canonicalSubjects[0]!.companion,
    visualIdentity: canonicalSubjects[0]!.visualIdentity,
    subjects: canonicalSubjects,
    referenceImages: selectedReferences,
    context: {
      place: place ?? undefined,
      location: location
        ? {
          id: String(location.id),
          name: String(location.name),
          description: String(location.description),
          category: String(location.category),
        }
        : undefined,
      activity: String(meta.activity ?? instance.current_activity),
      mood: String(meta.mood ?? instance.current_mood),
      timeOfDay: String(meta.timeOfDay ?? place?.clock.daypart ?? timeOfDay()),
      outfitKey: outfitKey || undefined,
      outfitDescription,
      ...(typeof meta.groupSceneMode === "string"
        ? { groupSceneMode: meta.groupSceneMode }
        : {}),
      worldId: verifiedWorldContainment.worldId,
      worldContainment: {
        ...verifiedWorldContainment,
        ...(place
          ? { locationName: place.location.name, locationPath: place.path }
          : {}),
      },
    },
    composition: {
      shotType: String(meta.shotType ?? "candid") as ShotType,
      aspectRatio: String(meta.aspectRatio ?? "4:5"),
      framing: typeof meta.framing === "string" ? meta.framing : undefined,
    },
    contentLevel: productionRequest.contentLevel,
    qualityTier: String(
      meta.qualityTier ?? "standard",
    ) as CanonicalImageGenerationRequest["qualityTier"],
    ...(productionRequest.requestText
      ? {
        generationIntent: {
          requestText: productionRequest.requestText.slice(0, 400),
          requestedContentLevel: productionRequest.contentLevel,
        },
      }
      : {}),
    ...(subjectIds.length === 1 && mediaProfile ? { mediaProfile } : {}),
  };
}

function canonicalVisualIdentity(
  identity: Record<string, unknown>,
  template: Record<string, unknown>,
  paths: string[],
): CompanionVisualIdentity {
  return {
    canonicalDescription: String(
      identity.canonicalDescription ?? template.biography ?? template.name,
    ),
    age: Number(identity.age ?? template.age),
    referenceStoragePaths: paths,
    hair: String(identity.hair ?? ""),
    eyes: String(identity.eyes ?? ""),
    skinTone: String(identity.skinTone ?? ""),
    build: String(identity.build ?? ""),
    approximateHeight: String(identity.approximateHeight ?? ""),
    identifyingFeatures: Array.isArray(identity.identifyingFeatures)
      ? identity.identifyingFeatures.map(String)
      : [],
    tattoos: Array.isArray(identity.tattoos)
      ? identity.tattoos.map(String)
      : [],
    piercings: Array.isArray(identity.piercings)
      ? identity.piercings.map(String)
      : [],
    fashionStyle: String(identity.fashionStyle ?? ""),
    recurringAccessories: Array.isArray(identity.recurringAccessories)
      ? identity.recurringAccessories.map(String)
      : [],
    visualDoNotChange: Array.isArray(identity.visualDoNotChange)
      ? identity.visualDoNotChange.map(String)
      : [],
    photoStyle: (identity.photoStyle ?? {}) as Record<string, unknown>,
  };
}

export async function snapshotReferenceAssets(
  db: SupabaseClient,
  input: {
    characterVersionId?: string;
    characterVersionIds?: string[];
    worldId?: string;
    locationId?: string;
  },
): Promise<Array<Record<string, unknown>>> {
  const filters = [
    input.characterVersionId
      ? `character_version_id.eq.${input.characterVersionId}`
      : "",
    input.locationId ? `location_id.eq.${input.locationId}` : "",
    input.worldId ? `world_id.eq.${input.worldId}` : "",
  ].filter(Boolean).join(",");
  if (!filters) return [];
  const { data } = await db.from("together_media_reference_assets").select(
    "id,asset_role,revision,storage_bucket,storage_path,character_version_id,location_id,world_id",
  ).eq("active", true).or(filters).order("revision", { ascending: false });
  const scoped = input.worldId
    ? validateReferenceAssetWorldScope(data ?? [], {
      worldId: input.worldId,
      locationId: input.locationId,
      characterVersionIds: input.characterVersionIds ??
        (input.characterVersionId ? [input.characterVersionId] : []),
    })
    : data ?? [];
  const seen = new Set<string>();
  return scoped.filter((row) => {
    const role = String(row.asset_role);
    if (
      seen.has(role) &&
      !["character_training", "location_alternate"].includes(role)
    ) return false;
    seen.add(role);
    return true;
  }).slice(0, 8).map((row) => ({
    assetId: row.id,
    role: row.asset_role,
    revision: row.revision,
    bucket: row.storage_bucket,
    path: row.storage_path,
  }));
}

async function resolveSnapshottedReferenceRows(
  db: SupabaseClient,
  snapshot: Array<Record<string, unknown>>,
  scope: {
    characterVersionIds: string[];
    locationId?: string;
    worldId?: string;
  },
): Promise<Array<Record<string, unknown>>> {
  const ids = snapshot.map((item) => String(item.assetId ?? "")).filter(
    Boolean,
  );
  if (ids.length) {
    const { data } = await db.from("together_media_reference_assets").select(
      "*",
    ).in("id", ids);
    const byId = new Map((data ?? []).map((row) => [String(row.id), row])),
      snapshotById = new Map(
        snapshot.map((item) => [String(item.assetId ?? ""), item]),
      );
    const resolved = ids.map((id) => {
      const row = byId.get(id), stored = snapshotById.get(id);
      return row
        ? {
          ...row,
          ...(stored?.subjectCharacterInstanceId
            ? {
              subjectCharacterInstanceId: String(
                stored.subjectCharacterInstanceId,
              ),
            }
            : {}),
        }
        : null;
    }).filter(Boolean) as Array<Record<string, unknown>>;
    return scope.worldId
      ? validateReferenceAssetWorldScope(resolved, {
        worldId: scope.worldId,
        locationId: scope.locationId,
        characterVersionIds: scope.characterVersionIds,
      })
      : resolved;
  }
  const filters = [
    ...scope.characterVersionIds.map((id) =>
      `character_version_id.eq.${id}`
    ),
    scope.locationId ? `location_id.eq.${scope.locationId}` : "",
    scope.worldId ? `world_id.eq.${scope.worldId}` : "",
  ].filter(Boolean).join(",");
  if (!filters) return [];
  const { data } = await db.from("together_media_reference_assets").select("*")
    .eq("active", true).or(filters).order("revision", { ascending: false });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return scope.worldId
    ? validateReferenceAssetWorldScope(rows, {
      worldId: scope.worldId,
      locationId: scope.locationId,
      characterVersionIds: scope.characterVersionIds,
    })
    : rows;
}

async function loadReferenceAsset(
  db: SupabaseClient,
  row: Record<string, unknown>,
): Promise<MediaReferenceImage | null> {
  const role = referenceRole(String(row.asset_role)),
    bucket = String(row.storage_bucket ?? ""),
    path = String(row.storage_path ?? "");
  if (!role || !bucket || !path) return null;
  const reference = await loadStorageReference(db, {
    role,
    bucket,
    path,
    name: String(row.source_key ?? path.split("/").at(-1) ?? "reference"),
    contentType: String(row.content_type ?? "image/jpeg"),
    assetId: String(row.id),
    revision: Number(row.revision ?? 1),
  });
  return reference
    ? {
      ...reference,
      ...(row.subjectCharacterInstanceId
        ? { characterInstanceId: String(row.subjectCharacterInstanceId) }
        : {}),
    }
    : null;
}

async function loadStorageReference(
  db: SupabaseClient,
  input: {
    role: MediaReferenceImage["role"];
    bucket: string;
    path: string;
    name: string;
    contentType?: string;
    assetId?: string;
    revision?: number;
  },
): Promise<MediaReferenceImage | null> {
  const [{ data: signed }, { data: blob }] = await Promise.all([
    db.storage.from(input.bucket).createSignedUrl(input.path, 900),
    db.storage.from(input.bucket).download(input.path),
  ]);
  if (!signed?.signedUrl && !blob) return null;
  return {
    role: input.role,
    signedUrl: signed?.signedUrl,
    bytes: blob ? new Uint8Array(await blob.arrayBuffer()) : undefined,
    contentType: blob?.type || input.contentType || "image/jpeg",
    name: input.name,
    assetId: input.assetId,
    revision: input.revision,
    storageBucket: input.bucket,
    storagePath: input.path,
  };
}

async function resolveCharacterMediaProfile(
  db: SupabaseClient,
  characterVersionId: string,
): Promise<CanonicalImageGenerationRequest["mediaProfile"] | undefined> {
  if (!envEnabled("KIVELLE_WAVESPEED_LORA_ENABLED")) return undefined;
  const { data } = await db.from("together_character_media_profiles").select(
    "*",
  ).eq("character_version_id", characterVersionId).eq("status", "ready").order(
    "source_revision",
    { ascending: false },
  ).limit(1).maybeSingle();
  if (!data?.model_storage_path) return undefined;
  const bucket = String(data.model_storage_bucket ?? "kivelle-model-assets"),
    { data: signed } = await db.storage.from(bucket).createSignedUrl(
      String(data.model_storage_path),
      900,
    );
  if (!signed?.signedUrl) return undefined;
  return {
    id: String(data.id),
    provider: String(data.provider),
    modelFamily: String(data.model_family),
    modelUrl: signed.signedUrl,
    triggerWord: typeof data.trigger_word === "string"
      ? data.trigger_word
      : undefined,
    revision: Number(data.source_revision ?? 1),
  };
}

function sortReferences(
  references: MediaReferenceImage[],
): MediaReferenceImage[] {
  const priority: Record<MediaReferenceImage["role"], number> = {
    character_identity: 0,
    location_environment: 1,
    world_environment: 2,
    outfit_continuity: 3,
    previous_media: 4,
    character_training: 5,
  };
  return [...references].sort((a, b) => priority[a.role] - priority[b.role]);
}
export function selectMediaReferencesForSubjects(
  input: {
    references: MediaReferenceImage[];
    subjectIds: string[];
    editSource?: MediaReferenceImage;
    limit: number;
  },
): MediaReferenceImage[] {
  const identities = input.subjectIds.map((subjectId) =>
    input.references.find((reference) =>
      reference.role === "character_identity" &&
      reference.characterInstanceId === subjectId
    )
  ).filter((reference): reference is MediaReferenceImage => Boolean(reference));
  const selectedKeys = new Set(identities.map(referenceKey));
  const supporting = sortReferences(input.references).filter((reference) =>
    reference.role !== "character_identity" &&
    reference.role !== "previous_media" &&
    !selectedKeys.has(referenceKey(reference))
  );
  return [
    ...(input.editSource ? [input.editSource] : []),
    ...identities,
    ...supporting,
  ].slice(0, input.limit);
}
function referenceKey(reference: MediaReferenceImage): string {
  return String(
    reference.assetId ?? reference.signedUrl ?? reference.storagePath ??
      reference.name,
  );
}
function referenceRole(value: string): MediaReferenceImage["role"] | null {
  return value === "location_canonical" || value === "location_alternate"
    ? "location_environment"
    : value === "world_canonical"
    ? "world_environment"
    : [
        "character_identity",
        "character_training",
        "outfit_continuity",
        "previous_media",
      ].includes(value)
    ? value as MediaReferenceImage["role"]
    : null;
}
function contentLevelPrompt(level: MediaContentLevel): string {
  return level === "standard"
    ? "Everyday non-explicit life photo."
    : level === "romance"
    ? "Warm, affectionate, non-explicit romantic tone appropriate to the established relationship."
    : level === "suggestive"
    ? "Suggestive adult-only tone within approved character boundaries; no explicit sexual activity."
    : level === "mature"
    ? "Mature adult-only sensual tone within approved character boundaries and the normalized user intent."
    : "Explicit adult-only fictional content, only as allowed by the approved normalized request and character boundaries.";
}
function envEnabled(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (Deno.env.get(name) ?? "false").toLowerCase(),
  );
}
function mediaPolicyMessage(reason: string): string {
  if (reason === "production_content_ceiling") {
    return "Kivelle supports everyday and romantic photos, not nude, sexual, or explicit imagery.";
  }
  if (reason === "age_verification_required") {
    return "Age verification is required for companion media.";
  }
  if (reason === "adult_character_required") {
    return "Media generation requires an adult fictional character.";
  }
  if (reason === "real_person_likeness") {
    return "Kivelle can create an original fictional appearance, but cannot copy a real person.";
  }
  if (reason === "consent_boundary") {
    return "That photo request cannot be generated because it does not meet Kivelle’s consent requirements.";
  }
  if (reason === "character_boundary") {
    return "This character does not support that kind of photo.";
  }
  if (reason === "romance_disabled") {
    return "Turn on Romance in Content settings to request romantic or adult photos.";
  }
  if (reason === "automatic_adult_media_disabled") {
    return "Higher-intensity media is never generated automatically.";
  }
  if (reason === "adult_media_feature_disabled") {
    return "Adult photo generation is not available right now.";
  }
  if (reason === "suggestive_media_disabled") {
    return "Turn on Suggestive generated photos in Content settings to request this photo.";
  }
  if (reason === "mature_media_disabled") {
    return "Turn on Mature generated photos in Content settings to request this photo.";
  }
  if (reason === "explicit_media_disabled") {
    return "Turn on Explicit generated photos in Content settings to request this photo.";
  }
  if (reason === "adult_video_disabled") {
    return "Adult video generation is turned off in Content settings.";
  }
  return "That photo request cannot be generated.";
}

export async function kickMediaDispatcher(): Promise<void> {
  const secret = Deno.env.get("TOGETHER_MEDIA_DISPATCH_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  if (!secret || !url) {
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "media_dispatch_kick_skipped",
        reason: "missing_configuration",
      }),
    );
    return;
  }
  const db = adminClient();
  const { data: dispatchToken, error: signalError } = await db.rpc(
    "kivelle_claim_media_dispatch_signal",
    { p_cooldown_ms: 1500 },
  );
  if (signalError) {
    console.warn(JSON.stringify({ level: "warn", operation: "media_dispatch_signal_failed" }));
  } else if (!dispatchToken) return;
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `${url}/functions/v1/together-media-dispatch`,
      {
        method: "POST",
        headers: {
          "x-together-dispatch-secret": secret,
          "Content-Type": "application/json",
        },
        body: '{"limit":10}',
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      if (dispatchToken) await db.rpc("kivelle_release_media_dispatch_signal", { p_token: dispatchToken });
      console.warn(
        JSON.stringify({
          level: "warn",
          operation: "media_dispatch_kick_failed",
          status: response.status,
        }),
      );
    }
  } catch (error) {
    if (dispatchToken) await db.rpc("kivelle_release_media_dispatch_signal", { p_token: dispatchToken });
    console.warn(
      JSON.stringify({
        level: "warn",
        operation: "media_dispatch_kick_failed",
        errorCode: error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : "network_error",
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}
