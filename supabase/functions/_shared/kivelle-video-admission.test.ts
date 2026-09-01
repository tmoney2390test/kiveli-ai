import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { quoteVideoWithAdmission, videoPriceCacheKey } from './kivelle-video-admission.ts';
import type { VideoRouteDefinition } from './kivelle-video-routes.ts';

const route = {
  id: 'wavespeed-p-video-i2v', model: 'pruna-ai/p-video/image-to-video', provider: 'wavespeed', displayName: 'P-Video', description: '', badge: '', mediaMode: 'image_to_video', sourceModes: ['existing_photo'], durationSeconds: 10, allowedDurations: [10, 15, 20], resolution: '720p', supportedAspectRatios: ['9:16', '16:9'], referenceImageRequirements: { source: 1, canonicalCharacterMin: 0, canonicalCharacterMax: 0 }, audioBehavior: 'silent', audioLabel: '', estimatedProviderCostUsd: .04, estimatedWaitSeconds: { min: 20, max: 120, median: 45 }, creditCost: 250, creditCostPerSecond: 25, enabled: true, testingOnly: true, payloadBuilderId: 'wavespeed-p-video-i2v', concurrencyLimit: 3,
} satisfies VideoRouteDefinition;

Deno.test('video price cache key excludes prompts and signed URLs while preserving cost dimensions', () => {
  const shape = { route, sourceMode: 'existing_photo' as const, durationSeconds: 10, aspectRatio: '9:16' as const, referenceCount: 1 };
  assertEquals(videoPriceCacheKey(shape), 'video-price-v1:wavespeed-p-video-i2v:existing_photo:10:720p:silent:9:16:1');
  assertEquals(videoPriceCacheKey({ ...shape, durationSeconds: 20 }) === videoPriceCacheKey(shape), false);
});

Deno.test('video pricing admission serves a shared cached quote without calling the provider', async () => {
  let quoteCalls = 0;
  const db = { rpc: async () => ({ data: { state: 'ready', amountUsd: .04 }, error: null }) } as unknown as SupabaseClient;
  const result = await quoteVideoWithAdmission(db, { quote: async () => { quoteCalls += 1; return { amountUsd: 9, currency: 'USD' as const }; } }, { route, payload: {}, sourceMode: 'existing_photo', durationSeconds: 10, aspectRatio: '9:16', referenceCount: 1 });
  assertEquals(result.amountUsd, .04);
  assertEquals(result.cacheHit, true);
  assertEquals(quoteCalls, 0);
});

Deno.test('video pricing owner commits one authoritative provider quote', async () => {
  const calls: string[] = [];
  const db = { rpc: async (name: string) => { calls.push(name); return name === 'kivelle_claim_video_price_quote' ? { data: { state: 'owner', leaseToken: '11111111-1111-4111-8111-111111111111' }, error: null } : { data: true, error: null }; } } as unknown as SupabaseClient;
  const result = await quoteVideoWithAdmission(db, { quote: async () => ({ amountUsd: .05, currency: 'USD' as const }) }, { route, payload: {}, sourceMode: 'existing_photo', durationSeconds: 10, aspectRatio: '9:16', referenceCount: 1 });
  assertEquals(result.cacheHit, false);
  assertEquals(calls, ['kivelle_claim_video_price_quote', 'kivelle_complete_video_price_quote']);
});
