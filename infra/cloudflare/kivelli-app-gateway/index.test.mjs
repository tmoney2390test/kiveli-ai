import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { dynamicRouteAssetPath, releaseFromHtml, routeAssetPath } from './index.js';

const currentEntry = '0123456789abcdef0123456789abcdef';
const currentHtml = `<!doctype html><script src="/_expo/static/js/web/entry-${currentEntry}.js"></script>`;

function environment(response) {
  return { ASSETS: { fetch: async () => response.clone() } };
}

test('derives the release from the generated Expo entry asset', () => {
  assert.equal(releaseFromHtml(currentHtml), currentEntry);
});

test('maps dynamic app URLs to their exported Expo route shells', () => {
  assert.equal(dynamicRouteAssetPath('/location/juniper-civic-arena'), '/location/[slug].html');
  assert.equal(dynamicRouteAssetPath('/media/2346aee9-3dd3-4e9c-99b7-7feacfc859cc'), '/media/[id].html');
  assert.equal(dynamicRouteAssetPath('/create/companion/draft-1'), '/create/companion/[draftId].html');
  assert.equal(dynamicRouteAssetPath('/explore'), null);
  assert.equal(dynamicRouteAssetPath('/location/[slug].html'), null);
});

test('maps static app URLs to exact HTML assets without Cloudflare redirects', () => {
  assert.equal(routeAssetPath('/'), '/index.html');
  assert.equal(routeAssetPath('/explore'), '/explore.html');
  assert.equal(routeAssetPath('/world/places'), '/world/places.html');
  assert.equal(routeAssetPath('/settings/'), '/settings.html');
  assert.equal(routeAssetPath('/favicon.ico'), null);
  assert.equal(routeAssetPath('/_expo/static/js/web/entry-0123456789abcdef.js'), null);
});

test('serves a dynamic route shell without redirecting through the root document', async () => {
  let assetRequestUrl = null;
  const response = await worker.fetch(
    new Request('https://kivelli.app/location/juniper-civic-arena?world=juniper-city'),
    { ASSETS: { fetch: async (request) => {
      assetRequestUrl = request.url;
      return new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } } },
  );
  assert.equal(new URL(assetRequestUrl).pathname, '/location/%5Bslug%5D.html');
  assert.equal(new URL(assetRequestUrl).search, '?world=juniper-city');
  assert.equal(response.headers.get('x-kivelli-route-shell'), '/location/[slug].html');
  assert.equal(response.status, 200);
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

test('marks a newly generated HTML release and clears stale browser cache', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/chat?character=elena-petrova'),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-kivelli-release'), currentEntry);
  assert.equal(response.headers.get('clear-site-data'), '"cache"');
  assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`kivelli_release=${currentEntry}`));
  assert.equal(await response.text(), currentHtml);
});

test('does not clear cache again when the browser already has the current release', async () => {
  const response = await worker.fetch(
    new Request('https://kivelli.app/chat', { headers: { cookie: `kivelli_release=${currentEntry}` } }),
    environment(new Response(currentHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
  );
  assert.equal(response.headers.get('clear-site-data'), null);
  assert.equal(response.headers.get('set-cookie'), null);
});
