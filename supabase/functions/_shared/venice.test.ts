import { VeniceImageClient } from './venice.ts';
import { AppError } from './types.ts';
import { buildVeniceImagePrompt, configuredMediaRegistry, routeCanonicalMedia, VeniceMediaProvider, type CanonicalMediaRequest } from './together-media-providers.ts';
import { VENICE_ADULT_FINAL_EDIT_MODEL, VENICE_STANDARD_EDIT_MODEL } from '../../../packages/together-domain/src/venice-media.ts';
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
  assert(body.model === 'qwen-edit' && body.image === 'https://signed.test/brooke.jpg' && body.safe_mode == null && body.aspect_ratio == null);
  assert((capturedInit?.headers as Record<string,string>).Authorization === 'Bearer server-secret');
  assert(result.providerRequestId === 'request-1' && result.estimatedCost === .04 && result.bytes.length === png.length);
});

Deno.test('VeniceImageClient accepts a correctly signed JPEG result from multi-edit', async () => {
  const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xe0,1,2,3]);
  const client = new VeniceImageClient('server-secret', 'https://venice.test/api/v1', 1_000, async () => new Response(jpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  const result = await client.edit({ model: 'grok-imagine-edit', prompt: 'preserve identity', images: ['base64-image'], aspectRatio: '4:5', safeMode: false, forceMultiEdit: true });
  assert(result.contentType === 'image/jpeg' && result.bytes.length === jpeg.length);
});

Deno.test('VeniceImageClient rejects a mismatched image content type and signature', async () => {
  const fake = new TextEncoder().encode('{"not":"an image"}');
  const client = new VeniceImageClient('server-secret', 'https://venice.test/api/v1', 1_000, async () => new Response(fake, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  await assertRejectsCode(() => client.edit({ model: 'grok-imagine-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: false, forceMultiEdit: true }), 'PROVIDER_SUBMISSION_UNKNOWN');
});

Deno.test('VeniceImageClient rejects blurred or policy-violating outputs', async () => {
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'x-venice-is-content-violation': 'true' } }));
  await assertRejectsCode(() => client.edit({ model: 'qwen-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: true }), 'PROVIDER_CONTENT_BLOCKED');
});

Deno.test('VeniceImageClient preserves the adult-model policy signal as a distinct hard block', async () => {
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'x-venice-is-adult-model-content-violation': 'true' } }));
  await assertRejectsCode(() => client.edit({ model: 'grok-imagine-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: false, forceMultiEdit: true }), 'PROVIDER_ADULT_MODEL_CONTENT_BLOCKED');
});

Deno.test('VeniceImageClient maps depleted provider credit without exposing provider details', async () => {
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => new Response(JSON.stringify({ error: 'private provider payload' }), { status: 402, headers: { 'content-type': 'application/json' } }));
  await assertRejectsCode(() => client.edit({ model: 'qwen-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: true }), 'PROVIDER_QUOTA');
});

Deno.test('VeniceImageClient maps HTTP 422 to a non-retryable content block', async () => {
  let calls = 0;
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => { calls += 1; return new Response('{"private":"provider detail"}', { status: 422, headers: { 'content-type': 'application/json' } }); });
  await assertRejectsCode(() => client.edit({ model: 'grok-imagine-quality-edit', prompt: 'test', images: ['image'], aspectRatio: '1:1', safeMode: false, forceMultiEdit: true }), 'PROVIDER_CONTENT_BLOCKED');
  assert(calls === 1);
});

Deno.test('VeniceImageClient performs provider-neutral vision quality checks without WaveSpeed', async () => {
  let capturedUrl = ''; let body: Record<string, unknown> = {};
  const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (url, init) => {
    capturedUrl = String(url); body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id:'quality-1',model:'qwen3-vl-235b-a22b',choices:[{message:{content:'PASS'}}],cost:{usd:.0002} }), { status:200,headers:{'content-type':'application/json'} });
  });
  const result = await client.assessQuality({ imageUrl:'https://signed.test/output.png',prompt:'Check quality.' });
  assert(capturedUrl.endsWith('/chat/completions') && body.model === 'qwen3-vl-235b-a22b');
  const messages = body.messages as Array<Record<string, unknown>>, content = messages[0]?.content as Array<Record<string, unknown>>;
  assert(content[1]?.type === 'image_url' && result.content === 'PASS' && result.actualCostUsd === .0002);
});

Deno.test('Venice adult media establishes canonical reality before an explicitly unblurred adult edit', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const calls: Array<{url:string;body:Record<string, unknown>}> = [], png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (url, init) => { calls.push({url:String(url),body:JSON.parse(String(init?.body))}); return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); });
    const provider = new VeniceMediaProvider(client), submission = await provider.submit(adultRequest(), adultRoute());
    assert(submission.status === 'completed' && submission.result?.providerAttempts?.length === 2);
    assert(calls[0]?.url.endsWith('/image/multi-edit')&&calls[0]?.body.modelId === 'grok-imagine-edit'&&calls[0]?.body.safe_mode===false&&calls[0]?.body.output_format==='webp'&&calls[0]?.body.resolution==='1K');
    assert(calls[1]?.url.endsWith('/image/multi-edit')&&calls[1]?.body.modelId === VENICE_ADULT_FINAL_EDIT_MODEL&&calls[1]?.body.safe_mode === false&&calls[1]?.body.output_format==='webp'&&calls[1]?.body.resolution==='1K');
    assert(Array.isArray(calls[1]?.body.images)&&String(calls[1]?.body.images?.[0]).startsWith('data:image/png;base64,')&&!String(calls[1]?.body.images?.[0]).includes('signed.test'));
    assert(String(calls[1]?.body.prompt).includes('five fingers')&&String(calls[1]?.body.prompt).includes('Preserve the same adult identity'));
    assert(String(calls[1]?.body.prompt).length<=1_200);
    assert(submission.result?.estimatedCost === .09);
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated);
  }
});

Deno.test('Venice adult media falls through to the scoped final edit when the Grok base contract is rejected',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
  const calls:Array<{url:string;body:Record<string,unknown>}>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(url,init)=>{const body=JSON.parse(String(init?.body)) as Record<string,unknown>;calls.push({url:String(url),body});return calls.length===1?new Response('{}',{status:400}):new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit(adultRequest(),adultRoute());
    assert(calls.length===2&&calls[0]?.url.endsWith('/image/multi-edit')&&calls[0]?.body.modelId==='grok-imagine-edit');
    assert(calls[1]?.url.endsWith('/image/multi-edit')&&calls[1]?.body.modelId===VENICE_ADULT_FINAL_EDIT_MODEL);
    assert(submission.result?.providerMetadata?.pipeline==='direct_adult_fallback_after_base_rejection'&&submission.result?.providerMetadata?.fallbackUsed===true);
    assert(submission.result?.providerAttempts?.[0]?.failureCode==='PROVIDER_REQUEST_INVALID'&&submission.result?.providerAttempts?.[1]?.success===true);
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('Venice adult base preserves approved away-facing pose before the final edit', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const bodies: Array<Record<string, unknown>> = [], png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); });
    const request={...adultRequest(),generationIntent:{requestText:'bent over from behind, facing away, with her face covered',requestedContentLevel:'explicit' as const}};
    await new VeniceMediaProvider(client).submit(request, adultRoute());
    assert(String(bodies[0]?.prompt).includes('body bent forward')&&String(bodies[0]?.prompt).includes('back toward the camera'));
    assert(String(bodies[0]?.prompt).includes('Do not turn or insert the face toward the camera'));
    assert(String(bodies[1]?.prompt).includes('Pose: body bent forward'));
    assert(String(bodies[1]?.prompt).includes('Keep the face hidden or away')&&String(bodies[1]?.prompt).includes('camera-facing smile'));
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated);
  }
});

Deno.test('Venice keeps a face-down-in-pillows request away from the camera in both adult stages',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
  const prompts:string[]=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{prompts.push(String((JSON.parse(String(init?.body)) as Record<string,unknown>).prompt));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    await new VeniceMediaProvider(client).submit({...adultRequest(),composition:{shotType:'full_body' as const,aspectRatio:'4:5'},generationIntent:{requestText:'Send me a photo face down in the pillows',requestedContentLevel:'explicit' as const}},adultRoute());
    assert(prompts.length===2);
    for(const prompt of prompts){assert(prompt.includes('prone pose lying face-first')&&prompt.includes('directed into the pillows')&&prompt.includes('No eye contact')&&prompt.includes('camera-facing smile'));}
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('Venice preserves the complete natural-language pose matrix across both reference-preserving stages',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
  const cases:Array<[string,string,string]>=[
    ['on all fours from a rear three-quarter angle looking over one shoulder','all-fours pose','rear three-quarter'],
    ['on her back with knees open from a high three-quarter angle','supported supine pose','elevated three-quarter'],
    ['straddling a chair facing the camera','seated straddle pose','no second person'],
    ['pressed against a wall with one knee raised','supported against a wall or door','one leg naturally raised'],
    ['bent over with both hands braced on a chair','bent forward at the waist','coherent spine'],
    ['kneeling upright with hands on thighs','upright kneeling pose','torso balanced'],
    ['in an overhead starfish pose','reclined starfish pose','overhead camera'],
    ['lying on her side with the top knee bent','supported side-lying pose','coherent profile'],
    ['arching her back in side view','anatomically plausible back arch','continuous natural spine'],
    ['on her back with both legs raised in an overhead view','both legs elevated','overhead camera'],
  ];
  const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    for(const[pose,firstCue,secondCue]of cases){
      const prompts:string[]=[],client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{prompts.push(String((JSON.parse(String(init?.body)) as Record<string,unknown>).prompt));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
      const request={...adultRequest(),composition:{shotType:'full_body' as const,aspectRatio:'4:5'},generationIntent:{requestText:`Send a full-body photo ${pose}`,requestedContentLevel:'explicit' as const}};
      await new VeniceMediaProvider(client).submit(request,adultRoute());
      assert(prompts.length===2);
      for(const prompt of prompts){assert(prompt.includes(firstCue)&&prompt.includes(secondCue));}
      assert(prompts[0]?.includes('One person only'));
      assert(prompts[1]?.includes('One coherent adult body'));
    }
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('Venice pose-rebuild nudes edit the identity photo with the uncensored Qwen model', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const bodies: Array<Record<string, unknown>> = [], png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); });
    const submission = await new VeniceMediaProvider(client).submit({
      ...adultRequest(),
      composition: { shotType: 'full_body', aspectRatio: '4:5' },
      generationIntent: { requestText: 'Send me a photo showing exactly this: naked photo bent over with your ass and pussy on display front and center', requestedContentLevel: 'explicit' },
    }, adultRoute());
    assert(bodies.length === 1);
    assert(bodies[0]?.model === VENICE_ADULT_FINAL_EDIT_MODEL && bodies[0]?.safe_mode === false);
    assert(bodies[0]?.image === 'https://signed.test/brooke.jpg');
    assert(!('modelId' in bodies[0]!) && !('resolution' in bodies[0]!) && !('output_format' in bodies[0]!));
    const prompt = String(bodies[0]?.prompt);
    assert(prompt.length <= 800);
    assert(prompt.includes('NEW photograph') && prompt.includes('identity'));
    assert(prompt.includes('naked photo bent over') && /buttocks and genitals fill the center of the frame|full adult nudity/i.test(prompt));
    assert(submission.result?.providerMetadata?.pipeline === 'uncensored_adult_identity_edit');
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated);
  }
});

Deno.test('Venice pose-rebuild nudes fall back to FireRed on the compact uncensored edit contract', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'), previousFallback = Deno.env.get('KIVELLE_VENICE_ADULT_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_FALLBACK_MODEL', 'firered-image-edit');
  const calls: Array<{url:string;body:Record<string, unknown>}> = [];
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,7]);
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({url:String(url),body});
      if (body.model === 'firered-image-edit') return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
      return new Response('{}', { status: 400 });
    });
    const submission = await new VeniceMediaProvider(client).submit({
      ...adultRequest(),
      generationIntent: { requestText: 'Send me a photo showing exactly this: naked photo bent over with your ass and pussy on display front and center', requestedContentLevel: 'explicit' },
    }, adultRoute());
    assert(calls.length === 2 && calls[0]?.url.endsWith('/image/edit') && calls[1]?.url.endsWith('/image/edit'));
    assert(calls[0]?.body.model === VENICE_ADULT_FINAL_EDIT_MODEL && calls[1]?.body.model === 'firered-image-edit');
    assert(calls[0]?.body.safe_mode === false && calls[1]?.body.safe_mode === false);
    assert(submission.model === 'firered-image-edit' && submission.result?.providerMetadata?.pipeline === 'uncensored_adult_identity_edit');
    assert(submission.result?.providerMetadata?.fallbackUsed === true);
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated); restoreEnv('KIVELLE_VENICE_ADULT_FALLBACK_MODEL', previousFallback);
  }
});

Deno.test('Venice adult prompt renders full nudity completely without escalating topless scope', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const prompts:string[]=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{prompts.push(String((JSON.parse(String(init?.body)) as Record<string,unknown>).prompt));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    await new VeniceMediaProvider(client).submit({...adultRequest(),generationIntent:{requestText:'send a fully nude photo from behind',requestedContentLevel:'explicit'}},adultRoute());
    assert(/full adult nudity/i.test(prompts[0]??'')&&/genitalia|buttocks/i.test(prompts[0]??'')&&prompts[0]!.includes('from behind'));
    prompts.length=0;
    await new VeniceMediaProvider(client).submit(adultRequest(),adultRoute());
    assert(prompts[1]?.includes('Approved scope: upper-body nudity only')&&prompts[1]?.includes('do not expose unrequested lower anatomy'));
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('Venice adult prompt uncovers specifically requested anatomy by default and honors an explicit coverage override',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
  const prompts:string[]=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{prompts.push(String((JSON.parse(String(init?.body)) as Record<string,unknown>).prompt));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    await new VeniceMediaProvider(client).submit({...adultRequest(),generationIntent:{requestText:'show me your vulva sitting on the couch',requestedContentLevel:'explicit'}},adultRoute());
    assert(prompts[0]?.includes('vulva')&&/uncovered|nudity|anatomy/i.test(prompts[0]??'')&&prompts[0]!.includes('NEW photograph'));
    prompts.length=0;
    await new VeniceMediaProvider(client).submit({...adultRequest(),generationIntent:{requestText:'show me your vulva through your panties and keep them on',requestedContentLevel:'explicit'}},adultRoute());
    assert(prompts[1]?.includes('coverage explicitly retained')&&prompts[1]?.includes('do not expose anatomy through it'));
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('Venice adult media retries a transient stage once and records each provider request', async () => {
  const previousAdult = Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'), previousValidated = Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED', 'true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', 'true');
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]); let calls = 0;
  try {
    const client = new VeniceImageClient('secret', 'https://venice.test/api/v1', 1_000, async () => { calls += 1; return calls === 1 ? new Response('{}', { status: 503 }) : new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); });
    const submission = await new VeniceMediaProvider(client).submit(adultRequest(), adultRoute());
    assert(calls === 3 && submission.result?.providerAttempts?.length === 3);
    assert(submission.result?.providerAttempts?.[0]?.success === false && submission.result?.providerAttempts?.[0]?.failureCode === 'PROVIDER_UNAVAILABLE');
    assert(submission.result?.providerAttempts?.[1]?.stage === 'canonical_base' && submission.result?.providerAttempts?.[1]?.success === true);
    assert(submission.result?.providerAttempts?.[2]?.stage === 'final_adult_edit' && submission.result?.providerAttempts?.[2]?.success === true);
  } finally {
    restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED', previousAdult); restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED', previousValidated);
  }
});

Deno.test('Venice adult final edit stays on Venice and falls back to FireRed after Qwen inference failure',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'),previousFallback=Deno.env.get('KIVELLE_VENICE_ADULT_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');Deno.env.set('KIVELLE_VENICE_ADULT_FALLBACK_MODEL','firered-image-edit');
  const calls:Array<Record<string,unknown>>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{const body=JSON.parse(String(init?.body)) as Record<string,unknown>;calls.push(body);return calls.length===2?new Response('{}',{status:500}):new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit(adultRequest(),adultRoute());
    assert(calls.length===3&&calls[0]?.modelId==='grok-imagine-edit'&&calls[1]?.modelId===VENICE_ADULT_FINAL_EDIT_MODEL&&calls[2]?.modelId==='firered-image-edit');
    assert(submission.model==='firered-image-edit'&&submission.result?.providerMetadata?.fallbackUsed===true);
    assert(submission.result?.providerAttempts?.[1]?.stage==='final_adult_edit'&&submission.result?.providerAttempts?.[1]?.failureCode==='PROVIDER_MODEL');
    assert(submission.result?.providerAttempts?.[2]?.stage==='final_adult_fallback'&&submission.result?.providerAttempts?.[2]?.success===true);
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);restoreEnv('KIVELLE_VENICE_ADULT_FALLBACK_MODEL',previousFallback);}
});

Deno.test('Venice adult final edit falls back after a Qwen request rejection at the model boundary',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'),previousFallback=Deno.env.get('KIVELLE_VENICE_ADULT_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');Deno.env.set('KIVELLE_VENICE_ADULT_FALLBACK_MODEL','firered-image-edit');
  const calls:Array<Record<string,unknown>>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{const body=JSON.parse(String(init?.body)) as Record<string,unknown>;calls.push(body);return calls.length===2?new Response('{}',{status:400}):new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit(adultRequest(),adultRoute());
    assert(calls.length===3&&calls[0]?.modelId==='grok-imagine-edit'&&calls[1]?.modelId===VENICE_ADULT_FINAL_EDIT_MODEL&&calls[2]?.modelId==='firered-image-edit');
    assert(submission.model==='firered-image-edit'&&submission.result?.providerMetadata?.fallbackUsed===true);
    assert(submission.result?.providerAttempts?.[1]?.failureCode==='PROVIDER_REQUEST_INVALID'&&submission.result?.providerAttempts?.[2]?.success===true);
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);restoreEnv('KIVELLE_VENICE_ADULT_FALLBACK_MODEL',previousFallback);}
});

Deno.test('Venice standard media uses the documented multi-edit FireRed contract after a retryable primary model failure',async()=>{
  const previousFallback=Deno.env.get('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL','firered-image-edit');
  const calls:Array<{url:string;body:Record<string,unknown>}>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(url,init)=>{const body=JSON.parse(String(init?.body)) as Record<string,unknown>;calls.push({url:String(url),body});return calls.length===1?new Response('{}',{status:500}):new Response(png,{status:200,headers:{'content-type':'image/png','cf-ray':'fallback-1'}});});
    const request={...adultRequest(),contentLevel:'standard' as const,generationIntent:undefined};
    const submission=await new VeniceMediaProvider(client).submit(request,standardRoute());
    assert(calls.length===2&&calls[0]!.url.endsWith('/image/multi-edit')&&calls[1]!.url.endsWith('/image/multi-edit'));
    assert(calls[0]!.body.modelId===VENICE_STANDARD_EDIT_MODEL&&calls[0]!.body.aspect_ratio==='4:5'&&calls[0]!.body.output_format==='webp'&&calls[0]!.body.resolution==='1K');
    assert(calls[1]!.body.modelId==='firered-image-edit'&&calls[1]!.body.safe_mode===true&&calls[1]!.body.output_format==='webp'&&calls[1]!.body.resolution==='1K');
    assert(submission.model==='firered-image-edit'&&submission.result?.providerMetadata?.fallbackUsed===true);
    assert(submission.result?.providerAttempts?.length===2&&submission.result.providerAttempts[0]?.failureCode==='PROVIDER_MODEL'&&submission.result.providerAttempts[1]?.success===true);
    assert(submission.result?.estimatedCost===.09);
  }finally{restoreEnv('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL',previousFallback);}
});

Deno.test('Venice standard media treats a blurred primary output as model suppression and uses the safe fallback',async()=>{
  const previousFallback=Deno.env.get('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL','firered-image-edit');
  const calls:Array<Record<string,unknown>>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{calls.push(JSON.parse(String(init?.body)) as Record<string,unknown>);return calls.length===1?new Response(png,{status:200,headers:{'content-type':'image/png','x-venice-is-blurred':'true'}}):new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit({...adultRequest(),contentLevel:'standard',generationIntent:undefined},standardRoute());
    assert(calls.length===2&&calls[0]?.modelId===VENICE_STANDARD_EDIT_MODEL&&calls[1]?.modelId==='firered-image-edit');
    assert(submission.model==='firered-image-edit'&&submission.result?.providerMetadata?.fallbackUsed===true);
    assert(submission.result?.providerAttempts?.[0]?.failureCode==='PROVIDER_OUTPUT_BLURRED'&&submission.result?.providerAttempts?.[1]?.success===true);
  }finally{restoreEnv('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL',previousFallback);}
});

Deno.test('Venice standard media does not bypass a non-retryable content block with a fallback',async()=>{
  let calls=0;const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async()=>{calls+=1;return new Response('{}',{status:422});});
  try{await new VeniceMediaProvider(client).submit({...adultRequest(),contentLevel:'standard',generationIntent:undefined},standardRoute());}
  catch(error){assert(error instanceof AppError&&error.code==='PROVIDER_CONTENT_BLOCKED'&&calls===1);return;}
  throw new Error('expected_rejection');
});

Deno.test('Venice standard media falls back after a provider request-shape rejection',async()=>{
  const previousFallback=Deno.env.get('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL');
  Deno.env.set('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL','firered-image-edit');
  let calls=0;const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async()=>{calls+=1;return calls===1?new Response('{}',{status:400}):new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit({...adultRequest(),contentLevel:'standard',generationIntent:undefined},standardRoute());
    assert(calls===2&&submission.model==='firered-image-edit'&&submission.result?.providerAttempts?.[0]?.failureCode==='PROVIDER_REQUEST_INVALID');
  }finally{restoreEnv('KIVELLE_VENICE_STANDARD_FALLBACK_MODEL',previousFallback);}
});

Deno.test('Venice prompt keeps canonical identity and scene inside the provider limit', () => {
  const request=adultRequest(),prompt=buildVeniceImagePrompt(request);
  assert(prompt.length<=2_000);
  assert(prompt.includes('Brooke')&&prompt.includes('Glassline Gallery')&&prompt.includes('viewing the exhibition'));
  assert(prompt.includes('input image only to preserve the exact same adult face'));
  assert(prompt.includes('five distinct naturally arranged fingers')&&prompt.includes('No fused or duplicated body parts'));
});

Deno.test('Venice prompt honors intentional face concealment without weakening anatomy', () => {
  const request={...adultRequest(),generationIntent:{requestText:'bent over from behind with her face covered',requestedContentLevel:'explicit' as const}},prompt=buildVeniceImagePrompt(request);
  assert(prompt.includes('Do not force a face into view'));
  assert(prompt.includes('five distinct naturally arranged fingers'));
});

Deno.test('Venice standard photo edits use the selected photo as the sole edit source',async()=>{
  const bodies:Array<Record<string,unknown>>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
  const request=photoEditRequest('Fix the distorted hands','standard');
  await new VeniceMediaProvider(client).submit(request,standardRoute());
  assert(bodies.length===1&&Array.isArray(bodies[0]?.images)&&bodies[0]?.images[0]==='https://signed.test/source-photo.jpg');
  assert(String(bodies[0]?.prompt).includes('Apply only this requested change')&&String(bodies[0]?.prompt).includes('corrective repair'));
  assert(!String(bodies[0]?.images).includes('brooke.jpg'));
});

Deno.test('Venice adult photo edits preserve the chosen source without regenerating a neutral base',async()=>{
  const previousAdult=Deno.env.get('KIVELLE_ADULT_MEDIA_ENABLED'),previousValidated=Deno.env.get('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED');
  Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true');Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
  const bodies:Array<Record<string,unknown>>=[],png=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
  try{
    const client=new VeniceImageClient('secret','https://venice.test/api/v1',1_000,async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(png,{status:200,headers:{'content-type':'image/png'}});});
    const submission=await new VeniceMediaProvider(client).submit(photoEditRequest('Change the pose to sitting with legs spread open','explicit'),adultRoute());
    assert(bodies.length===1&&Array.isArray(bodies[0]?.images)&&bodies[0]?.images?.[0]==='https://signed.test/source-photo.jpg'&&bodies[0]?.modelId===VENICE_ADULT_FINAL_EDIT_MODEL&&bodies[0]?.safe_mode===false);
    assert(String(bodies[0]?.prompt).includes('preserve every visual element the request does not explicitly change'));
    assert(submission.result?.providerMetadata?.pipeline==='scoped_adult_source_edit');
  }finally{restoreEnv('KIVELLE_ADULT_MEDIA_ENABLED',previousAdult);restoreEnv('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED',previousValidated);}
});

Deno.test('canonical media routing prefers Venice while preserving feature-gated adult routes', () => {
  const names = ['VENICE_API_KEY','KIVELLE_VENICE_ENABLED','KIVELLE_IMAGE_PROVIDER','KIVELLE_ADULT_MEDIA_ENABLED','KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set('VENICE_API_KEY','test-key'); Deno.env.set('KIVELLE_VENICE_ENABLED','true'); Deno.env.set('KIVELLE_IMAGE_PROVIDER','venice'); Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
    assert(configuredMediaRegistry().some((route) => route.id === 'venice-adult-two-stage'));
    const standard = routeCanonicalMedia({ ...adultRequest(), contentLevel:'standard', generationIntent:undefined }, { source:'user_request',userTier:'free' });
    const adult = routeCanonicalMedia(adultRequest(), { source:'user_request',userTier:'free' });
    assert(standard.route.capability.id === 'venice-qwen2-reference-edit' && standard.provider.id === 'venice');
    assert(adult.route.capability.id === 'venice-adult-two-stage' && adult.provider.id === 'venice');
    Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','false');
    let blocked = false; try { routeCanonicalMedia(adultRequest(), { source:'user_request',userTier:'free' }); } catch (error) { blocked = error instanceof AppError && error.code === 'PROVIDER_UNAVAILABLE'; }
    assert(blocked);
  } finally { for (const name of names) restoreEnv(name, previous[name]); }
});

Deno.test('canonical media routing keeps ordinary photos on OpenAI while retaining Venice for adult photos', () => {
  const names = ['OPENAI_API_KEY','VENICE_API_KEY','KIVELLE_VENICE_ENABLED','KIVELLE_IMAGE_PROVIDER','KIVELLE_ADULT_MEDIA_ENABLED','KIVELLE_VENICE_ADULT_ROUTE_VALIDATED'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, Deno.env.get(name)]));
  try {
    Deno.env.set('OPENAI_API_KEY','openai-test-key'); Deno.env.set('VENICE_API_KEY','venice-test-key'); Deno.env.set('KIVELLE_VENICE_ENABLED','true'); Deno.env.set('KIVELLE_IMAGE_PROVIDER','openai'); Deno.env.set('KIVELLE_ADULT_MEDIA_ENABLED','true'); Deno.env.set('KIVELLE_VENICE_ADULT_ROUTE_VALIDATED','true');
    const standard = routeCanonicalMedia({ ...adultRequest(), contentLevel:'standard', generationIntent:undefined }, { source:'user_request',userTier:'free' });
    const adult = routeCanonicalMedia(adultRequest(), { source:'user_request',userTier:'free' });
    assert(standard.route.capability.id === 'openai-image' && standard.provider.id === 'openai');
    assert(adult.route.capability.id === 'venice-adult-two-stage' && adult.provider.id === 'venice');
  } finally { for (const name of names) restoreEnv(name, previous[name]); }
});

function assert(condition: unknown): asserts condition { if (!condition) throw new Error('assertion_failed'); }
async function assertRejectsCode(run: () => Promise<unknown>, code: string) { try { await run(); } catch (error) { assert(error instanceof AppError && error.code === code); return; } throw new Error('expected_rejection'); }
function restoreEnv(name: string, value: string | undefined) { if (value == null) Deno.env.delete(name); else Deno.env.set(name, value); }
function adultRoute(): MediaRouteCapability { return { id:'venice-adult-two-stage',provider:'venice',model:'grok-imagine-edit',modelFamily:'grok-image',mediaTypes:['image'],contentLevels:['suggestive','mature','explicit'],supportsCharacterReference:true,supportsLocationReference:true,maxReferenceImages:3,supportsLoRA:false,loraModelFamilies:[],supportsImageEditing:true,supportsImageToVideo:false,qualityTiers:['economy','standard','premium'],estimatedCost:.08,priority:140,enabled:true,asynchronous:false,requiresReferenceImages:true }; }
function standardRoute():MediaRouteCapability{return{id:'venice-qwen2-reference-edit',provider:'venice',model:VENICE_STANDARD_EDIT_MODEL,modelFamily:'qwen-image',mediaTypes:['image'],contentLevels:['standard','romance'],supportsCharacterReference:true,supportsLocationReference:true,maxReferenceImages:3,supportsLoRA:false,loraModelFamilies:[],supportsImageEditing:true,supportsImageToVideo:false,qualityTiers:['economy','standard','premium'],estimatedCost:.05,priority:130,enabled:true,asynchronous:false,requiresReferenceImages:true};}
function adultRequest(): CanonicalMediaRequest { return { mediaId:'media-1',mediaType:'image',generationKind:'companion_photo',companion:{templateId:'template-1',versionId:'version-1',name:'Brooke',age:21},visualIdentity:{canonicalDescription:'A fictional adult blonde woman.',age:21,referenceStoragePaths:['brooke.jpg']},referenceImages:[{role:'character_identity',signedUrl:'https://signed.test/brooke.jpg',contentType:'image/jpeg',name:'brooke.jpg'}],context:{location:{id:'gallery',name:'Glassline Gallery'},activity:'viewing the exhibition',mood:'confident',timeOfDay:'evening',outfitDescription:'linen shirt and denim shorts'},composition:{shotType:'portrait',aspectRatio:'4:5'},contentLevel:'explicit',qualityTier:'standard',adultPipelineAuthorized:true,generationIntent:{requestText:'remove only the blouse while preserving the shorts and scene',requestedContentLevel:'explicit'} }; }
function photoEditRequest(instruction:string,contentLevel:'standard'|'explicit'):CanonicalMediaRequest{const base=adultRequest(),source={role:'previous_media' as const,signedUrl:'https://signed.test/source-photo.jpg',contentType:'image/jpeg',name:'source-photo.jpg'};return{...base,mediaId:'edit-1',generationKind:'photo_edit',contentLevel,referenceImages:[source,...base.referenceImages],sourceImage:source,generationIntent:{requestText:instruction,requestedContentLevel:contentLevel}};}
