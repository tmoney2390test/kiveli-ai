import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { criticalAssetPaths, routeFromHtmlPath, routeResponseIssue } from './audit-production-routes.mjs';

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

test('rejects route responses that bounce through another page',()=>{
  const headers=new Headers({'content-type':'text/html'});
  assert.equal(routeResponseIssue({ok:true,status:200,url:'https://kivelli.app/explore',redirected:false,headers},'/explore'),null);
  assert.equal(routeResponseIssue({ok:true,status:200,url:'https://kivelli.app/',redirected:true,headers},'/explore'),'unexpected navigation to /');
});
