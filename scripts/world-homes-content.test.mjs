import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorldHomes, homeArtworkPrompt, worldHomeCounts } from './world-home-catalog.mjs';
const shared=['Have a drink','Share a snack','Catch up for a while','Spend a quiet evening'];
for(const world of Object.keys(worldHomeCounts))test(`${world}: complete, distinct interiors and usable activities`,async()=>{
 const homes=await loadWorldHomes(world);
 for(const home of homes){
  assert.deepEqual(home.activities.slice(0,4),shared,home.slug);
  assert.ok(home.windowOutlook.length>=25);assert.ok(home.interiorStyle.length>=40);
  const prompt=homeArtworkPrompt(home);
  assert.ok(prompt.length<5000,home.slug);assert.ok(prompt.includes(home.windowOutlook));
  for(const detail of home.details)assert.ok(prompt.includes(detail));
  assert.match(prompt,/No people/);assert.match(prompt,/current time/);
  assert.doesNotMatch(home.activities.slice(4).join('|'),/fold or unfold|open or close|put keys|adjust the.*lamp|wash hands|sort.*supplies|clean.*basin|blank plates/i,home.slug);
  if(['calders-run','gilded-coast','vharadren'].includes(world))assert.doesNotMatch([home.description,home.interiorStyle,...home.details,...home.activities].join(' '),/\b(?:television|TV|laptop|smartphone|microwave|refrigerator|electric guitar|vinyl|record player|phonograph|headphones|LED|hologram|podcast|USB)\b/i,home.slug);
 }
 assert.equal(new Set(homes.map(homeArtworkPrompt)).size,homes.length);
});
