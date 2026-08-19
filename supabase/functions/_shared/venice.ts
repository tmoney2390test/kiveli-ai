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
          Accept: 'image/png',
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const safety = parseVeniceSafetyHeaders(response.headers);
      if (!response.ok) throw await providerError(response);
      if (safety.blurred || safety.contentViolation || safety.adultModelContentViolation) {
        // A provider moderation result is never delivered as a successful Kivelle photo.
        throw new AppError('PROVIDER_CONTENT_BLOCKED', 'That photo could not be created within the current media boundaries.', 422, false);
      }
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'image/png') throw new AppError('PROVIDER_UNAVAILABLE', 'The photo provider returned an invalid result.', 503, true);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!hasPngSignature(bytes)) throw new AppError('PROVIDER_UNAVAILABLE', 'The photo provider returned an invalid result.', 503, true);
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
  if (response.status === 401 || response.status === 403) return new AppError('PROVIDER_AUTH', 'The photo provider needs attention.', 503, false);
  if (response.status === 402) return new AppError('PROVIDER_QUOTA', 'Photos are temporarily unavailable while provider capacity is restored.', 503, false);
  if (response.status === 429) return new AppError('RATE_LIMITED', 'Photo requests are busy right now. Try again soon.', 429, true);
  if (response.status === 503 || response.status >= 500) return new AppError('PROVIDER_UNAVAILABLE', 'The photo provider is temporarily unavailable.', 503, true);
  return new AppError('PROVIDER_UNAVAILABLE', 'The photo could not be created right now.', 503, true);
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}
function envBoolean(name: string, fallback = false): boolean {
  const value = Deno.env.get(name);
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
