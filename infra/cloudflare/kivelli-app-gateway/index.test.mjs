import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { releaseFromHtml } from './index.js';

const currentEntry = '0123456789abcdef0123456789abcdef';
const currentHtml = `<!doctype html><script src="/_expo/static/js/web/entry-${currentEntry}.js"></script>`;

function environment(response) {
  return { ASSETS: { fetch: async () => response.clone() } };
}

test('derives the release from the generated Expo entry asset', () => {
  assert.equal(releaseFromHtml(currentHtml), currentEntry);
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
