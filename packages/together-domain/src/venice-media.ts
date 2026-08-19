import type { MediaContentLevel } from './media-routing.ts';

export const VENICE_IMAGE_API_BASE = 'https://api.venice.ai/api/v1';
export const VENICE_STANDARD_EDIT_MODEL = 'qwen-edit';
export const VENICE_ADULT_EDIT_MODEL = 'qwen-edit-uncensored';
export const VENICE_QUALITY_EDIT_MODEL = 'grok-imagine-quality-edit';

export type VeniceEditRequest = {
  endpoint: '/image/edit' | '/image/multi-edit';
  body: Record<string, unknown>;
};

export type VeniceSafetyHeaders = {
  blurred: boolean;
  contentViolation: boolean;
  adultModelContentViolation: boolean;
  requestId: string | null;
  balanceUsd: number | null;
};

export type VenicePipelineStage = {
  kind: 'canonical_base' | 'final_edit';
  model: string;
  safeMode: boolean;
  estimatedCostUsd: number;
};

/**
 * Venice uses `model` on the single-edit endpoint and `modelId` on multi-edit.
 * Keeping this difference in one pure helper prevents provider wire details from
 * leaking into Kivelle's canonical media request model.
 */
export function buildVeniceEditRequest(input: {
  model: string;
  prompt: string;
  images: string[];
  aspectRatio: string;
  safeMode: boolean;
  resolution?: string;
  outputFormat?: 'png' | 'jpeg' | 'webp';
}): VeniceEditRequest {
  const images = input.images.filter(Boolean).slice(0, 3);
  if (!images.length) throw new Error('venice_reference_required');
  const common = {
    prompt: input.prompt,
    aspect_ratio: normalizeVeniceAspectRatio(input.aspectRatio),
    safe_mode: input.safeMode,
    output_format: input.outputFormat ?? 'png',
    resolution: input.resolution ?? '1K',
  };
  if (images.length === 1) {
    return { endpoint: '/image/edit', body: { ...common, model: input.model, image: images[0] } };
  }
  return { endpoint: '/image/multi-edit', body: { ...common, modelId: input.model, images } };
}

export function resolveVenicePipeline(input: {
  contentLevel: MediaContentLevel;
  standardModel?: string;
  adultModel?: string;
}): VenicePipelineStage[] {
  const adult = ['suggestive', 'mature', 'explicit'].includes(input.contentLevel);
  const standardModel = input.standardModel ?? VENICE_STANDARD_EDIT_MODEL;
  if (!adult) return [{ kind: 'final_edit', model: standardModel, safeMode: true, estimatedCostUsd: veniceModelCostUsd(standardModel) }];
  const adultModel = input.adultModel ?? VENICE_ADULT_EDIT_MODEL;
  return [
    { kind: 'canonical_base', model: standardModel, safeMode: true, estimatedCostUsd: veniceModelCostUsd(standardModel) },
    { kind: 'final_edit', model: adultModel, safeMode: false, estimatedCostUsd: veniceModelCostUsd(adultModel) },
  ];
}

export function parseVeniceSafetyHeaders(headers: { get(name: string): string | null }): VeniceSafetyHeaders {
  return {
    blurred: boolHeader(headers.get('x-venice-is-blurred')),
    contentViolation: boolHeader(headers.get('x-venice-is-content-violation')),
    adultModelContentViolation: boolHeader(headers.get('x-venice-is-adult-model-content-violation')),
    requestId: headers.get('cf-ray') ?? headers.get('x-request-id'),
    balanceUsd: finiteNumber(headers.get('x-venice-balance-usd')),
  };
}

/** Auditable estimates; provider billing data should replace these when available. */
export function veniceModelCostUsd(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized === VENICE_QUALITY_EDIT_MODEL) return 0.10;
  if (normalized === 'qwen-image-2-edit') return 0.05;
  if (normalized === 'qwen-image-2-pro-edit') return 0.10;
  // qwen-edit and the currently validated uncensored edit route are billed per edit.
  return 0.04;
}

export function normalizeVeniceAspectRatio(value: string): '1:1' | '3:2' | '16:9' | '21:9' | '9:16' | '2:3' | '3:4' | '4:5' | 'auto' {
  if (['1:1', '3:2', '16:9', '21:9', '9:16', '2:3', '3:4', '4:5'].includes(value)) return value as ReturnType<typeof normalizeVeniceAspectRatio>;
  return 'auto';
}

function boolHeader(value: string | null): boolean { return value?.toLowerCase() === 'true'; }
function finiteNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
