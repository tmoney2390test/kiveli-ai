import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingDeliveredPortraits,missingPortraits,portraitRegistry} from './audit-published-character-portraits.mjs';

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

test('delivery audit catches a missing display while accepting a published thumbnail',async()=>{
  const display=`v1/${'a'.repeat(64)}.webp`,thumbnail=`v1/${'b'.repeat(64)}.webp`;
  const registry=new Map([['newcomer','characters/example/newcomer.jpg']]);
  const manifest={'characters/example/newcomer.jpg':{display:{file:display},thumbnail:{file:thumbnail}}};
  const visited=[];
  const missing=await missingDeliveredPortraits([{slug:'newcomer'}],registry,manifest,{
    baseUrl:'https://example.test',
    fetcher:async url=>{
      visited.push(url);
      return{ok:url.endsWith(thumbnail),status:url.endsWith(thumbnail)?200:404,headers:new Headers({'content-type':url.endsWith(thumbnail)?'image/webp':'application/json'})};
    },
  });
  assert.equal(visited.length,2);
  assert.deepEqual(missing,[{slug:'newcomer',variant:'display',reason:'catalog delivery HTTP 404'}]);
});
