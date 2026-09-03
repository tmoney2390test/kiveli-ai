import { z } from 'zod';
import { AppError } from './types.ts';
import { envBoolean, envNumber } from './wavespeed.ts';

export const VIDEO_MODEL_KEYS = [
  'seedance-1-5-pro-sfw',
  'ltx-2-3-sfw',
  'minimax-h3-sfw',
  'seedance-2-0-mini-sfw',
  'seedance-2-0-fast-sfw',
  'seedance-2-0-sfw',
  'seedance-2-5-sfw',
  'vidu-q3-sfw',
  'wan-2-7-sfw',
  'wan-2-6-sfw',
  'wan-2-2-sfw',
  'seedance-1-5-pro-spicy',
  'ltx-2-3-spicy',
  'minimax-h3-spicy',
  'seedance-2-0-mini-spicy',
  'seedance-2-0-fast-spicy',
  'seedance-2-0-spicy',
  'seedance-2-5-spicy',
  'vidu-q3-spicy',
  'wan-2-7-spicy',
  'wan-2-6-spicy',
  'wan-2-2-spicy',
] as const;
export type VideoModelKey = typeof VIDEO_MODEL_KEYS[number];

export const VIDEO_ROUTE_IDS = VIDEO_MODEL_KEYS;
export type VideoRouteId = VideoModelKey;
export const VIDEO_RESOLUTIONS = ['480p', '540p', '720p', '768p', '1080p', '4k'] as const;
export type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
export const VIDEO_DURATIONS = Array.from({ length: 20 }, (_, index) => index + 1);
export type VideoDurationSeconds = number;
export type VideoSourceMode = 'existing_photo' | 'canonical_references' | 'generated_first_frame';
export const MOTION_PRESETS = ['subtle', 'playful', 'cinematic'] as const;
export type VideoMotionPreset = typeof MOTION_PRESETS[number];
export type VideoAspectRatio = '9:16' | '16:9';
export type VideoAudioMode = 'toggleable' | 'always' | 'none' | 'reference_only';
export type VideoUiGroup = 'recommended' | 'alternatives' | 'experimental';
export type VideoConsumerTier = 'standard' | 'premium' | 'sound' | 'silent';
export type VideoSelectorMode = 'off' | 'testers' | 'all';
export type VideoContentClass = 'sfw' | 'adult_capable';

export const VIDEO_SUBMISSION_ATTEMPT_RATE_LIMIT = {
  action: 'together_video_submit_attempt',
  limit: 60,
  windowSeconds: 15 * 60,
  message: 'Several video requests were submitted very quickly. Wait a moment and try again.',
} as const;

type PerSecondPricing = { kind: 'per_second'; byResolution: Record<string, number>; soundMultiplier?: number };
type FixedPricing = { kind: 'fixed'; byCombination: Record<string, number> };
type VideoPricing = PerSecondPricing | FixedPricing;

export type VideoRouteDefinition = {
  id: VideoRouteId;
  internalModelKey: VideoModelKey;
  provider: 'wavespeed';
  model: string;
  displayName: string;
  description: string;
  contentClass: VideoContentClass;
  contentLabel: string;
  modelFamily: string;
  badge: string;
  badges: readonly string[];
  uiGroup: VideoUiGroup;
  mediaMode: 'image_to_video';
  sourceModes: readonly VideoSourceMode[];
  allowedDurations: readonly number[];
  defaultDuration: number;
  supportedResolutions: readonly VideoResolution[];
  defaultResolution: VideoResolution;
  supportedAspectRatios: readonly VideoAspectRatio[];
  aspectRatioBehavior: 'source' | 'selectable';
  referenceImageRequirements: { source: 1; canonicalCharacterMin: 0; canonicalCharacterMax: 0 };
  audioMode: VideoAudioMode;
  lastFrameSupport: boolean;
  pricing: VideoPricing;
  estimatedWaitSeconds: { min: number; max: number; median: number };
  timeoutSeconds: number;
  enabled: boolean;
  selectable: boolean;
  experimental: boolean;
  testingOnly: true;
  payloadBuilderId: VideoModelKey;
  concurrencyLimit: number;
  futureConsumerTier: VideoConsumerTier;
};

export type SafeVideoRouteOption = {
  id: string;
  modelKey?: VideoModelKey;
  modelEndpoint?: string;
  provider: 'wavespeed';
  displayName: string;
  description: string;
  contentClass: VideoContentClass;
  contentLabel: string;
  modelFamily: string;
  badge: string;
  badges: readonly string[];
  uiGroup: VideoUiGroup;
  mediaMode: 'image_to_video';
  sourceModes: readonly VideoSourceMode[];
  durationSeconds: number;
  allowedDurations: readonly number[];
  resolution: VideoResolution;
  supportedResolutions: readonly VideoResolution[];
  supportedAspectRatios: readonly VideoAspectRatio[];
  aspectRatioBehavior: 'source' | 'selectable';
  referenceImageRequirements: VideoRouteDefinition['referenceImageRequirements'];
  audioMode: VideoAudioMode;
  audioLabel: string;
  lastFrameSupport: boolean;
  estimatedWaitSeconds: VideoRouteDefinition['estimatedWaitSeconds'];
  creditQuotes: Record<string, number>;
  providerCostQuotes: Record<string, number>;
  rawModelNamesExposed: boolean;
  experimental: boolean;
  testingOnly: true;
  futureConsumerTier: VideoConsumerTier;
};

export type VideoSettings = { resolution: VideoResolution; duration: number; sound: boolean };
export type VideoPayloadInput = VideoSettings & {
  sourceImageUrl?: string;
  lastImageUrl?: string;
  canonicalReferences?: Array<{ url: string; role: 'character_identity' | 'location_environment' | 'world_environment' | 'outfit_continuity' }>;
  sourceAspectRatio: VideoAspectRatio;
  motionPreset: VideoMotionPreset;
  userPrompt?: string;
  contentLevel?: 'standard' | 'romance' | 'suggestive' | 'mature' | 'explicit';
  adultAuthorized?: boolean;
  anonymousAdultPartner?: boolean;
  context?: { companionName?: string; locationName?: string; activity?: string };
};

const allDurations = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
const routeEnvName = (key: VideoModelKey) => `KIVELLE_VIDEO_MODEL_${key.replaceAll('-', '_').toUpperCase()}_ENABLED`;
const routeConcurrencyName = (key: VideoModelKey) => `KIVELLE_VIDEO_MODEL_${key.replaceAll('-', '_').toUpperCase()}_CONCURRENCY`;
const enabled = (key: VideoModelKey) => envBoolean(routeEnvName(key), true);
const concurrency = (key: VideoModelKey) => Math.max(1, Math.min(8, Math.floor(envNumber(routeConcurrencyName(key), 2))));

type AdultVideoModelKey = Extract<VideoModelKey, `${string}-spicy`>;
type CatalogSeed = Omit<VideoRouteDefinition, 'id' | 'internalModelKey' | 'provider' | 'mediaMode' | 'sourceModes' | 'referenceImageRequirements' | 'enabled' | 'selectable' | 'testingOnly' | 'payloadBuilderId' | 'concurrencyLimit' | 'contentClass' | 'contentLabel' | 'modelFamily'> & { id: AdultVideoModelKey };

const ADULT_CAPABLE_CATALOG: CatalogSeed[] = [
  {
    id: 'seedance-1-5-pro-spicy', model: 'bytedance/seedance-v1.5-pro/image-to-video-spicy', displayName: 'Seedance 1.5 Pro Spicy', description: 'Recommended balance', badge: 'Recommended', badges: ['Sound', '1080p'], uiGroup: 'recommended',
    allowedDurations: [5, 10], defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'toggleable', lastFrameSupport: false,
    pricing: { kind: 'per_second', byResolution: { '480p': .012, '720p': .026, '1080p': .052 }, soundMultiplier: 2 }, estimatedWaitSeconds: { min: 25, max: 180, median: 70 }, timeoutSeconds: 1800, experimental: false, futureConsumerTier: 'standard',
  },
  {
    id: 'ltx-2-3-spicy', model: 'wavespeed-ai/ltx-2.3-spicy/image-to-video', displayName: 'LTX 2.3 Spicy', description: 'Budget video with sound', badge: 'Budget · sound', badges: ['Budget', 'Native stereo', '1080p'], uiGroup: 'recommended',
    allowedDurations: allDurations(3, 20), defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'always', lastFrameSupport: false,
    pricing: { kind: 'per_second', byResolution: { '480p': .02, '720p': .04, '1080p': .06 } }, estimatedWaitSeconds: { min: 20, max: 150, median: 43 }, timeoutSeconds: 1800, experimental: false, futureConsumerTier: 'sound',
  },
  {
    id: 'minimax-h3-spicy', model: 'wavespeed-ai/minimax-h3/image-to-video-spicy', displayName: 'MiniMax H3 Spicy', description: 'New native-audio model', badge: 'Native stereo', badges: ['Native stereo', 'Last-frame support'], uiGroup: 'recommended',
    allowedDurations: allDurations(3, 15), defaultDuration: 5, supportedResolutions: ['480p', '768p'], defaultResolution: '768p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'always', lastFrameSupport: true,
    pricing: { kind: 'per_second', byResolution: { '480p': .04, '768p': .08 } }, estimatedWaitSeconds: { min: 50, max: 600, median: 180 }, timeoutSeconds: 3600, experimental: false, futureConsumerTier: 'sound',
  },
  {
    id: 'seedance-2-5-spicy', model: 'bytedance/seedance-2.5/image-to-video-spicy', displayName: 'Seedance 2.5 Spicy', description: 'Premium quality', badge: 'Premium', badges: ['Premium', 'Sound', '4K', 'Last-frame support'], uiGroup: 'recommended',
    allowedDurations: allDurations(4, 15), defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p', '4k'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'toggleable', lastFrameSupport: true,
    pricing: { kind: 'per_second', byResolution: { '480p': .18, '720p': .36, '1080p': .90, '4k': 1.80 } }, estimatedWaitSeconds: { min: 45, max: 600, median: 180 }, timeoutSeconds: 3600, experimental: false, futureConsumerTier: 'premium',
  },
  {
    id: 'seedance-2-0-mini-spicy', model: 'bytedance/seedance-2.0-mini/image-to-video-spicy', displayName: 'Seedance 2.0 Mini Spicy', description: 'Flexible midrange', badge: 'Flexible', badges: ['Sound', '4K', 'Last-frame support'], uiGroup: 'alternatives',
    allowedDurations: allDurations(4, 15), defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p', '4k'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'selectable', audioMode: 'toggleable', lastFrameSupport: true,
    pricing: { kind: 'per_second', byResolution: { '480p': .06, '720p': .12, '1080p': .30, '4k': .60 } }, estimatedWaitSeconds: { min: 40, max: 480, median: 156 }, timeoutSeconds: 3600, experimental: false, futureConsumerTier: 'standard',
  },
  {
    id: 'vidu-q3-spicy', model: 'vidu/q3/image-to-video-spicy', displayName: 'Vidu Q3 Spicy', description: 'Motion and audio controls', badge: 'Motion control', badges: ['Sound', '1080p'], uiGroup: 'alternatives',
    allowedDurations: allDurations(1, 16), defaultDuration: 5, supportedResolutions: ['540p', '720p', '1080p'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'toggleable', lastFrameSupport: false,
    pricing: { kind: 'per_second', byResolution: { '540p': .07, '720p': .15, '1080p': .16 } }, estimatedWaitSeconds: { min: 25, max: 300, median: 90 }, timeoutSeconds: 2400, experimental: false, futureConsumerTier: 'sound',
  },
  {
    id: 'wan-2-7-spicy', model: 'alibaba/wan-2.7/image-to-video-spicy', displayName: 'Wan 2.7 Spicy', description: 'High-quality silent video', badge: 'Silent', badges: ['Silent only', '1080p'], uiGroup: 'alternatives',
    allowedDurations: [5, 10, 15], defaultDuration: 5, supportedResolutions: ['720p', '1080p'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'reference_only', lastFrameSupport: false,
    pricing: { kind: 'per_second', byResolution: { '720p': .10, '1080p': .15 } }, estimatedWaitSeconds: { min: 45, max: 420, median: 114 }, timeoutSeconds: 3600, experimental: false, futureConsumerTier: 'silent',
  },
  {
    id: 'wan-2-2-spicy', model: 'wavespeed-ai/wan-2.2-spicy/image-to-video', displayName: 'Wan 2.2 Spicy', description: 'Budget silent video', badge: 'Budget · silent', badges: ['Budget', 'Silent only'], uiGroup: 'alternatives',
    allowedDurations: [5, 8], defaultDuration: 5, supportedResolutions: ['480p', '720p'], defaultResolution: '480p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'none', lastFrameSupport: false,
    pricing: { kind: 'fixed', byCombination: { '480p:5': .15, '480p:8': .24, '720p:5': .30, '720p:8': .48 } }, estimatedWaitSeconds: { min: 20, max: 180, median: 37 }, timeoutSeconds: 1800, experimental: false, futureConsumerTier: 'silent',
  },
  {
    id: 'seedance-2-0-fast-spicy', model: 'bytedance/seedance-2.0-fast/image-to-video-spicy', displayName: 'Seedance 2.0 Fast Spicy', description: 'Faster Seedance option', badge: 'Experimental', badges: ['Experimental', 'Sound', '4K', 'Last-frame support'], uiGroup: 'experimental',
    allowedDurations: allDurations(4, 15), defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p', '4k'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'selectable', audioMode: 'toggleable', lastFrameSupport: true,
    pricing: { kind: 'per_second', byResolution: { '480p': .10, '720p': .20, '1080p': .50, '4k': 1.00 } }, estimatedWaitSeconds: { min: 30, max: 420, median: 120 }, timeoutSeconds: 3600, experimental: true, futureConsumerTier: 'standard',
  },
  {
    id: 'seedance-2-0-spicy', model: 'bytedance/seedance-2.0/image-to-video-spicy', displayName: 'Seedance 2.0 Spicy', description: 'Higher-quality Seedance', badge: 'Experimental', badges: ['Experimental', 'Sound', '4K', 'Last-frame support'], uiGroup: 'experimental',
    allowedDurations: allDurations(4, 15), defaultDuration: 5, supportedResolutions: ['480p', '720p', '1080p', '4k'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'selectable', audioMode: 'toggleable', lastFrameSupport: true,
    pricing: { kind: 'per_second', byResolution: { '480p': .12, '720p': .24, '1080p': .60, '4k': 1.20 } }, estimatedWaitSeconds: { min: 45, max: 540, median: 160 }, timeoutSeconds: 3600, experimental: true, futureConsumerTier: 'premium',
  },
  {
    id: 'wan-2-6-spicy', model: 'alibaba/wan-2.6/image-to-video-spicy', displayName: 'Wan 2.6 Spicy', description: 'Alternate Wan model', badge: 'Experimental', badges: ['Experimental', 'Silent only', '1080p'], uiGroup: 'experimental',
    allowedDurations: [5, 10, 15], defaultDuration: 5, supportedResolutions: ['720p', '1080p'], defaultResolution: '720p', supportedAspectRatios: ['9:16', '16:9'], aspectRatioBehavior: 'source', audioMode: 'reference_only', lastFrameSupport: false,
    pricing: { kind: 'per_second', byResolution: { '720p': .10, '1080p': .15 } }, estimatedWaitSeconds: { min: 45, max: 480, median: 130 }, timeoutSeconds: 3600, experimental: true, futureConsumerTier: 'silent',
  },
];

const STANDARD_VARIANTS: Record<AdultVideoModelKey, { id: VideoModelKey; model: string }> = {
  'seedance-1-5-pro-spicy': { id: 'seedance-1-5-pro-sfw', model: 'bytedance/seedance-v1.5-pro/image-to-video' },
  'ltx-2-3-spicy': { id: 'ltx-2-3-sfw', model: 'wavespeed-ai/ltx-2.3/image-to-video' },
  'minimax-h3-spicy': { id: 'minimax-h3-sfw', model: 'wavespeed-ai/minimax-h3/image-to-video' },
  'seedance-2-0-mini-spicy': { id: 'seedance-2-0-mini-sfw', model: 'bytedance/seedance-2.0-mini/image-to-video' },
  'seedance-2-0-fast-spicy': { id: 'seedance-2-0-fast-sfw', model: 'bytedance/seedance-2.0-fast/image-to-video' },
  'seedance-2-0-spicy': { id: 'seedance-2-0-sfw', model: 'bytedance/seedance-2.0/image-to-video' },
  'seedance-2-5-spicy': { id: 'seedance-2-5-sfw', model: 'bytedance/seedance-2.5/image-to-video' },
  'vidu-q3-spicy': { id: 'vidu-q3-sfw', model: 'vidu/q3/image-to-video' },
  'wan-2-7-spicy': { id: 'wan-2-7-sfw', model: 'alibaba/wan-2.7/image-to-video' },
  'wan-2-6-spicy': { id: 'wan-2-6-sfw', model: 'alibaba/wan-2.6/image-to-video' },
  'wan-2-2-spicy': { id: 'wan-2-2-sfw', model: 'wavespeed-ai/wan-2.2/image-to-video' },
};

type CompleteCatalogSeed = Omit<CatalogSeed, 'id'> & Pick<VideoRouteDefinition, 'id' | 'contentClass' | 'contentLabel' | 'modelFamily' | 'payloadBuilderId'>;
const CATALOG: CompleteCatalogSeed[] = [
  ...ADULT_CAPABLE_CATALOG.map((seed) => {
    const standard = STANDARD_VARIANTS[seed.id];
    return {
      ...seed,
      id: standard.id,
      model: standard.model,
      displayName: seed.displayName.replace(/ Spicy$/, ''),
      description: `${seed.description} for safe-for-work scenes`,
      badge: 'SFW',
      badges: ['Safe for work', ...seed.badges],
      contentClass: 'sfw' as const,
      contentLabel: 'Safe for work',
      modelFamily: seed.id.replace(/-spicy$/, ''),
      payloadBuilderId: seed.id,
    };
  }),
  ...ADULT_CAPABLE_CATALOG.map((seed) => ({
    ...seed,
    contentClass: 'adult_capable' as const,
    contentLabel: 'Adult-capable',
    modelFamily: seed.id.replace(/-spicy$/, ''),
    payloadBuilderId: seed.id,
    badges: ['Adult-capable', ...seed.badges],
  })),
];

export function configuredVideoRouteCatalog(): VideoRouteDefinition[] {
  const available = envBoolean('KIVELLE_VIDEO_ENABLED') && envBoolean('KIVELLE_WAVESPEED_ENABLED') && Boolean(Deno.env.get('WAVESPEED_API_KEY'));
  return CATALOG.map((seed) => ({
    ...seed, id: seed.id, internalModelKey: seed.id, provider: 'wavespeed' as const, mediaMode: 'image_to_video' as const,
    sourceModes: ['existing_photo', 'generated_first_frame'] as const,
    referenceImageRequirements: { source: 1 as const, canonicalCharacterMin: 0 as const, canonicalCharacterMax: 0 },
    enabled: available && enabled(seed.id), selectable: true, testingOnly: true as const, payloadBuilderId: seed.payloadBuilderId, concurrencyLimit: concurrency(seed.id),
  }));
}

export function videoModelPickerExposed(): boolean { return envBoolean('EXPOSE_VIDEO_MODEL_PICKER', false); }
export function videoSelectorMode(): VideoSelectorMode {
  if (videoModelPickerExposed()) return 'all';
  const value = String(Deno.env.get('KIVELLE_VIDEO_MODEL_SELECTOR_MODE') ?? 'off').trim().toLowerCase();
  return value === 'testers' || value === 'all' ? value : 'off';
}
export function videoTesterUserIds(): Set<string> { return new Set(String(Deno.env.get('KIVELLE_VIDEO_TESTER_USER_IDS') ?? '').split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean)); }
export function canSelectVideoRoute(userId: string, email?: string | null): boolean {
  const mode = videoSelectorMode(); if (mode === 'all') return true; if (mode !== 'testers') return false;
  const allowed = videoTesterUserIds(); return allowed.has(userId.toLowerCase()) || Boolean(email && allowed.has(email.toLowerCase()));
}

const consumerTierAliases: Record<VideoConsumerTier, string> = { standard: 'tier:standard', premium: 'tier:premium', sound: 'tier:sound', silent: 'tier:silent' };
function consumerTierCopy(tier: VideoConsumerTier) {
  if (tier === 'premium') return { displayName: 'Premium', description: 'Highest-quality video', badge: 'Premium' };
  if (tier === 'sound') return { displayName: 'Sound', description: 'Video with generated sound', badge: 'Sound' };
  if (tier === 'silent') return { displayName: 'No Sound', description: 'Efficient silent video', badge: 'Silent' };
  return { displayName: 'Standard', description: 'Balanced quality and cost', badge: 'Recommended' };
}
export function publicVideoRoutes(routes = configuredVideoRouteCatalog(), options: { includeAdultCapable?: boolean } = {}): SafeVideoRouteOption[] {
  const selectable = routes.filter((route) => route.enabled && route.selectable && (route.contentClass === 'sfw' || options.includeAdultCapable === true));
  if (videoModelPickerExposed()) return selectable.map((route) => safeVideoRouteOption(route));
  const selected = new Map<VideoConsumerTier, VideoRouteDefinition>();
  for (const tier of ['standard', 'sound', 'silent', 'premium'] as const) { const route = selectable.find((item) => item.futureConsumerTier === tier); if (route) selected.set(tier, route); }
  return [...selected].map(([tier, route]) => safeVideoRouteOption(route, tier));
}
export function resolveVideoRoute(routeId: string, userId: string, email?: string | null): VideoRouteDefinition {
  if (!canSelectVideoRoute(userId, email)) throw new AppError('FORBIDDEN', 'Video generation is not available for this account.', 403);
  const catalog = configuredVideoRouteCatalog();
  const tier = (Object.entries(consumerTierAliases).find(([, alias]) => alias === routeId)?.[0] ?? null) as VideoConsumerTier | null;
  const route = tier ? catalog.find((item) => item.enabled && item.selectable && item.futureConsumerTier === tier) : catalog.find((item) => item.id === routeId);
  if (!route || !route.enabled || !route.selectable) throw new AppError('PROVIDER_NOT_CONFIGURED', 'That video model is not available. Choose another model.', 503);
  return route;
}
export function safeVideoRouteOption(route: VideoRouteDefinition, consumerTier?: VideoConsumerTier): SafeVideoRouteOption {
  const exposed = videoModelPickerExposed() && !consumerTier;
  const copy = consumerTier ? consumerTierCopy(consumerTier) : { displayName: route.displayName, description: route.description, badge: route.badge };
  return {
    id: consumerTier ? consumerTierAliases[consumerTier] : route.id, ...(exposed ? { modelKey: route.internalModelKey, modelEndpoint: route.model } : {}), provider: route.provider,
    displayName: copy.displayName, description: copy.description, contentClass: route.contentClass, contentLabel: route.contentLabel, modelFamily: route.modelFamily, badge: copy.badge, badges: exposed ? route.badges : [copy.badge], uiGroup: exposed ? route.uiGroup : consumerTier === 'premium' ? 'recommended' : 'alternatives',
    mediaMode: route.mediaMode, sourceModes: route.sourceModes, durationSeconds: route.defaultDuration, allowedDurations: route.allowedDurations, resolution: route.defaultResolution, supportedResolutions: route.supportedResolutions,
    supportedAspectRatios: route.supportedAspectRatios, aspectRatioBehavior: route.aspectRatioBehavior, referenceImageRequirements: route.referenceImageRequirements, audioMode: route.audioMode, audioLabel: videoAudioLabel(route.audioMode),
    lastFrameSupport: route.lastFrameSupport, estimatedWaitSeconds: route.estimatedWaitSeconds, creditQuotes: videoCreditQuotes(route), providerCostQuotes: videoProviderCostQuotes(route), rawModelNamesExposed: exposed, experimental: exposed && route.experimental, testingOnly: true, futureConsumerTier: route.futureConsumerTier,
  };
}

export function videoAudioLabel(mode: VideoAudioMode): string {
  if (mode === 'none' || mode === 'reference_only') return 'This model currently generates silent video.';
  if (mode === 'always') return 'Native audio is generated; No sound removes it before delivery.';
  return 'Sound can be included or disabled.';
}
export function validateVideoSettings(route: VideoRouteDefinition, settings: VideoSettings): VideoSettings {
  if (!route.supportedResolutions.includes(settings.resolution)) throw new AppError('VALIDATION_ERROR', `${route.displayName} does not support ${settings.resolution}.`, 422);
  if (!route.allowedDurations.includes(settings.duration)) throw new AppError('VALIDATION_ERROR', `Choose a supported ${route.displayName} duration.`, 422);
  if (settings.sound && (route.audioMode === 'none' || route.audioMode === 'reference_only')) throw new AppError('VALIDATION_ERROR', 'This model currently generates silent video.', 422);
  return settings;
}
export function videoProviderBaselineCostUsd(route: VideoRouteDefinition, settings: VideoSettings): number {
  validateVideoSettings(route, settings);
  if (route.pricing.kind === 'fixed') { const value = route.pricing.byCombination[`${settings.resolution}:${settings.duration}`]; if (typeof value!=='number'||!Number.isFinite(value)) throw new AppError('VALIDATION_ERROR', 'That video price combination is unavailable.', 422); return value; }
  const perSecond = route.pricing.byResolution[settings.resolution]; if (typeof perSecond!=='number'||!Number.isFinite(perSecond)) throw new AppError('VALIDATION_ERROR', 'That video price combination is unavailable.', 422);
  return Number((perSecond * settings.duration * (settings.sound && route.audioMode === 'toggleable' ? route.pricing.soundMultiplier ?? 1 : 1)).toFixed(4));
}
export function videoCreditCost(route: VideoRouteDefinition, settingsOrDuration: VideoSettings | number): number {
  const settings = typeof settingsOrDuration === 'number' ? { resolution: route.defaultResolution, duration: settingsOrDuration, sound: false } : settingsOrDuration;
  const baseline = videoProviderBaselineCostUsd(route, settings), creditsPerUsd = Math.max(1, envNumber('KIVELLE_VIDEO_CREDITS_PER_USD', 250)), minimum = Math.max(1, Math.floor(envNumber('KIVELLE_VIDEO_MINIMUM_CREDITS', 25)));
  return Math.max(minimum, Math.ceil(baseline * creditsPerUsd));
}
export function videoQuoteKey(settings: VideoSettings): string { return `${settings.resolution}:${settings.duration}:${settings.sound ? 'sound' : 'silent'}`; }
export function videoCreditQuotes(route: VideoRouteDefinition): Record<string, number> {
  const quotes: Record<string, number> = {};
  for (const resolution of route.supportedResolutions) for (const duration of route.allowedDurations) for (const sound of [false, true]) { if (sound && (route.audioMode === 'none' || route.audioMode === 'reference_only')) continue; const settings = { resolution, duration, sound }; quotes[videoQuoteKey(settings)] = videoCreditCost(route, settings); }
  return quotes;
}
export function videoProviderCostQuotes(route: VideoRouteDefinition): Record<string, number> {
  const quotes: Record<string, number> = {};
  for (const resolution of route.supportedResolutions) for (const duration of route.allowedDurations) for (const sound of [false, true]) { if (sound && (route.audioMode === 'none' || route.audioMode === 'reference_only')) continue; const settings = { resolution, duration, sound }; quotes[videoQuoteKey(settings)] = videoProviderBaselineCostUsd(route, settings); }
  return quotes;
}
export function sourceVideoAspectRatio(width: unknown, height: unknown): VideoAspectRatio { const w = Number(width), h = Number(height); return Number.isFinite(w) && Number.isFinite(h) && w > h ? '16:9' : '9:16'; }

const motionDirections: Record<VideoMotionPreset, string> = { subtle: 'Natural breathing and blinking, one small micro-expression, light hair or clothing movement, and a nearly locked camera.', playful: 'A brief smile or side glance, small head and shoulder movement, restrained environmental motion, and a steady camera.', cinematic: 'A gentle push-in or restrained parallax with subtle natural environmental motion and no abrupt movement.' };
export function buildVideoMotionPrompt(preset: VideoMotionPreset, userPrompt?: string, context?: VideoPayloadInput['context'], policy?: Pick<VideoPayloadInput, 'contentLevel' | 'adultAuthorized' | 'anonymousAdultPartner'>): string {
  const adult = policy?.adultAuthorized === true && ['suggestive', 'mature', 'explicit'].includes(String(policy.contentLevel));
  const continuity = adult
    ? 'Preserve the approved fictional-adult clothing state, intimate composition, and visible anatomy from the opening frame. Follow the authorized user direction without adding censorship, invented clothing, blanking, smoothing, or doll-like anatomy.'
    : 'Keep every originally covered body area covered; never introduce nudity or sexual detail that is absent from the approved opening frame.';
  const people = adult && policy?.anonymousAdultPartner
    ? 'Keep exactly the companion and the one anonymous fictional adult partner already present in the opening frame. The partner must remain age 25 or older, non-identifiable, and unrelated to any real person.'
    : 'No new people.';
  return ['Animate this exact approved Kivelle image without redesigning it.', userPrompt ? `User direction: ${userPrompt.replace(/\s+/g, ' ').trim().slice(0, 900)}` : '', context?.locationName ? `Canonical location: ${context.locationName}.` : '', context?.activity ? `Current activity context: ${context.activity}.` : '', motionDirections[preset], 'Keep the same fictional adult character, face, body proportions, hair, environment, lighting, camera angle, crop, and framing.', continuity, people, 'Maintain complete, anatomically coherent adult bodies in every frame. Skin, joints, limbs, hands, chest, pelvis, and any anatomy visible in the opening frame must remain natural and photographically detailed across motion—never blank, smoothed over, plastic, mannequin-like, doll-like, missing, fused, duplicated, or morphing.', 'One continuous shot. No face swaps, morphing, cuts, captions, text, warped hands, sudden camera movement, or large pose changes.'].filter(Boolean).join(' ');
}

const url = z.string().url().refine((value) => value.startsWith('https://'), 'Only HTTPS references are allowed');
const commonPayload = z.object({ image: url, prompt: z.string().min(40).max(1600), resolution: z.enum(VIDEO_RESOLUTIONS), duration: z.number().int().min(1).max(20), seed: z.literal(-1) });
export function buildVideoProviderPayload(route: VideoRouteDefinition, input: VideoPayloadInput): Record<string, unknown> {
  validateVideoSettings(route, input); if (!input.sourceImageUrl) throw new AppError('VALIDATION_ERROR', 'A source image is required to create this video.', 422);
  const prompt = buildVideoMotionPrompt(input.motionPreset, input.userPrompt, input.context, input), common = commonPayload.parse({ image: input.sourceImageUrl, prompt, resolution: input.resolution, duration: input.duration, seed: -1 });
  if (route.payloadBuilderId === 'ltx-2-3-spicy') return { ...common, preset: 'tuned' };
  if (route.payloadBuilderId === 'vidu-q3-spicy') return { ...common, movement_amplitude: 'auto', generate_audio: input.sound, bgm: false };
  if (route.payloadBuilderId === 'wan-2-7-spicy' || route.payloadBuilderId === 'wan-2-6-spicy') return { ...common, shot_type: 'single', enable_prompt_expansion: false };
  if (route.payloadBuilderId === 'wan-2-2-spicy' || route.payloadBuilderId === 'minimax-h3-spicy') return { ...common, ...(input.lastImageUrl && route.lastFrameSupport ? { last_image: url.parse(input.lastImageUrl) } : {}) };
  return { ...common, ...(route.aspectRatioBehavior === 'selectable' ? { aspect_ratio: input.sourceAspectRatio } : {}), generate_audio: input.sound, ...(input.lastImageUrl && route.lastFrameSupport ? { last_image: url.parse(input.lastImageUrl) } : {}) };
}

export function defaultVideoRouteId(): VideoRouteId { const fallback: VideoRouteId = 'seedance-1-5-pro-sfw', configured = String(Deno.env.get('KIVELLE_VIDEO_DEFAULT_ROUTE_ID') ?? fallback); return (VIDEO_ROUTE_IDS as readonly string[]).includes(configured) ? configured as VideoRouteId : fallback; }
export function defaultVideoPublicRouteId(routes: SafeVideoRouteOption[]): string | null { const rawDefault = defaultVideoRouteId(); return routes.find((route) => route.id === rawDefault)?.id ?? routes.find((route) => route.futureConsumerTier === 'standard')?.id ?? routes[0]?.id ?? null; }
