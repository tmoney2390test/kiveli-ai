import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingPortraits,portraitRegistry} from './audit-published-character-portraits.mjs';

test('portrait audit accepts a version key and a canonical-slug fallback',()=>{
  const registry=new Map([['portrait-alias','characters/example/one.jpg'],['two','characters/example/two.jpg']]);
  const manifest={'characters/example/one.jpg':{},'characters/example/two.jpg':{}};
  assert.deepEqual(missingPortraits([
    {slug:'one',portrait_key:'portrait-alias'},
    {slug:'two',portrait_key:'old-key'},
  ],registry,manifest),[]);
});

test('portrait audit identifies missing mappings and stale catalog paths',()=>{
  const registry=new Map([['one','characters/example/one.jpg']]);
  assert.deepEqual(missingPortraits([
    {slug:'one',world_slug:'example'},
    {slug:'two',world_slug:'example'},
  ],registry,{}),[
    {slug:'one',world:'example',reason:'no catalog artwork for characters/example/one.jpg'},
    {slug:'two',world:'example',reason:'no app portrait mapping'},
  ]);
});

test('new resident portraits are present in the app registry',async()=>{
  const registry=await portraitRegistry();
  assert.equal(registry.get('calista-fen'),'characters/gilded-coast/calista-fen.jpg');
  assert.equal(registry.get('amina-nwosu'),'characters/eos-meridian/amina-nwosu.jpg');
  assert.equal(registry.get('ysolde-lantern'),'characters/vharadren/ysolde-lantern.jpg');
});
