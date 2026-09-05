import type { MediaContentLevel } from './media-routing.ts';

export const VENICE_IMAGE_API_BASE = 'https://api.venice.ai/api/v1';
// Qwen Image 2 is the validated $0.05 reference-edit route. Qwen Image 3 Pro
// is similarly priced, but live SFW requests have returned provider-blurred
// output before Kivelle can inspect it. Reliability wins over the small catalog
// price difference here.
export const VENICE_STANDARD_EDIT_MODEL = 'qwen-image-2-edit';
// A quality retry uses the same economical model rather than silently turning
// a $0.05 request into a $0.15 Qwen Pro request.
export const VENICE_QUALITY_EDIT_MODEL = 'qwen-image-2-edit';
// Keeping the fallback equal to the primary makes the provider adapter dedupe
// it. A failed provider attempt therefore cannot buy a second model behind the
// user's back; the separate, reviewed quality retry remains capped at one.
export const VENICE_STANDARD_FALLBACK_EDIT_MODEL = 'qwen-image-2-edit';
// Keep the identity-establishing stage on grok-imagine-edit with safe_mode
// disabled. Simple clothing edits stay non-explicit here; pose-rebuild nudes
// include the approved pose and coverage in this same uncensored stage.
export const VENICE_ADULT_EDIT_MODEL = 'grok-imagine-edit';
// Venice removed the former qwen-edit-uncensored identifier from its published
// multi-edit catalog. Qwen Image 2 is the current reference-edit model and
// supports the same multi-edit safe_mode contract used after Kivelle's adult,
// fictional-character, consent, and content gates have passed.
export const VENICE_ADULT_FINAL_EDIT_MODEL = 'qwen-image-2-edit';
// FireRed remains a technical fallback for model availability and request-shape
// failures. A provider content-policy block is never bypassed by fallback.
export const VENICE_ADULT_FALLBACK_EDIT_MODEL = 'firered-image-edit';

const VENICE_MULTI_EDIT_ONLY_MODELS = new Set([
  VENICE_STANDARD_EDIT_MODEL,
  VENICE_QUALITY_EDIT_MODEL,
  VENICE_ADULT_EDIT_MODEL,
  VENICE_ADULT_FALLBACK_EDIT_MODEL,
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
  compactSingleEdit?: boolean;
  resolution?: string;
  outputFormat?: 'png' | 'jpeg' | 'webp';
}): VeniceEditRequest {
  const images = input.images.filter(Boolean).slice(0, 3);
  if (!images.length) throw new Error('venice_reference_required');
  const common = {
    prompt: input.prompt,
    ...(input.includeAspectRatio ? { aspect_ratio: normalizeVeniceAspectRatio(input.aspectRatio) } : {}),
  };
  if (input.compactSingleEdit || (images.length === 1 && !input.forceMultiEdit && !VENICE_MULTI_EDIT_ONLY_MODELS.has(input.model.toLowerCase()))) {
    // Uncensored adult identity edits must use /image/edit with an explicit
    // safe_mode=false. Extra multi-edit fields (resolution, output_format)
    // 400 on qwen-edit-uncensored in production.
    return { endpoint: '/image/edit', body: { ...common, model: input.model, image: images[0], ...(input.compactSingleEdit||input.safeMode===false?{safe_mode:input.safeMode}:{}) } };
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
  if (normalized === 'qwen-edit') return 0.04;
  if (normalized === 'qwen-image-3-edit') return 0.04345;
  if (normalized === 'qwen-image-3-pro-edit') return 0.05345;
  if (normalized === 'qwen-image-2-edit') return 0.05;
  if (normalized === 'qwen-image-2-pro-edit') return 0.10;
  // Remaining validated adult edit routes are billed per edit.
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
