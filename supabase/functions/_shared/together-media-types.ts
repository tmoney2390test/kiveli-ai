import type { PlaceContext } from './together-place.ts';
import type { MediaPresenceState } from '../../../packages/together-domain/src/media.ts';
import type { MediaWorldContainment } from './together-media-world.ts';
import type { MediaCaptureLighting } from './together-media-time.ts';

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
    custom?: boolean;
  };
  visualIdentity: CompanionVisualIdentity;
  referenceImages: MediaReferenceImage[];
  presence?: MediaPresenceState;
  outfitKey?: string;
  outfitDescription?: string;
};

export type CanonicalImageGenerationRequest = {
  mediaId: string;
  adultPipelineAuthorized?: boolean;
  anonymousAdultPartner?: boolean;
  generationKind?: "companion_photo" | "creator_identity" | "photo_edit";
  sourceImage?: MediaReferenceImage;
  companion: {
    templateId: string;
    versionId: string;
    name: string;
    age: number;
    custom?: boolean;
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
  adultPipelineAuthorized?: boolean;
  adultWebSessionId?: string|null;
};
