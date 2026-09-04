import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

test('discovers the first authored Vharadren location-art batch',async()=>{
  assert.ok(DIRECT_LOCATION_ARTWORK_WORLDS.includes('vharadren'));
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='location_canonical'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const slug of[
    'ashlands',
    'black-march',
    'crownspire',
    'dragonbone-citadel',
    'ember-isles',
    'ember-throne-hall',
    'shattered-coast',
    'verdant-reach',
  ])assert.ok(keys.has(`location:vharadren:${slug}:canonical`),`${slug} must remain discoverable`);
});

test('registers the approved Vharadren location batch with the client resolver',async()=>{
  const[moduleSource,indexSource]=await Promise.all([
    readFile('apps/together/src/location-assets/vharadren.ts','utf8'),
    readFile('apps/together/src/location-assets/index.ts','utf8'),
  ]);
  assert.match(indexSource,/'vharadren':vharadrenLocationAssets/);
  for(const slug of[
    'ashlands',
    'black-march',
    'crownspire',
    'dragonbone-citadel',
    'ember-isles',
    'ember-throne-hall',
    'shattered-coast',
    'verdant-reach',
  ])assert.match(moduleSource,new RegExp(`'${slug}':require\\('\\.\\./\\.\\./assets/locations/vharadren/${slug}\\.jpg'\\)`));
});

test('discovers and registers the complete Crownspire location-art set',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='location_canonical'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  const moduleSource=await readFile('apps/together/src/location-assets/vharadren.ts','utf8');
  for(const slug of[
    'basilica-seven-flames',
    'blackglass-baths',
    'gilded-steps-market',
    'house-of-velvet-oaths',
    'lantern-gallows',
    'red-ledger-exchange',
  ]){
    assert.ok(keys.has(`location:vharadren:${slug}:canonical`),`${slug} must remain discoverable`);
    assert.match(moduleSource,new RegExp(`'${slug}':require\\('\\.\\./\\.\\./assets/locations/vharadren/${slug}\\.jpg'\\)`));
  }
  assert.equal(keys.size,14,'Only the fourteen visually approved Vharadren locations should be published');
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

test('discovers the second generated Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const key of[
    'character:admiral-nyra-greymere:identity',
    'character:brina-forgehand:identity',
    'character:king-edric-thornwall:identity',
    'character:lady-rowena-thornwall:identity',
    'character:lord-halric-thornwall:identity',
    'character:queen-selene-ravaryn:identity',
    'character:sera-blackvein:identity',
    'character:torren-bale:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('discovers the third generated Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const key of[
    'character:brother-aldren:identity',
    'character:celessa-vane:identity',
    'character:ilyra-ashscale:identity',
    'character:joren-ash:identity',
    'character:kael-dravos:identity',
    'character:mara-sable:identity',
    'character:nerys-rowanleaf:identity',
    'character:prince-aurel-ravaryn:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('discovers the fourth generated Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const key of[
    'character:captain-seraphine-vale:identity',
    'character:duchess-aveline-edevane:identity',
    'character:duchess-mirelle-greymere:identity',
    'character:freya-hart:identity',
    'character:lord-cassian-greymere:identity',
    'character:lord-rowan-edevane:identity',
    'character:lyssa-bramble:identity',
    'character:thalia-moss:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('discovers the fifth generated Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const keys=new Set(assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren').map((asset)=>asset.sourceKey));
  for(const key of[
    'character:asha-ren:identity',
    'character:bastian-crow:identity',
    'character:delphine-lantern:identity',
    'character:idris-salt:identity',
    'character:nia-chainbreaker:identity',
    'character:orla-saye:identity',
    'character:petra-glass:identity',
    'character:sister-mercy-voss:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
});

test('discovers the complete final Vharadren primary portrait batch',async()=>{
  const assets=await discoverAssets();
  const vharadren=assets.filter((asset)=>asset.role==='character_identity'&&asset.worldSlug==='vharadren');
  const keys=new Set(vharadren.map((asset)=>asset.sourceKey));
  for(const key of[
    'character:catrin-brann:identity',
    'character:liora-saintless:identity',
    'character:maeve-redreed:identity',
    'character:malrec-vale:identity',
    'character:nessa-honeybell-marrow:identity',
    'character:rhevan-crownsbane:identity',
    'character:rorik-pell:identity',
    'character:sabine-silk-veyl:identity',
    'character:vespera-saan:identity',
  ])assert.ok(keys.has(key),`${key} must remain discoverable`);
  assert.equal(vharadren.filter((asset)=>asset.variant==='primary').length,49,'Every Vharadren character must have one primary portrait');
});

test('keeps secondary identities on the same character and private portrait bucket',()=>{
  assert.deepEqual(parseCharacterAssetName('high-flame-elowen-orison--secondary-1.png'),{characterSlug:'high-flame-elowen-orison',variant:'secondary-1'});
  assert.deepEqual(defaultStorageTarget({sourceKey:'character:high-flame-elowen-orison:identity:secondary-1',role:'character_identity',path:'ignored',worldSlug:'vharadren',characterSlug:'high-flame-elowen-orison',variant:'secondary-1'},'0123456789abcdef0123456789abcdef','png'),{bucket:CHARACTER_REFERENCE_BUCKET,path:'vharadren/high-flame-elowen-orison/secondary-1-0123456789abcdef0123.png'});
});
