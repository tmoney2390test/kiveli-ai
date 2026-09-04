import assert from 'node:assert/strict';
import test from 'node:test';
import {DIRECT_LOCATION_ARTWORK_WORLDS,discoverAssets} from './sync-kivelle-reference-media.ts';

test('discovers canonical NorthVale location artwork used for media grounding',async()=>{
  assert.ok(DIRECT_LOCATION_ARTWORK_WORLDS.includes('northvale'));
  const assets=await discoverAssets();
  const drift=assets.find((asset)=>asset.sourceKey==='location:northvale:the-drift:canonical');
  assert.ok(drift,'The Drift must be registered as a canonical location reference');
  assert.equal(drift.role,'location_canonical');
  assert.equal(drift.worldSlug,'northvale');
  assert.equal(drift.locationSlug,'the-drift');
});

test('discovers authored Vespormoor locations instead of silently omitting a world',async()=>{
  assert.ok(DIRECT_LOCATION_ARTWORK_WORLDS.includes('vespormoor'));
  const assets=await discoverAssets();
  assert.ok(assets.some((asset)=>asset.role==='location_canonical'&&asset.worldSlug==='vespormoor'));
});
