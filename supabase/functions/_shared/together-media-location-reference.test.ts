import { VeniceImageClient } from './venice.ts';
import { OpenAIImageProvider, GeminiImageProvider } from './together-media-base.ts';
import { VeniceMediaProvider, veniceReferenceImages, waveSpeedInput, type CanonicalMediaRequest } from './together-media-providers.ts';
import type { MediaRouteCapability } from '../../../packages/together-domain/src/media-routing.ts';

const identity = { role: 'character_identity' as const, name: 'portrait', signedUrl: 'https://assets.test/portrait.webp', contentType: 'image/webp' };
const location = { role: 'location_environment' as const, name: 'planned place', signedUrl: 'https://assets.test/planned-place.webp', contentType: 'image/webp' };
const outfit = { role: 'outfit_continuity' as const, name: 'outfit', signedUrl: 'https://assets.test/old-scene.webp', contentType: 'image/webp' };
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function request(): CanonicalMediaRequest {
  return {
    mediaId: 'location-regression', mediaType: 'image', generationKind: 'companion_photo',
    companion: { templateId: 'template', versionId: 'version', name: 'Alex', age: 30 },
    visualIdentity: { canonicalDescription: 'An adult with short brown hair.', age: 30, referenceStoragePaths: ['portrait.webp'] },
    // Intentionally unsorted: the location must survive the provider's limit.
    referenceImages: [outfit, identity, location],
    context: { location: { id: 'planned-place', name: 'The Reading Room' }, activity: 'reading a book', mood: 'relaxed', timeOfDay: 'evening' },
    composition: { shotType: 'portrait', aspectRatio: '4:5' }, contentLevel: 'standard', qualityTier: 'standard',
    generationIntent: { requestText: 'A portrait in the reading room', requestedContentLevel: 'standard' },
  };
}

function route(): MediaRouteCapability {
  return { id: 'venice-qwen2-reference-edit', provider: 'venice', model: 'qwen-image-2-edit', modelFamily: 'qwen-image', mediaTypes: ['image'], contentLevels: ['standard', 'romance'], supportsCharacterReference: true, supportsLocationReference: true, maxReferenceImages: 3, supportsLoRA: false, loraModelFamilies: [], supportsImageEditing: true, supportsImageToVideo: false, qualityTiers: ['standard'], priority: 1, enabled: true, asynchronous: false };
}

function recorder(rejectFirst = false) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = new VeniceImageClient('test-key', 'https://provider.test', 1_000, async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (rejectFirst && calls.length === 1) return new Response('{}', { status: 503 });
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  });
  return { calls, provider: new VeniceMediaProvider(client) };
}

for (const placeName of ['Dead Letter', 'Solace Orchard', 'Glassline Gallery', 'a private home', 'a custom place']) {
  Deno.test(`Venice sends the selected location image for ${placeName}`, async () => {
    const input = request();
    input.context.location!.name = placeName;
    const before = JSON.stringify(input);
    const { calls, provider } = recorder();
    const result = await provider.submit(input, route());
    equal(calls[0]?.body.images, [identity.signedUrl, location.signedUrl, outfit.signedUrl]);
    assert(calls[0]?.url.endsWith('/image/multi-edit'));
    const prompt = String(calls[0]?.body.prompt);
    assert(prompt.includes('Image 1: character identity only, not its background'));
    assert(prompt.includes('Image 2: target location and background'));
    assert(prompt.includes('Image 3: clothing only, not its background'));
    assert(prompt.includes(placeName));
    assert(calls[0]?.body.safe_mode === true);
    assert(result.result?.providerAttempts?.[0]?.referenceCount === 3);
    assert(JSON.stringify(input) === before);
  });
}

Deno.test('location precedes optional scenery and outfit references under a two-image limit', () => {
  const input = request();
  input.referenceImages.unshift({ ...location, role: 'world_environment', signedUrl: 'https://assets.test/world.webp' });
  equal(veniceReferenceImages(input, { ...route(), maxReferenceImages: 2 }).map((item) => item.signedUrl), [identity.signedUrl, location.signedUrl]);
});

Deno.test('edits retain their source and location without duplicating the source reference', async () => {
  const source = { ...identity, role: 'previous_media' as const, signedUrl: 'https://assets.test/source.webp' };
  const input: CanonicalMediaRequest = { ...request(), generationKind: 'photo_edit', sourceImage: source, referenceImages: [source, ...request().referenceImages], generationIntent: { requestText: 'Make the coat blue', requestedContentLevel: 'standard' } };
  const { calls, provider } = recorder();
  await provider.submit(input, route());
  equal(calls[0]?.body.images, [source.signedUrl, location.signedUrl]);
  assert(String(calls[0]?.body.prompt).includes('preserve the source setting unless relocation is requested'));
});

Deno.test('fallback requests retain the same identity and location image bindings', async () => {
  const { calls, provider } = recorder(true);
  await provider.submit(request(), { ...route(), model: 'qwen-image-2-pro-edit' });
  assert(calls.length === 2);
  equal(calls[0]?.body.images, calls[1]?.body.images);
  assert(String(calls[1]?.body.prompt).includes('Image 2: target location and background'));
});

Deno.test('byte-only location references remain attached and empty references do not displace them', async () => {
  const input = request();
  input.referenceImages = [identity, { ...location, signedUrl: undefined, bytes: png }, { ...outfit, signedUrl: undefined, bytes: new Uint8Array() }];
  const { calls, provider } = recorder();
  await provider.submit(input, route());
  equal(calls[0]?.body.images, [identity.signedUrl, btoa(String.fromCharCode(...png))]);
  assert(String(calls[0]?.body.prompt).includes('Image 2: target location and background'));
});

Deno.test('both pipeline modes use the same identity and location bindings at their initial stage', async () => {
  const names = ['KIVELLE_ADULT_MEDIA_ENABLED', 'KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'];
  const previous = names.map((name) => Deno.env.get(name));
  try {
    names.forEach((name) => Deno.env.set(name, 'true'));
    const input = { ...request(), contentLevel: 'suggestive' as const, adultPipelineAuthorized: true };
    const { calls, provider } = recorder();
    await provider.submit(input, { ...route(), id: 'venice-adult-two-stage', model: 'grok-imagine-edit' });
    equal(calls[0]?.body.images, [identity.signedUrl, location.signedUrl, outfit.signedUrl]);
    assert(String(calls[0]?.body.prompt).includes('Image 2: target location and background'));
    // Later edits use the composed scene rather than reverting to its original portrait.
    equal(calls[1]?.body.images, [`data:image/png;base64,${btoa(String.fromCharCode(...png))}`]);
  } finally {
    names.forEach((name, index) => previous[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[index]!));
  }
});

for (const id of ['wavespeed-kontext-pro-multiref', 'wavespeed-kontext-max-multiref', 'wavespeed-multiref']) {
  Deno.test(`${id} retains the location in its actual provider payload`, () => {
    const payload = waveSpeedInput(request(), { ...route(), id, provider: 'wavespeed' });
    assert((payload.images as string[]).includes(location.signedUrl));
    assert((payload.images as string[]).includes(identity.signedUrl));
  });
  Deno.test(`${id} keeps the edited photo and location in a two-reference request`, () => {
    const input = request();
    input.generationKind = 'photo_edit';
    input.sourceImage = { ...identity, role: 'previous_media', signedUrl: 'https://assets.test/source.webp' };
    const payload = waveSpeedInput(input, { ...route(), id, provider: 'wavespeed', maxReferenceImages: 2 });
    equal(payload.images, [input.sourceImage.signedUrl, location.signedUrl]);
  });
}

for (const provider of [new OpenAIImageProvider('test-key', 'image-model'), new GeminiImageProvider('test-key', 'image-model')]) {
  for (const editing of [false, true]) {
    Deno.test(`${provider.id} transmits location bytes for ${editing ? 'edits' : 'new photos'}`, async () => {
      const input = request();
      input.referenceImages = input.referenceImages.map((item, index) => ({ ...item, bytes: Uint8Array.of(index + 1) }));
      if (editing) {
        input.generationKind = 'photo_edit';
        input.sourceImage = { ...identity, role: 'previous_media', name: 'source', signedUrl: 'https://assets.test/source.webp', bytes: Uint8Array.of(9) };
        input.referenceImages.unshift(input.sourceImage);
      }
      const originalFetch = globalThis.fetch;
      let posted: number[][] = [];
      try {
        globalThis.fetch = async (_url, init) => {
          if (init?.body instanceof FormData) {
            posted = await Promise.all(init.body.getAll('image[]').map(async (file) => [...new Uint8Array(await (file as File).arrayBuffer())]));
            return Response.json({ data: [{ b64_json: 'AQ==' }] });
          }
          const body = JSON.parse(String(init?.body));
          posted = body.contents[0].parts.filter((part: { inline_data?: unknown }) => part.inline_data).map((part: { inline_data: { data: string } }) => [...atob(part.inline_data.data)].map((char) => char.charCodeAt(0)));
          return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'AQ==', mimeType: 'image/png' } }] } }] });
        };
        await provider.generate(input);
        equal(posted, [editing ? [9] : [2], [3]]);
      } finally { globalThis.fetch = originalFetch; }
    });
  }
}

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
function equal(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
