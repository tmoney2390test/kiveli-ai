import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('Every new storyline has a unique, optimized cover wired to its scenario',async()=>{
 const expected=read('content/scenarios/storyline-audit.json').filter(s=>s.status==='new_scenario').map(s=>s.scenarioId).sort();
 const art=read('content/scenarios/storyline-art-manifest.json'),prompts=read('content/scenarios/storyline-art-prompts.json');
 assert.deepEqual(art.map(a=>a.id).sort(),expected);
 assert.equal(new Set(art.map(a=>a.sha256)).size,expected.length);
 const mappings=fs.readFileSync('apps/together/src/scenario-assets.ts','utf8');
 for(const a of art){
  assert.ok(mappings.includes(`'${a.id}':require('../assets/scenarios/${a.id}.jpg')`));
  assert.equal(hash(a.asset),a.sha256);assert.ok(a.bytes<400*1024,a.id+' file budget');
  const metadata=await sharp(a.asset).metadata();assert.equal(metadata.width,1536);assert.equal(metadata.height,1024);
  const p=prompts.find(p=>p.id===a.id);assert.ok(p.prompt.includes(p.title)||a.id==='story-eos-missing-seventeen-hours');
  for(const ref of a.references)assert.equal(hash(ref.path),ref.sha256,a.id+' reference changed');
 }
 for(const a of read('content/scenarios/art-manifest.json'))assert.equal(hash(a.asset),a.sha256,a.id+' original artwork changed');
});
