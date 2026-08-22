import type { MediaContentLevel } from './media-routing.ts';

export const VENICE_IMAGE_API_BASE = 'https://api.venice.ai/api/v1';
// Qwen Image 2 is Venice's current general-purpose reference edit model. The
// older qwen-edit route remains available, but has produced intermittent HTTP
// 500 inference failures for otherwise valid full-body composition changes.
export const VENICE_STANDARD_EDIT_MODEL = 'qwen-image-2-edit';
export const VENICE_STANDARD_FALLBACK_EDIT_MODEL = 'firered-image-edit';
// Keep the identity-establishing stage neutral and reference-safe. Adult scope
// is applied only after this canonical base exists.
export const VENICE_ADULT_EDIT_MODEL = 'grok-imagine-edit';
// Venice's public API accepts the stable `qwen-edit` model ID and currently
// routes it to Qwen Edit Uncensored. `qwen-edit-uncensored` is a product/model
// name, not an accepted multi-edit API model ID, and returns HTTP 400. This
// stage receives only requests that already passed Kivelle's adult,
// fictional-character, consent, and content gates; safe_mode remains disabled.
export const VENICE_ADULT_FINAL_EDIT_MODEL = 'qwen-edit';
// FireRed remains a technical fallback for model availability and request-shape
// failures. A provider content-policy block is never bypassed by fallback.
export const VENICE_ADULT_FALLBACK_EDIT_MODEL = 'firered-image-edit';
export const VENICE_QUALITY_EDIT_MODEL = 'qwen-image-2-pro-edit';

const VENICE_MULTI_EDIT_ONLY_MODELS = new Set([
  VENICE_STANDARD_EDIT_MODEL,
  VENICE_QUALITY_EDIT_MODEL,
]);

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
  forceMultiEdit?: boolean;
  includeAspectRatio?: boolean;
  resolution?: string;
  outputFormat?: 'png' | 'jpeg' | 'webp';
}): VeniceEditRequest {
  const images = input.images.filter(Boolean).slice(0, 3);
  if (!images.length) throw new Error('venice_reference_required');
  const common = {
    prompt: input.prompt,
    ...(input.includeAspectRatio ? { aspect_ratio: normalizeVeniceAspectRatio(input.aspectRatio) } : {}),
  };
  if (images.length === 1 && !input.forceMultiEdit && !VENICE_MULTI_EDIT_ONLY_MODELS.has(input.model.toLowerCase())) {
    // /image/edit has a smaller, model-agnostic contract. In particular,
    // safe_mode, resolution and output_format are not accepted consistently
    // by this experimental endpoint.
    return { endpoint: '/image/edit', body: { ...common, model: input.model, image: images[0] } };
  }
  return {
    endpoint: '/image/multi-edit',
    body: {
      ...common,
      modelId: input.model,
      images,
      safe_mode: input.safeMode,
      ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
    },
  };
}

export function resolveVenicePipeline(input: {
  contentLevel: MediaContentLevel;
  standardModel?: string;
  adultModel?: string;
  adultFinalModel?: string;
}): VenicePipelineStage[] {
  const adult = ['suggestive', 'mature', 'explicit'].includes(input.contentLevel);
  const standardModel = input.standardModel ?? VENICE_STANDARD_EDIT_MODEL;
  if (!adult) return [{ kind: 'final_edit', model: standardModel, safeMode: true, estimatedCostUsd: veniceModelCostUsd(standardModel) }];
  const adultModel = input.adultModel ?? VENICE_ADULT_EDIT_MODEL;
  const adultFinalModel = input.adultFinalModel ?? VENICE_ADULT_FINAL_EDIT_MODEL;
  return [
    { kind: 'canonical_base', model: adultModel, safeMode: false, estimatedCostUsd: veniceModelCostUsd(adultModel) },
    { kind: 'final_edit', model: adultFinalModel, safeMode: false, estimatedCostUsd: veniceModelCostUsd(adultFinalModel) },
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
  if (normalized === VENICE_ADULT_FINAL_EDIT_MODEL) return 0.04;
  if (normalized === 'qwen-image-2-edit') return 0.05;
  if (normalized === 'qwen-image-2-pro-edit') return 0.10;
  // qwen-edit and the currently validated adult edit routes are billed per edit.
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
