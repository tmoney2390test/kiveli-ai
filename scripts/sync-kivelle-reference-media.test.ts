import assert from 'node:assert/strict';
import test from 'node:test';
import {CHARACTER_REFERENCE_BUCKET,DIRECT_LOCATION_ARTWORK_WORLDS,defaultStorageTarget,discoverAssets,parseCharacterAssetName} from './sync-kivelle-reference-media.ts';

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

test('discovers the authored Vharadren primary and supplied secondary portrait pack',async()=>{
  const assets=await discoverAssets();
  const vharadren=assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren');
  const keys=new Set(vharadren.map((asset)=>asset.sourceKey));
  for(const key of[
    'character:dame-ysabet-rooke:identity',
    'character:dame-ysabet-rooke:identity:secondary-1',
    'character:high-flame-elowen-orison:identity',
    'character:high-flame-elowen-orison:identity:secondary-1',
    'character:lady-isolde-morcant:identity',
    'character:lady-isolde-morcant:identity:secondary-1',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('discovers the first generated Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const key of[
    'character:garrick-holt:identity',
    'character:prince-lucien-vaelorian:identity',
    'character:princess-elara-thornwall:identity',
    'character:queen-maerra-vaelorian:identity',
    'character:tamsin-quill:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('keeps secondary identities on the same character and private portrait bucket',()=>{
  assert.deepEqual(parseCharacterAssetName('high-flame-elowen-orison--secondary-1.png'),{characterSlug:'high-flame-elowen-orison',variant:'secondary-1'});
  assert.deepEqual(defaultStorageTarget({sourceKey:'character:high-flame-elowen-orison:identity:secondary-1',role:'character_identity',path:'ignored',worldSlug:'vharadren',characterSlug:'high-flame-elowen-orison',variant:'secondary-1'},'0123456789abcdef0123456789abcdef','png'),{bucket:CHARACTER_REFERENCE_BUCKET,path:'vharadren/high-flame-elowen-orison/secondary-1-0123456789abcdef0123.png'});
});
