import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { createWebSurfaceAssertion, jwtSubject, releaseFromHtml, scriptPreloadHeader, surfaceCanonical } from './index.js';

const currentEntry = '0123456789abcdef0123456789abcdef';
const currentHtml = `<!doctype html><script src="/_expo/static/js/web/entry-${currentEntry}.js"></script>`;

function environment(response) {
  return { ASSETS: { fetch: async () => response.clone() } };
}

function unsignedJwt(subject) {
  const encoded = Buffer.from(JSON.stringify({ sub: subject })).toString('base64url');
  return `header.${encoded}.signature`;
}

test('derives the release from the generated Expo entry asset', () => {
  assert.equal(releaseFromHtml(currentHtml), currentEntry);
});

test('preloads generated application scripts directly from the HTML response', () => {
  assert.equal(
    scriptPreloadHeader(`${currentHtml}<script src="/_expo/static/js/web/__common-${currentEntry}.js"></script>`),
    `</_expo/static/js/web/entry-${currentEntry}.js>; rel=preload; as=script, </_expo/static/js/web/__common-${currentEntry}.js>; rel=preload; as=script`,
  );
});

test('turns a missing old JavaScript asset into a one-shot release recovery', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/_expo/static/js/web/entry-deadbeefdeadbeef.js'),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(response.headers.get('x-kivelli-asset-status'), 'stale-release-recovery');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /window\.location\.reload/);
});

test('does not serve the SPA document as a missing non-JavaScript asset', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/_expo/static/css/old-release.css'),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-kivelli-asset-status'), 'stale-release');
  assert.match(await response.text(), /older release/i);
});

test('marks a newly generated HTML release without erasing immutable browser assets', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/chat?character=elena-petrova'),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-kivelli-release'), currentEntry);
  assert.equal(response.headers.get('clear-site-data'), null);
  assert.match(response.headers.get('link') ?? '', /rel=preload; as=script/);
  assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`kivelli_release=${currentEntry}`));
  assert.equal(await response.text(), currentHtml);
});

test('does not rewrite the release cookie when the browser already has the current release', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/chat', { headers: { cookie: `kivelli_release=${currentEntry}` } }),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.headers.get('clear-site-data'), null);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('binds the web surface assertion to method, upstream path, user, time, and nonce', async () => {
  const assertion = await createWebSurfaceAssertion({
    secret: 'test-secret-with-enough-entropy',
    method: 'post',
    path: '/functions/v1/together-dialogue',
    userId: '11111111-1111-4111-8111-111111111111',
    now: 1_780_000_000_000,
    nonce: 'nonce-1',
  });
  assert.equal(assertion['x-kivelli-surface'], 'web');
  assert.equal(assertion['x-kivelli-surface-time'], '1780000000');
  assert.equal(assertion['x-kivelli-surface-path'], '/functions/v1/together-dialogue');
  assert.match(assertion['x-kivelli-surface-signature'], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(surfaceCanonical('POST', '/p', 'u', '1', 'n'), 'POST\n/p\nu\n1\nn\nweb');
});

test('extracts only a UUID subject from the bearer token', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  assert.equal(jwtSubject(`Bearer ${unsignedJwt(userId)}`), userId);
  assert.equal(jwtSubject(`Bearer ${unsignedJwt('not-a-user')}`), null);
  assert.equal(jwtSubject('Bearer malformed'), null);
});

test('strips forged surface headers and replaces them with a server signature', { concurrency: false }, async () => {
  const originalFetch=globalThis.fetch,userId='11111111-1111-4111-8111-111111111111';let forwarded;
  globalThis.fetch=async(request)=>{forwarded=request;return new Response('{}',{headers:{'content-type':'application/json'}});};
  try{
    const response=await worker.fetch(new Request('https://kivelli.app/supabase/functions/v1/together-dialogue',{method:'POST',headers:{authorization:`Bearer ${unsignedJwt(userId)}`,'x-kivelli-surface':'web','x-kivelli-surface-user':'22222222-2222-4222-8222-222222222222','x-kivelli-surface-signature':'forged'}}),{KIVELLE_SURFACE_SIGNING_SECRET:'test-secret-with-enough-entropy'});
    assert.equal(response.status,200);
    assert.equal(forwarded.headers.get('x-kivelli-surface-user'),userId);
    assert.equal(forwarded.headers.get('x-kivelli-surface-path'),'/functions/v1/together-dialogue');
    assert.notEqual(forwarded.headers.get('x-kivelli-surface-signature'),'forged');
  }finally{globalThis.fetch=originalFetch;}
});
