import {
  buildVeniceEditRequest,
  parseVeniceSafetyHeaders,
  VENICE_IMAGE_API_BASE,
  veniceModelCostUsd,
} from '../../../packages/together-domain/src/venice-media.ts';
import { AppError } from './types.ts';

export type VeniceEditInput = {
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
};

export type VeniceEditResult = {
  bytes: Uint8Array;
  contentType: string;
  model: string;
  providerRequestId: string;
  estimatedCost: number;
  generationMs: number;
  safety: { blurred: boolean; contentViolation: boolean; adultModelContentViolation: boolean };
};

export type VeniceQualityResult = {
  content: string;
  model: string;
  providerRequestId: string;
  generationMs: number;
  actualCostUsd: number | null;
};

export class VeniceImageClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = VENICE_IMAGE_API_BASE,
    private readonly timeoutMs = 90_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async edit(input: VeniceEditInput): Promise<VeniceEditResult> {
    const request = buildVeniceEditRequest(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const response = await this.fetcher(`${this.baseUrl}${request.endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'image/png,image/jpeg,image/webp',
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const safety = parseVeniceSafetyHeaders(response.headers);
      if (!response.ok) throw await providerError(response);
      // Preserve the provider's three distinct safety signals in operational
      // telemetry. They intentionally share user-safe copy, but must not be
      // collapsed or ignored: adult-model violations are still hard blocks.
      if (safety.blurred) throw new AppError('PROVIDER_OUTPUT_BLURRED', 'That photo could not be created within the current media boundaries.', 422, false);
      if (safety.adultModelContentViolation) throw new AppError('PROVIDER_ADULT_MODEL_CONTENT_BLOCKED', 'That photo could not be created within the current media boundaries.', 422, false);
      if (safety.contentViolation) throw new AppError('PROVIDER_CONTENT_BLOCKED', 'That photo could not be created within the current media boundaries.', 422, false);
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      if (!isSupportedImageContentType(contentType)) throw new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'The photo provider returned an invalid result.', 503, true);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!hasMatchingImageSignature(contentType, bytes)) throw new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'The photo provider returned an invalid result.', 503, true);
      return {
        bytes,
        contentType,
        model: input.model,
        providerRequestId: safety.requestId ?? crypto.randomUUID(),
        estimatedCost: veniceModelCostUsd(input.model),
        generationMs: Math.max(0, Math.round(performance.now() - started)),
        safety: {
          blurred: safety.blurred,
          contentViolation: safety.contentViolation,
          adultModelContentViolation: safety.adultModelContentViolation,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new AppError('PROVIDER_TIMEOUT', 'The photo took too long to create. Try again soon.', 503, true);
      throw new AppError('PROVIDER_UNAVAILABLE', 'The photo could not be created right now.', 503, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async assessQuality(input: { imageUrl: string; referenceImageUrls?:string[]; prompt: string; model?: string }): Promise<VeniceQualityResult> {
    const model = input.model ?? 'qwen3-vl-235b-a22b';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 45_000));
    const started = performance.now();
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: input.prompt },
              { type: 'image_url', image_url: { url: input.imageUrl } },
              ...(input.referenceImageUrls??[]).slice(0,2).map((url)=>({type:'image_url',image_url:{url}})),
            ],
          }],
          // Leave enough room for providers that emit a small reasoning block
          // despite the explicit disable_thinking request. The delivery gate
          // still accepts only the strict PASS/FAIL contract.
          max_completion_tokens: 128,
          temperature: 0,
          stream: false,
          venice_parameters: {
            disable_thinking: true,
            strip_thinking_response: true,
            enable_web_search: 'off',
            include_venice_system_prompt: false,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw await providerError(response);
      const payload = await response.json() as Record<string, unknown>;
      const content = qualityResponseText(payload);
      if (!content) throw new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'The photo quality check returned an invalid result.', 503, true);
      return {
        content,
        model: typeof payload.model === 'string' ? payload.model : model,
        providerRequestId: typeof payload.id === 'string' ? payload.id : response.headers.get('cf-ray') ?? crypto.randomUUID(),
        generationMs: Math.max(0, Math.round(performance.now() - started)),
        actualCostUsd: qualityResponseCost(payload),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new AppError('PROVIDER_TIMEOUT', 'The photo quality check timed out.', 503, true);
      throw new AppError('PROVIDER_UNAVAILABLE', 'The photo quality check is temporarily unavailable.', 503, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function configuredVeniceClient(): VeniceImageClient | null {
  if (!envBoolean('KIVELLE_VENICE_ENABLED')) return null;
  const key = Deno.env.get('VENICE_API_KEY');
  return key ? new VeniceImageClient(key, Deno.env.get('KIVELLE_VENICE_API_BASE') ?? VENICE_IMAGE_API_BASE) : null;
}

async function providerError(response: Response): Promise<AppError> {
  // Never log or return the raw provider body; it may contain request content.
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  if (response.status === 400 || response.status === 415) return new AppError('PROVIDER_REQUEST_INVALID', 'The photo request could not be processed.', 503, false);
  if (response.status === 413) return new AppError('PROVIDER_REQUEST_INVALID', 'The photo request was too large for the provider.', 503, false);
  if (response.status === 422) return new AppError('PROVIDER_CONTENT_BLOCKED', 'That photo could not be created within the current media boundaries.', 422, false);
  if (response.status === 401 || response.status === 403) return new AppError('PROVIDER_AUTH', 'The photo provider needs attention.', 503, false);
  if (response.status === 402) return new AppError('PROVIDER_QUOTA', 'Photos are temporarily unavailable while provider capacity is restored.', 503, false);
  if (response.status === 429) return new AppError('RATE_LIMITED', 'Photo requests are busy right now. Try again soon.', 429, true);
  if (response.status === 500) return new AppError('PROVIDER_MODEL', 'The photo provider could not complete that generation.', 503, true);
  if (response.status === 503 || response.status > 500) return new AppError('PROVIDER_UNAVAILABLE', 'The photo provider is temporarily unavailable.', 503, true);
  return new AppError('PROVIDER_UNAVAILABLE', 'The photo could not be created right now.', 503, true);
}

function isSupportedImageContentType(value: string | undefined): value is 'image/png' | 'image/jpeg' | 'image/webp' {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}
function hasMatchingImageSignature(contentType: 'image/png' | 'image/jpeg' | 'image/webp', bytes: Uint8Array): boolean {
  if (contentType === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
function envBoolean(name: string, fallback = false): boolean {
  const value = Deno.env.get(name);
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function qualityResponseText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === 'object' ? (choices[0] as Record<string, unknown>).message : undefined;
  const content = message && typeof message === 'object' ? (message as Record<string, unknown>).content : undefined;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? String((part as Record<string, unknown>).text) : '').join(' ').trim();
}
function qualityResponseCost(payload: Record<string, unknown>): number | null {
  const cost = payload.cost && typeof payload.cost === 'object' ? Number((payload.cost as Record<string, unknown>).usd) : NaN;
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}
