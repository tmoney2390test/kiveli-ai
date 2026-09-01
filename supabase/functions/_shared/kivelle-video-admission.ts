import type { SupabaseClient } from '@supabase/supabase-js';
import type { VideoRouteDefinition, VideoSourceMode } from './kivelle-video-routes.ts';
import type { WaveSpeedQuote } from './wavespeed.ts';
import { AppError } from './types.ts';

type QuoteClient = { quote(model: string, input: Record<string, unknown>): Promise<WaveSpeedQuote> };
type ClaimState = { state?: 'ready' | 'owner' | 'waiting' | 'busy' | 'backoff'; amountUsd?: number; leaseToken?: string };

export type VideoPriceShape = {
  route: VideoRouteDefinition;
  sourceMode: VideoSourceMode;
  durationSeconds: number;
  aspectRatio: '9:16' | '16:9';
  referenceCount: number;
};

export function videoPriceCacheKey(input: VideoPriceShape): string {
  return [
    'video-price-v1',
    input.route.id,
    input.sourceMode,
    input.durationSeconds,
    input.route.resolution,
    input.route.audioBehavior,
    input.aspectRatio,
    Math.max(0, Math.min(12, Math.floor(input.referenceCount))),
  ].join(':');
}

export async function quoteVideoWithAdmission(
  db: SupabaseClient,
  client: QuoteClient,
  input: VideoPriceShape & { payload: Record<string, unknown> },
  options: { wait?: (milliseconds: number) => Promise<void>; maxWaitMs?: number; maxQuoteAttempts?: number } = {},
): Promise<WaveSpeedQuote & { cacheHit: boolean }> {
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const maxWaitMs = Math.max(2_000, Math.min(25_000, options.maxWaitMs ?? 20_000));
  const maxQuoteAttempts = Math.max(1, Math.min(3, options.maxQuoteAttempts ?? 3));
  const priceKey = videoPriceCacheKey(input);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maxWaitMs) {
    const { data, error } = await db.rpc('kivelle_claim_video_price_quote', {
      p_price_key: priceKey,
      p_max_inflight: quoteMaxInflight(),
      p_lease_seconds: 25,
    });
    if (error) throw new AppError('INTERNAL_ERROR', 'Video pricing admission could not be checked.', 500, true);
    const claim = (data ?? {}) as ClaimState;
    if (claim.state === 'ready' && Number.isFinite(Number(claim.amountUsd))) {
      return { amountUsd: Number(claim.amountUsd), currency: 'USD', rawUnit: 'provider_quote_cache', cacheHit: true };
    }
    if (claim.state === 'owner' && claim.leaseToken) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxQuoteAttempts; attempt += 1) {
        try {
          const quote = await client.quote(input.route.model, input.payload);
          const { data: completed, error: completeError } = await db.rpc('kivelle_complete_video_price_quote', {
            p_price_key: priceKey,
            p_lease_token: claim.leaseToken,
            p_amount_usd: quote.amountUsd,
            p_ttl_seconds: 90,
          });
          if (completeError || completed !== true) throw new AppError('INTERNAL_ERROR', 'Video pricing could not be committed safely.', 500, true);
          return { ...quote, cacheHit: false };
        } catch (error) {
          lastError = error;
          if (!retryableQuoteError(error) || attempt === maxQuoteAttempts) break;
          await wait(400 * attempt);
        }
      }
      await db.rpc('kivelle_backoff_video_price_quote', {
        p_price_key: priceKey,
        p_lease_token: claim.leaseToken,
        p_backoff_seconds: 5,
      });
      throw lastError instanceof AppError ? lastError : new AppError('PROVIDER_UNAVAILABLE', 'Video pricing is temporarily busy. Try again shortly.', 503, true);
    }
    await wait(claim.state === 'backoff' ? 500 : 200);
  }
  throw new AppError('PROVIDER_UNAVAILABLE', 'Video pricing is busy. Your request was not charged; try again shortly.', 503, true);
}

function quoteMaxInflight(): number {
  const value = Number(Deno.env.get('KIVELLE_VIDEO_QUOTE_MAX_INFLIGHT') ?? 4);
  return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.floor(value))) : 4;
}

function retryableQuoteError(error: unknown): boolean {
  return error instanceof AppError && error.retryable && ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT'].includes(error.code);
}
