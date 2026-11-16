import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {allPages,locationArtworkRegistry,locationReferenceGaps,verifiedLocationReferenceRows,verifyLocationReferenceDelivery} from './audit-location-reference-media.mjs';
import {manifestPath,sha256} from './catalog-artwork.mjs';

const location={id:'dead-letter',slug:'dead-letter',world_slug:'vespormoor',owner_user_id:null};
const registry=new Map([['vespormoor:dead-letter','locations/vespormoor/dead-letter.jpg']]);
const content=Buffer.from('verified location fixture'),file=`v1/${sha256(content)}.webp`;
const manifest={'locations/vespormoor/dead-letter.jpg':{sourceHash:'original',display:{file,width:1200,height:800,bytes:content.length}}};
const reference={id:'ref',location_id:'dead-letter',asset_role:'location_canonical',active:true,storage_bucket:'catalog',storage_path:'place.webp',sha256:sha256(content),revision:1};

test('all 51 Vespormoor places use the app artwork, including Dead Letter',async()=>{
  const actual=await locationArtworkRegistry(),catalog=JSON.parse(await readFile(manifestPath,'utf8'));
  const places=[...actual.entries()].filter(([key])=>key.startsWith('vespormoor:'));
  assert.equal(places.length,51);
  for(const [,path] of places)assert.ok(catalog[path]?.display?.file,path);
  assert.equal(actual.get('vespormoor:dead-letter'),'locations/vespormoor/dead-letter.jpg');
});

test('a displayed image alone does not count as a generation reference',()=>{
  assert.equal(locationReferenceGaps({locations:[location],references:[]},registry,manifest).length,1);
  assert.equal(locationReferenceGaps({locations:[location],references:[reference]},registry,manifest).length,0);
});

test('inactive, wrong-location, wrong-role and broken references cannot hide a gap',()=>{
  for(const override of [{active:false},{location_id:'other'},{asset_role:'world_canonical'},{world_id:'other'},{character_version_id:'person'},{storage_path:''}]) {
    assert.equal(locationReferenceGaps({locations:[location],references:[{...reference,...override}]},registry,manifest).length,1);
  }
});

test('private and archived places are excluded',()=>{
  assert.deepEqual(locationReferenceGaps({locations:[{...location,owner_user_id:'owner'},{...location,archived_at:'date'}],references:[]},registry,manifest),[]);
});

test('repair reuses verified public display artwork and preserves old revisions',async()=>{
  const gaps=locationReferenceGaps({locations:[location],references:[]},registry,manifest);
  const rows=await verifiedLocationReferenceRows(gaps,[{source_key:'location:vespormoor:dead-letter:canonical',revision:3}],{
    baseUrl:'https://catalog.test',fetcher:async url=>{
      assert.equal(url,`https://catalog.test/storage/v1/object/public/kivelli-catalog/${file}`);
      return new Response(content,{headers:{'content-type':'image/webp'}});
    },
  });
  assert.equal(rows[0].revision,4);
  assert.equal(rows[0].location_id,'dead-letter');
  assert.equal(rows[0].storage_path,file);
  assert.equal(rows[0].sha256,sha256(content));
  assert.deepEqual(locationReferenceGaps({locations:[location],references:rows},registry,manifest),[]);
});

test('missing or changed artwork prevents registration',async()=>{
  const gaps=locationReferenceGaps({locations:[location],references:[]},registry,manifest);
  for(const response of [new Response('',{status:404}),new Response('changed',{headers:{'content-type':'image/webp'}})]) {
    await assert.rejects(verifiedLocationReferenceRows(gaps,[],{baseUrl:'https://catalog.test',fetcher:async()=>response}),/unavailable|integrity mismatch/);
  }
});

test('catalog audits page beyond the API row limit',async()=>{
  const all=Array.from({length:1051},(_,id)=>({id}));
  let pages=0;
  const loaded=await allPages(()=>({order:()=>({range:async(start,end)=>{pages++;return {data:all.slice(start,end+1),error:null};}})}));
  assert.equal(loaded.length,1051);
  assert.equal(pages,3);
});

test('district fallback and obsolete art are flagged even if the file exists',()=>{
  const state={locations:[location],references:[{...reference,sha256:'district-image'}]};
  assert.equal(locationReferenceGaps(state,registry,manifest)[0].reason,'stale generation reference');
  state.references.push({...reference,revision:2});
  assert.deepEqual(locationReferenceGaps(state,registry,manifest),[]);
  assert.deepEqual(locationReferenceGaps({locations:[location],references:[{...reference,sha256:'original'}]},registry,manifest),[]);
});

test('delivery verification checks downloaded bytes rather than trusting metadata',async()=>{
  const state={locations:[location],references:[reference]};
  assert.deepEqual(await verifyLocationReferenceDelivery(state,registry,manifest,{download:async()=>content}),{verified:1,failures:[]});
  const changed=await verifyLocationReferenceDelivery(state,registry,manifest,{download:async()=>Buffer.from('wrong place')});
  assert.equal(changed.verified,0);assert.match(changed.failures[0].reason,/does not match/);
  const missing=await verifyLocationReferenceDelivery(state,registry,manifest,{download:async()=>{throw Error('404');}});
  assert.equal(missing.verified,0);assert.equal(missing.failures[0].key,'vespormoor:dead-letter');
});
