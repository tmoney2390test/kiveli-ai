import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { gildedPack, validateGildedPack } from '../content/gilded-coast/pack.mjs';
import { gildedCoastMajorIncidents } from '../content/world-pulse/gilded-coast-major.mjs';
import { discoverAssets } from './sync-kivelle-reference-media.ts';

const world='gilded-coast';
const getJson=async(path)=>JSON.parse(await readFile(path,'utf8'));

test('the adult resident world has a complete social and playable location graph',()=>{
  const audit=validateGildedPack();
  assert.deepEqual(audit.errors,[]);
  assert.equal(audit.counts.residents,36);
  assert.equal(audit.counts.locations,42);
  assert.ok(audit.counts.schedules>=1512);
  assert.ok(gildedPack.characters.every((person)=>person.age>=24));
  assert.ok(gildedPack.storyArcs.every((story)=>story.involved.length>=1&&story.involved.length<=4));
  assert.ok(gildedPack.characters.every((person)=>person.characterBible.firstMeeting?.openingLine));
});

test('every canonical participant and place resolves across both Pulse tiers',async()=>{
  const routine=(await getJson('content/world-pulse/gilded-coast.json')).events;
  const residents=new Set(gildedPack.characters.map((person)=>person.slug));
  const places=new Set(gildedPack.locations.map((place)=>place.slug));
  assert.equal(routine.length,200);
  assert.equal(gildedCoastMajorIncidents.length,15);
  for(const event of [...routine,...gildedCoastMajorIncidents]){
    assert.equal(event.worldSlug,world);
    assert.ok(places.has(event.locationSlug),event.slug);
    assert.ok(event.participants.length>=1&&event.participants.length<=4,event.slug);
    assert.ok(event.participants.every((person)=>residents.has(person.characterSlug)),event.slug);
  }
});

test('scenario leads, places, and arcs match the canonical pack without exposing outcomes',async()=>{
  const [privateRows,client]=await Promise.all([
    getJson('content/gilded-coast/scenario-catalog.json'),
    readFile('apps/together/src/lib/gildedCoastScenarioCatalog.ts','utf8'),
  ]);
  const residents=new Set(gildedPack.characters.map((person)=>person.templateId));
  const places=new Set(gildedPack.locations.map((place)=>place.id));
  assert.equal(privateRows.length,8);
  for(const scenario of privateRows){
    assert.ok(residents.has(scenario.characterTemplateId),scenario.id);
    assert.ok(places.has(scenario.locationId),scenario.id);
    assert.ok(scenario.chapters.length>=3,scenario.id);
    assert.equal(new Set(scenario.chapters.map((chapter)=>chapter.id)).size,scenario.chapters.length);
    for(const fact of scenario.canon)assert.ok(!client.includes(fact),`${scenario.id} leaked a private fact`);
  }
});

test('portrait and location references are discoverable for photo, video, and group media',async()=>{
  const assets=(await discoverAssets()).filter((asset)=>asset.worldSlug===world);
  assert.equal(assets.filter((asset)=>asset.role==='character_identity').length,56);
  assert.equal(assets.filter((asset)=>asset.role==='location_canonical').length,42);
  assert.equal(assets.filter((asset)=>asset.role==='world_canonical').length,1);
  for(const asset of assets)await access(asset.path);
  const client=await readFile('apps/together/src/location-assets/gilded-coast.ts','utf8');
  for(const place of gildedPack.locations)assert.ok(client.includes(`'${place.slug}':`),place.slug);
  const mediaLink=await readFile('scripts/sql/gilded-coast-link-media.sql','utf8');
  assert.match(mediaLink,/referenceStoragePaths/);
  assert.match(mediaLink,/adultMediaReferenceEligible/);
});
