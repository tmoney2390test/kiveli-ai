import { VeniceImageClient } from './venice.ts';
import { AppError } from './types.ts';
import { configuredMediaRegistry, routeCanonicalMedia, VeniceMediaProvider, type CanonicalMediaRequest } from './together-media-providers.ts';
import type { MediaRouteCapability } from '../../../packages/together-domain/src/media-routing.ts';

Deno.test('VeniceImageClient sends a canonical single edit and returns PNG bytes', async () => {
  let capturedUrl = ''; let capturedInit: RequestInit | undefined;
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
  const client = new VeniceImageClient('server-secret', 'https://venice.test/api/v1', 1_000, async (url, init) => {
    capturedUrl = String(url); capturedInit = init;
    return new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'cf-ray': 'request-1', 'x-venice-is-blurred': 'false' } });
  });
  const result = await client.edit({ model: 'qwen-edit', prompt: 'preserve identity', images: ['https://signed.test/brooke.jpg'], aspectRatio: '4:5', safeMode: true });
  assert(capturedUrl.endsWith('/image/edit'));
  const body = JSON.parse(String(capturedInit?.body));
  assert(body.model === 'qwen-edit' && body.image === 'https://signed.test/brooke.jpg' && body.safe_mode === true);
  assert((capturedInit?.headers as Record<string,string>).Authorization === 'Bearer server-secret');
  assert(result.providerRequestId === 'request-1' && result.estimatedCost === .04 && result.bytes.length === png.length);
});

Deno.test('VeniceImageClient rejects blurred or policy-violating outputs', async () => {
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'x-venice-is-content-violation': 'true' } }));
  await assertRejectsCode(() => client.edit({ model: 'qwen-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: true }), 'PROVIDER_CONTENT_BLOCKED');
});

Deno.test('VeniceImageClient maps depleted provider credit without exposing provider details', async () => {
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => new Response(JSON.stringify({ error: 'private provider payload' }), { status: 402, headers: { 'content-type': 'application/json' } }));
  await assertRejectsCode(() => client.edit({ model: 'qwen-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: true }), 'PROVIDER_QUOTA');
});

Deno.test('Venice adult media establishes canonical reality before the scoped adult edit', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const bodies: Array<Record<string, unknown>> = [], png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); });
    const provider = new VeniceMediaProvider(client), submission = await provider.submit(adultRequest(), adultRoute());
    assert(submission.status === 'completed' && submission.result?.providerAttempts?.length === 2);
    assert(bodies[0]?.safe_mode === true && bodies[0]?.model === 'qwen-edit');
    assert(bodies[1]?.safe_mode === false && bodies[1]?.model === 'qwen-edit-uncensored');
    assert(typeof bodies[1]?.image === 'string' && !String(bodies[1]?.image).includes('signed.test'));
    assert(submission.result?.estimatedCost === .08);
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated);
  }
});

Deno.test('canonical media routing prefers Venice while preserving feature-gated adult routes', () => {
  const names = ['VENICE_API_KEY','KIVELLE_VENICE_ENABLED','KIVELLE_IMAGE_PROVIDER','KIVELLE_ADULT_MEDIA_ENABLED','KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set('VENICE_API_KEY','test-key'); Deno.env.set('KIVELLE_VENICE_ENABLED','true'); Deno.env.set('KIVELLE_IMAGE_PROVIDER','venice'); Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
    assert(configuredMediaRegistry().some((route) => route.id === 'venice-adult-two-stage'));
    const standard = routeCanonicalMedia({ ...adultRequest(), contentLevel:'standard', generationIntent:undefined }, { source:'user_request',userTier:'free' });
    const adult = routeCanonicalMedia(adultRequest(), { source:'user_request',userTier:'free' });
    assert(standard.route.capability.id === 'venice-qwen-multiref' && standard.provider.id === 'venice');
    assert(adult.route.capability.id === 'venice-adult-two-stage' && adult.provider.id === 'venice');
    Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','false');
    let blocked = false; try { routeCanonicalMedia(adultRequest(), { source:'user_request',userTier:'free' }); } catch (error) { blocked = error instanceof AppError && error.code === 'PROVIDER_UNAVAILABLE'; }
    assert(blocked);
  } finally { for (const name of names) restoreEnv(name, previous[name]); }
});

function assert(condition: unknown): asserts condition { if (!condition) throw new Error('assertion_failed'); }
async function assertRejectsCode(run: () => Promise<unknown>, code: string) { try { await run(); } catch (error) { assert(error instanceof AppError && error.code === code); return; } throw new Error('expected_rejection'); }
function restoreEnv(name: string, value: string | undefined) { if (value == null) Deno.env.delete(name); else Deno.env.set(name, value); }
function adultRoute(): MediaRouteCapability { return { id:'venice-adult-two-stage',provider:'venice',model:'qwen-edit-uncensored',modelFamily:'qwen-image',mediaTypes:['image'],contentLevels:['suggestive','mature','explicit'],supportsCharacterReference:true,supportsLocationReference:true,maxReferenceImages:3,supportsLoRA:false,loraModelFamilies:[],supportsImageEditing:true,supportsImageToVideo:false,qualityTiers:['economy','standard','premium'],estimatedCost:.08,priority:140,enabled:true,asynchronous:false,requiresReferenceImages:true }; }
function adultRequest(): CanonicalMediaRequest { return { mediaId:'media-1',mediaType:'image',generationKind:'companion_photo',companion:{templateId:'template-1',versionId:'version-1',name:'Brooke',age:21},visualIdentity:{canonicalDescription:'A fictional adult blonde woman.',age:21,referenceStoragePaths:['brooke.jpg']},referenceImages:[{role:'character_identity',signedUrl:'https://signed.test/brooke.jpg',contentType:'image/jpeg',name:'brooke.jpg'}],context:{location:{id:'gallery',name:'Glassline Gallery'},activity:'viewing the exhibition',mood:'confident',timeOfDay:'evening',outfitDescription:'linen shirt and denim shorts'},composition:{shotType:'portrait',aspectRatio:'4:5'},contentLevel:'explicit',qualityTier:'standard',generationIntent:{requestText:'remove only the blouse while preserving the shorts and scene',requestedContentLevel:'explicit'} }; }
