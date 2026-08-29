import { z } from 'zod';
import { AppError } from './types.ts';
import { envBoolean, envNumber } from './wavespeed.ts';

export const VIDEO_ROUTE_IDS = [
  'wavespeed-gemini-omni-flash-i2v',
  'wavespeed-minimax-h3-i2v',
  'wavespeed-p-video-i2v',
  'wavespeed-gemini-omni-flash-r2v',
] as const;
export type VideoRouteId = typeof VIDEO_ROUTE_IDS[number];
export const MOTION_PRESETS = ['subtle', 'playful', 'cinematic'] as const;
export type VideoMotionPreset = typeof MOTION_PRESETS[number];
export type VideoAspectRatio = '9:16' | '16:9';
export type VideoAudioBehavior = 'generated_audio' | 'silent' | 'provider_default';
export type VideoSelectorMode = 'off' | 'testers' | 'all';

export type VideoRouteDefinition = {
  id: VideoRouteId;
  provider: 'wavespeed';
  model: string;
  displayName: string;
  description: string;
  badge: string;
  mediaMode: 'image_to_video' | 'reference_to_video';
  durationSeconds: 5;
  resolution: 'provider_native' | '768p' | '720p';
  supportedAspectRatios: readonly VideoAspectRatio[];
  referenceImageRequirements: { source: 1; canonicalCharacterMin: 0 | 1; canonicalCharacterMax: 0 | 2 };
  audioBehavior: VideoAudioBehavior;
  audioLabel: string;
  estimatedProviderCostUsd: number;
  estimatedWaitSeconds: { min: number; max: number; median: number };
  creditCost: 125;
  enabled: boolean;
  testingOnly: true;
  payloadBuilderId: VideoRouteId;
  providerCostCeilingUsd: number;
  concurrencyLimit: number;
  sceneReinterpretationWarning?: string;
};

export type SafeVideoRouteOption = Omit<VideoRouteDefinition, 'model' | 'providerCostCeilingUsd' | 'concurrencyLimit' | 'payloadBuilderId' | 'enabled'>;
export type VideoPayloadInput = {
  sourceImageUrl: string;
  canonicalReferenceUrls?: string[];
  sourceAspectRatio: VideoAspectRatio;
  motionPreset: VideoMotionPreset;
};

const ROUTE_ENV: Record<VideoRouteId, { enabled: string; maxUsd: string; defaultMaxUsd: number; concurrency: string; defaultConcurrency: number }> = {
  'wavespeed-gemini-omni-flash-i2v': { enabled: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_I2V_ENABLED', maxUsd: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_I2V_MAX_USD', defaultMaxUsd: .90, concurrency: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_I2V_CONCURRENCY', defaultConcurrency: 3 },
  'wavespeed-minimax-h3-i2v': { enabled: 'KIVELLE_VIDEO_ROUTE_MINIMAX_H3_I2V_ENABLED', maxUsd: 'KIVELLE_VIDEO_ROUTE_MINIMAX_H3_I2V_MAX_USD', defaultMaxUsd: .70, concurrency: 'KIVELLE_VIDEO_ROUTE_MINIMAX_H3_I2V_CONCURRENCY', defaultConcurrency: 1 },
  'wavespeed-p-video-i2v': { enabled: 'KIVELLE_VIDEO_ROUTE_P_VIDEO_I2V_ENABLED', maxUsd: 'KIVELLE_VIDEO_ROUTE_P_VIDEO_I2V_MAX_USD', defaultMaxUsd: .20, concurrency: 'KIVELLE_VIDEO_ROUTE_P_VIDEO_I2V_CONCURRENCY', defaultConcurrency: 3 },
  'wavespeed-gemini-omni-flash-r2v': { enabled: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_R2V_ENABLED', maxUsd: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_R2V_MAX_USD', defaultMaxUsd: 1, concurrency: 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_R2V_CONCURRENCY', defaultConcurrency: 2 },
};

function enabled(id: VideoRouteId): boolean {
  return envBoolean(ROUTE_ENV[id].enabled, false);
}
function ceiling(id: VideoRouteId): number {
  return Math.max(0, envNumber(ROUTE_ENV[id].maxUsd, ROUTE_ENV[id].defaultMaxUsd));
}
function concurrency(id: VideoRouteId): number {
  return Math.max(1, Math.min(4, Math.floor(envNumber(ROUTE_ENV[id].concurrency, ROUTE_ENV[id].defaultConcurrency))));
}

export function configuredVideoRouteCatalog(): VideoRouteDefinition[] {
  const available = envBoolean('KIVELLE_VIDEO_ENABLED') && envBoolean('KIVELLE_WAVESPEED_ENABLED') && Boolean(Deno.env.get('WAVESPEED_API_KEY'));
  const common = { provider: 'wavespeed' as const, durationSeconds: 5 as const, supportedAspectRatios: ['9:16', '16:9'] as const, creditCost: 125 as const, testingOnly: true as const };
  return [
    {
      ...common, id: 'wavespeed-gemini-omni-flash-i2v', model: 'google/gemini-omni-flash/image-to-video', displayName: 'Gemini Omni Flash', badge: 'Recommended',
      description: 'Best balance of motion quality, consistency, and speed', mediaMode: 'image_to_video', resolution: 'provider_native',
      referenceImageRequirements: { source: 1, canonicalCharacterMin: 0, canonicalCharacterMax: 0 }, audioBehavior: 'generated_audio', audioLabel: 'May include generated audio · playback starts muted',
      estimatedProviderCostUsd: .70, estimatedWaitSeconds: { min: 30, max: 90, median: 42 }, enabled: available && enabled('wavespeed-gemini-omni-flash-i2v'),
      payloadBuilderId: 'wavespeed-gemini-omni-flash-i2v', providerCostCeilingUsd: ceiling('wavespeed-gemini-omni-flash-i2v'), concurrencyLimit: concurrency('wavespeed-gemini-omni-flash-i2v'),
    },
    {
      ...common, id: 'wavespeed-minimax-h3-i2v', model: 'minimax/h3/image-to-video', displayName: 'MiniMax H3', badge: 'Highest quality',
      description: 'Best visual fidelity, but substantially slower', mediaMode: 'image_to_video', resolution: '768p',
      referenceImageRequirements: { source: 1, canonicalCharacterMin: 0, canonicalCharacterMax: 0 }, audioBehavior: 'provider_default', audioLabel: 'Provider audio behavior may vary · playback starts muted',
      estimatedProviderCostUsd: .50, estimatedWaitSeconds: { min: 180, max: 600, median: 353 }, enabled: available && enabled('wavespeed-minimax-h3-i2v'),
      payloadBuilderId: 'wavespeed-minimax-h3-i2v', providerCostCeilingUsd: ceiling('wavespeed-minimax-h3-i2v'), concurrencyLimit: concurrency('wavespeed-minimax-h3-i2v'),
    },
    {
      ...common, id: 'wavespeed-p-video-i2v', model: 'pruna-ai/p-video/image-to-video', displayName: 'P-Video', badge: 'Fast',
      description: 'Fastest and least expensive; quality may be lower', mediaMode: 'image_to_video', resolution: '720p',
      referenceImageRequirements: { source: 1, canonicalCharacterMin: 0, canonicalCharacterMax: 0 }, audioBehavior: 'silent', audioLabel: 'Silent video',
      estimatedProviderCostUsd: .02, estimatedWaitSeconds: { min: 15, max: 75, median: 31 }, enabled: available && enabled('wavespeed-p-video-i2v'),
      payloadBuilderId: 'wavespeed-p-video-i2v', providerCostCeilingUsd: ceiling('wavespeed-p-video-i2v'), concurrencyLimit: concurrency('wavespeed-p-video-i2v'),
    },
    {
      ...common, id: 'wavespeed-gemini-omni-flash-r2v', model: 'google/gemini-omni-flash/reference-to-video', displayName: 'Gemini Omni Flash References', badge: 'Identity test',
      description: 'Uses additional character references to reduce identity drift', mediaMode: 'reference_to_video', resolution: 'provider_native',
      referenceImageRequirements: { source: 1, canonicalCharacterMin: 1, canonicalCharacterMax: 2 }, audioBehavior: 'generated_audio', audioLabel: 'May include generated audio · playback starts muted',
      estimatedProviderCostUsd: .80, estimatedWaitSeconds: { min: 35, max: 100, median: 48 }, enabled: available && enabled('wavespeed-gemini-omni-flash-r2v'),
      payloadBuilderId: 'wavespeed-gemini-omni-flash-r2v', providerCostCeilingUsd: ceiling('wavespeed-gemini-omni-flash-r2v'), concurrencyLimit: concurrency('wavespeed-gemini-omni-flash-r2v'),
      sceneReinterpretationWarning: 'May reinterpret the scene instead of preserving the exact first frame.',
    },
  ];
}

export function videoSelectorMode(): VideoSelectorMode {
  const value = String(Deno.env.get('KIVELLE_VIDEO_MODEL_SELECTOR_MODE') ?? 'off').trim().toLowerCase();
  return value === 'testers' || value === 'all' ? value : 'off';
}
export function videoTesterUserIds(): Set<string> {
  return new Set(String(Deno.env.get('KIVELLE_VIDEO_TESTER_USER_IDS') ?? '').split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean));
}
export function canSelectVideoRoute(userId: string, email?: string | null): boolean {
  const mode = videoSelectorMode();
  if (mode === 'all') return true;
  if (mode !== 'testers') return false;
  const allowed = videoTesterUserIds();
  return allowed.has(userId.toLowerCase()) || Boolean(email && allowed.has(email.toLowerCase()));
}
export function resolveVideoRoute(routeId: string, userId: string, email?: string | null): VideoRouteDefinition {
  if (!canSelectVideoRoute(userId, email)) throw new AppError('FORBIDDEN', 'Video model testing is not available for this account.', 403);
  const route = configuredVideoRouteCatalog().find((item) => item.id === routeId);
  if (!route || !route.enabled) throw new AppError('PROVIDER_NOT_CONFIGURED', 'That video model is not available. Choose another model.', 503);
  return route;
}
export function safeVideoRouteOption(route: VideoRouteDefinition): SafeVideoRouteOption {
  const { model: _model, providerCostCeilingUsd: _ceiling, concurrencyLimit: _concurrency, payloadBuilderId: _builder, enabled: _enabled, ...safe } = route;
  return safe;
}
export function sourceVideoAspectRatio(width: unknown, height: unknown): VideoAspectRatio {
  const w = Number(width), h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && w > h ? '16:9' : '9:16';
}

const motionDirections: Record<VideoMotionPreset, string> = {
  subtle: 'Natural breathing and blinking, one small micro-expression, light hair or clothing movement, and a nearly locked camera.',
  playful: 'A brief smile or side glance, small head and shoulder movement, restrained environmental motion, and a steady camera.',
  cinematic: 'A gentle push-in or restrained parallax with subtle natural environmental motion and no abrupt movement.',
};
export function buildVideoMotionPrompt(preset: VideoMotionPreset, referenceMode = false): string {
  return [
    referenceMode ? 'Create one continuous video grounded first in <IMAGE_REF_0>, using the remaining image references only to preserve the same character identity.' : 'Animate this exact approved Kivelle image without redesigning it.',
    motionDirections[preset],
    'Keep the same fictional adult character, face, body proportions, hair, outfit, environment, lighting, camera angle, crop, and framing.',
    'One continuous shot. No new people, face swaps, morphing, cuts, dialogue, captions, text, warped hands, sudden camera movement, or large pose changes.',
  ].join(' ');
}

const url = z.string().url().refine((value) => value.startsWith('https://'), 'Only HTTPS references are allowed');
const i2vSchema = z.object({ image: url, prompt: z.string().min(40).max(1600), aspect_ratio: z.enum(['9:16', '16:9']), duration: z.literal(5) }).strict();
const minimaxSchema = z.object({ image: url, prompt: z.string().min(40).max(1600), resolution: z.literal('768p'), duration: z.literal(5) }).strict();
const pVideoSchema = z.object({ image: url, prompt: z.string().min(40).max(1600), duration: z.literal(5), resolution: z.literal('720p'), seed: z.literal(-1), save_audio: z.literal(false) }).strict();
const r2vSchema = z.object({ images: z.array(url).min(2).max(3), prompt: z.string().min(40).max(1600), aspect_ratio: z.enum(['9:16', '16:9']), duration: z.literal(5) }).strict();

export function buildVideoProviderPayload(route: VideoRouteDefinition, input: VideoPayloadInput): Record<string, unknown> {
  const prompt = buildVideoMotionPrompt(input.motionPreset, route.mediaMode === 'reference_to_video');
  switch (route.payloadBuilderId) {
    case 'wavespeed-gemini-omni-flash-i2v':
      return i2vSchema.parse({ image: input.sourceImageUrl, prompt, aspect_ratio: input.sourceAspectRatio, duration: 5 });
    case 'wavespeed-minimax-h3-i2v':
      return minimaxSchema.parse({ image: input.sourceImageUrl, prompt, resolution: '768p', duration: 5 });
    case 'wavespeed-p-video-i2v':
      return pVideoSchema.parse({ image: input.sourceImageUrl, prompt, duration: 5, resolution: '720p', seed: -1, save_audio: false });
    case 'wavespeed-gemini-omni-flash-r2v': {
      const references = (input.canonicalReferenceUrls ?? []).filter((value, index, all) => value !== input.sourceImageUrl && all.indexOf(value) === index).slice(0, 2);
      if (!references.length) throw new AppError('CHARACTER_REFERENCE_REQUIRED', 'This identity-test route needs an approved companion reference.', 409, true);
      return r2vSchema.parse({ images: [input.sourceImageUrl, ...references], prompt, aspect_ratio: input.sourceAspectRatio, duration: 5 });
    }
  }
}

export function defaultVideoRouteId(): VideoRouteId {
  const configured = String(Deno.env.get('KIVELLE_VIDEO_DEFAULT_ROUTE_ID') ?? VIDEO_ROUTE_IDS[0]);
  return (VIDEO_ROUTE_IDS as readonly string[]).includes(configured) ? configured as VideoRouteId : VIDEO_ROUTE_IDS[0];
}

export function assertVideoQuoteWithinCeiling(route:VideoRouteDefinition,amountUsd:number):void{
  if(!Number.isFinite(amountUsd)||amountUsd<0)throw new AppError('PROVIDER_UNAVAILABLE','The video provider returned an invalid price quote.',503,true);
  if(amountUsd>route.providerCostCeilingUsd)throw new AppError('PROVIDER_QUOTA','That model is currently priced above Kivelle’s testing limit. Choose another model.',503,false);
}
