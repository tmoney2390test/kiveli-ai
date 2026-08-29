import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { assertVideoQuoteWithinCeiling, buildVideoProviderPayload, canSelectVideoRoute, configuredVideoRouteCatalog, resolveVideoRoute, sourceVideoAspectRatio, VIDEO_ROUTE_IDS } from './kivelle-video-routes.ts';
import { findQuoteAmount } from './wavespeed.ts';

function catalog() {
  const before = Object.fromEntries(['KIVELLE_VIDEO_ENABLED', 'KIVELLE_WAVESPEED_ENABLED', 'WAVESPEED_API_KEY', ...VIDEO_ROUTE_IDS.map((id) => ({
    'wavespeed-gemini-omni-flash-i2v': 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_I2V_ENABLED',
    'wavespeed-minimax-h3-i2v': 'KIVELLE_VIDEO_ROUTE_MINIMAX_H3_I2V_ENABLED',
    'wavespeed-p-video-i2v': 'KIVELLE_VIDEO_ROUTE_P_VIDEO_I2V_ENABLED',
    'wavespeed-gemini-omni-flash-r2v': 'KIVELLE_VIDEO_ROUTE_GEMINI_OMNI_FLASH_R2V_ENABLED',
  }[id]))].map((name) => [String(name), Deno.env.get(String(name))]));
  Deno.env.set('KIVELLE_VIDEO_ENABLED', 'true'); Deno.env.set('KIVELLE_WAVESPEED_ENABLED', 'true'); Deno.env.set('WAVESPEED_API_KEY', 'test');
  for (const name of Object.keys(before).filter((name) => name.includes('_ROUTE_'))) Deno.env.set(name, 'true');
  return { routes: configuredVideoRouteCatalog(), restore: () => { for (const [name, value] of Object.entries(before)) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value); } };
}

Deno.test('video route builders emit exact model-specific fields without cross-route leakage', () => {
  const state = catalog();
  try {
    const base = { sourceImageUrl: 'https://example.test/source.jpg', canonicalReferenceUrls: ['https://example.test/ref.jpg'], sourceAspectRatio: '9:16' as const, motionPreset: 'subtle' as const };
    const payloads = Object.fromEntries(state.routes.map((route) => [route.id, buildVideoProviderPayload(route, base)]));
    const geminiImage = payloads['wavespeed-gemini-omni-flash-i2v']!;
    const minimax = payloads['wavespeed-minimax-h3-i2v']!;
    const pVideo = payloads['wavespeed-p-video-i2v']!;
    const geminiReferences = payloads['wavespeed-gemini-omni-flash-r2v']!;
    assertEquals(Object.keys(geminiImage).sort(), ['aspect_ratio', 'duration', 'image', 'prompt']);
    assertEquals(minimax.resolution, '768p');
    assertEquals(Object.keys(minimax).sort(), ['duration', 'image', 'prompt', 'resolution']);
    assertEquals(pVideo.save_audio, false);
    assertEquals(Object.keys(pVideo).sort(), ['duration', 'image', 'prompt', 'resolution', 'save_audio', 'seed']);
    assertEquals(geminiReferences.images, ['https://example.test/source.jpg', 'https://example.test/ref.jpg']);
    assertEquals(Object.keys(geminiReferences).sort(), ['aspect_ratio', 'duration', 'images', 'prompt']);
  } finally { state.restore(); }
});

Deno.test('reference route rejects a source without an approved canonical reference', async () => {
  const state = catalog();
  try {
    const route = state.routes.find((item) => item.id.endsWith('r2v'))!;
    await assertRejects(async () => buildVideoProviderPayload(route, { sourceImageUrl: 'https://example.test/source.jpg', sourceAspectRatio: '16:9', motionPreset: 'playful' }));
  } finally { state.restore(); }
});

Deno.test('source orientation maps only to supported video aspect ratios', () => {
  assertEquals(sourceVideoAspectRatio(800, 1200), '9:16');
  assertEquals(sourceVideoAspectRatio(1600, 900), '16:9');
  assertEquals(sourceVideoAspectRatio(null, null), '9:16');
});

Deno.test('selector mode and tester allowlist are enforced on the server', () => {
  const previousMode=Deno.env.get('KIVELLE_VIDEO_MODEL_SELECTOR_MODE'),previousUsers=Deno.env.get('KIVELLE_VIDEO_TESTER_USER_IDS');
  try{
    Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','testers');Deno.env.set('KIVELLE_VIDEO_TESTER_USER_IDS','tester-id, tester@example.test');
    assertEquals(canSelectVideoRoute('other-id','other@example.test'),false);
    assertEquals(canSelectVideoRoute('tester-id',null),true);
    assertEquals(canSelectVideoRoute('other-id','TESTER@example.test'),true);
    Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','all');assertEquals(canSelectVideoRoute('other-id',null),true);
    Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','off');assertEquals(canSelectVideoRoute('tester-id',null),false);
  }finally{previousMode===undefined?Deno.env.delete('KIVELLE_VIDEO_MODEL_SELECTOR_MODE'):Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE',previousMode);previousUsers===undefined?Deno.env.delete('KIVELLE_VIDEO_TESTER_USER_IDS'):Deno.env.set('KIVELLE_VIDEO_TESTER_USER_IDS',previousUsers);}
});

Deno.test('spoofed and disabled canonical route IDs are rejected', async () => {
  const state=catalog(),previousMode=Deno.env.get('KIVELLE_VIDEO_MODEL_SELECTOR_MODE');
  try{
    Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE','all');
    await assertRejects(async()=>resolveVideoRoute('wavespeed/fake-model','user'));
    Deno.env.set('KIVELLE_VIDEO_ROUTE_P_VIDEO_I2V_ENABLED','false');
    await assertRejects(async()=>resolveVideoRoute('wavespeed-p-video-i2v','user'));
    assertEquals(state.routes.every((route)=>route.creditCost===125),true);
  }finally{previousMode===undefined?Deno.env.delete('KIVELLE_VIDEO_MODEL_SELECTOR_MODE'):Deno.env.set('KIVELLE_VIDEO_MODEL_SELECTOR_MODE',previousMode);state.restore();}
});

Deno.test('WaveSpeed price responses require a finite authoritative quote', () => {
  assertEquals(findQuoteAmount({ data: { price: 0.7 } }), 0.7);
  assertEquals(findQuoteAmount({ result: { total_price: '$0.80' } }), 0.8);
  assertEquals(Number.isNaN(findQuoteAmount({ data: { message: 'unknown' } })), true);
});

Deno.test('provider quote ceiling is enforced before reservation',()=>{
  const state=catalog();
  try{
    const route=state.routes[0]!;
    assertVideoQuoteWithinCeiling(route,route.providerCostCeilingUsd);
    assertThrows(()=>assertVideoQuoteWithinCeiling(route,route.providerCostCeilingUsd+.0001),Error,'currently priced above');
  }finally{state.restore();}
});
