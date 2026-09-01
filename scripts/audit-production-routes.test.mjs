import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { criticalAssetPaths, routeFromAppPath, routeFromHtmlPath } from './audit-production-routes.mjs';

test('maps concrete static output to public routes', () => {
  const dist = resolve('apps/together/dist');
  assert.equal(routeFromHtmlPath(dist, resolve(dist, 'index.html')), '/');
  assert.equal(routeFromHtmlPath(dist, resolve(dist, '(tabs)/home.html')), '/home');
  assert.equal(routeFromHtmlPath(dist, resolve(dist, 'character/iris-vale.html')), '/character/iris-vale');
  assert.equal(routeFromHtmlPath(dist, resolve(dist, 'media/[id].html')), null);
  assert.equal(routeFromHtmlPath(dist, resolve(dist, '+not-found.html')), null);
});

test('extracts and deduplicates only critical web assets', () => {
  const html = '<script src="/_expo/static/js/web/entry-a.js"></script><script src="/_expo/static/js/web/entry-a.js"></script><link href="/_expo/static/css/app.css"><img src="/hero.png">';
  assert.deepEqual(criticalAssetPaths(html), ['/_expo/static/js/web/entry-a.js', '/_expo/static/css/app.css']);
});

test('derives static SPA routes from the Expo route source tree', () => {
  const app = resolve('apps/together/app');
  assert.equal(routeFromAppPath(app, resolve(app, 'index.tsx')), '/');
  assert.equal(routeFromAppPath(app, resolve(app, '(tabs)/explore.tsx')), '/explore');
  assert.equal(routeFromAppPath(app, resolve(app, 'auth/callback.tsx')), '/auth/callback');
  assert.equal(routeFromAppPath(app, resolve(app, 'location/[slug].tsx')), null);
  assert.equal(routeFromAppPath(app, resolve(app, '_layout.tsx')), null);
  assert.equal(routeFromAppPath(app, resolve(app, '+html.tsx')), null);
});
