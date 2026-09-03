import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { quoteVideoWithAdmission, videoPriceCacheKey } from './kivelle-video-admission.ts';
import type { VideoRouteDefinition } from './kivelle-video-routes.ts';

const route = {
  id:'seedance-1-5-pro-sfw',internalModelKey:'seedance-1-5-pro-sfw',model:'bytedance/seedance-v1.5-pro/image-to-video',provider:'wavespeed',displayName:'Seedance 1.5 Pro',description:'Recommended balance for safe-for-work scenes',contentClass:'sfw',contentLabel:'Safe for work',modelFamily:'seedance-1-5-pro',badge:'SFW',badges:['Safe for work','Sound','1080p'],uiGroup:'recommended',mediaMode:'image_to_video',sourceModes:['existing_photo','generated_first_frame'],allowedDurations:[5,10],defaultDuration:5,supportedResolutions:['480p','720p','1080p'],defaultResolution:'720p',supportedAspectRatios:['9:16','16:9'],aspectRatioBehavior:'source',referenceImageRequirements:{source:1,canonicalCharacterMin:0,canonicalCharacterMax:0},audioMode:'toggleable',lastFrameSupport:false,pricing:{kind:'per_second',byResolution:{'480p':.012,'720p':.026,'1080p':.052},soundMultiplier:2},estimatedWaitSeconds:{min:25,max:180,median:70},timeoutSeconds:1800,enabled:true,selectable:true,experimental:false,testingOnly:true,payloadBuilderId:'seedance-1-5-pro-spicy',concurrencyLimit:2,futureConsumerTier:'standard',
} satisfies VideoRouteDefinition;

Deno.test('video price cache key excludes prompts and signed URLs while preserving cost dimensions', () => {
  const shape = { route, sourceMode: 'existing_photo' as const, durationSeconds: 5, resolution:'720p', sound:false, aspectRatio: '9:16' as const, referenceCount: 1 };
  assertEquals(videoPriceCacheKey(shape), 'video-price-v1:seedance-1-5-pro-sfw:existing_photo:5:720p:silent:9:16:1');
  assertEquals(videoPriceCacheKey({ ...shape, durationSeconds: 20 }) === videoPriceCacheKey(shape), false);
});

Deno.test('video pricing admission serves a shared cached quote without calling the provider', async () => {
  let quoteCalls = 0;
  const db = { rpc: async () => ({ data: { state: 'ready', amountUsd: .04 }, error: null }) } as unknown as SupabaseClient;
  const result = await quoteVideoWithAdmission(db, { quote: async () => { quoteCalls += 1; return { amountUsd: 9, currency: 'USD' as const }; } }, { route, payload: {}, sourceMode: 'existing_photo', durationSeconds: 5, resolution:'720p', sound:false, aspectRatio: '9:16', referenceCount: 1 });
  assertEquals(result.amountUsd, .04);
  assertEquals(result.cacheHit, true);
  assertEquals(quoteCalls, 0);
});

Deno.test('video pricing owner commits one authoritative provider quote', async () => {
  const calls: string[] = [];
  const db = { rpc: async (name: string) => { calls.push(name); return name === 'kivelle_claim_video_price_quote' ? { data: { state: 'owner', leaseToken: '11111111-1111-4111-8111-111111111111' }, error: null } : { data: true, error: null }; } } as unknown as SupabaseClient;
  const result = await quoteVideoWithAdmission(db, { quote: async () => ({ amountUsd: .05, currency: 'USD' as const }) }, { route, payload: {}, sourceMode: 'existing_photo', durationSeconds: 5, resolution:'720p', sound:false, aspectRatio: '9:16', referenceCount: 1 });
  assertEquals(result.cacheHit, false);
  assertEquals(calls, ['kivelle_claim_video_price_quote', 'kivelle_complete_video_price_quote']);
});
