// Read-only. Compare the committed catalog, reviewed pixels and deployed records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { loadWorldHomes, worldHomeCounts } from './world-home-catalog.mjs';

const args=process.argv.slice(2),world=args.find(a=>!a.startsWith('--'));
if(world && !(world in worldHomeCounts))throw Error('Unknown home world');
const published=args.includes('--published'),download=!args.includes('--metadata-only');
const ref='mfysnlghlhxxcwnwpxog',url='https://'+ref+'.supabase.co';
const keys=JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const key=keys.find(k=>k.name==='service_role')?.api_key;
if(!key)throw Error('Release verifier requires the authenticated project CLI');
async function request(path,headers={}) {
  for(let i=0;;i++){try {
    const res=await fetch(path,{headers,signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error('HTTP '+res.status);return Buffer.from(await res.arrayBuffer());
  }catch(e){if(i===3||/HTTP 4/.test(e.message))throw e;await new Promise(r=>setTimeout(r,500*(i+1)));}}
}
async function query(path){return JSON.parse((await request(url+'/rest/v1/'+path,{apikey:key,Authorization:'Bearer '+key})).toString());}
const rows=(await query('together_character_homes?select=id,name,description,prompt_text,artwork_prompt,visits_enabled,source,possible_activities,personal_details,canonical_visual_context,approved_artwork_id,world:together_worlds!inner(slug,published),version:together_character_versions!inner(version,template:together_character_templates!inner(slug,current_published_version,published,creator_id))&active=eq.true&world.published=eq.true&version.template.creator_id=is.null&version.template.published=eq.true&limit=1000')).filter(h=>h.version.version===h.version.template.current_published_version);
const art=new Map((await query('together_home_artwork?select=id,home_id,status,storage_bucket,storage_path,thumbnail_path,width,height&status=eq.ready&limit=1000')).map(a=>[a.id,a]));
const pilot=rows.filter(r=>r.world.slug==='eos-meridian');
assert.equal(pilot.length,67);assert.ok(pilot.every(h=>h.visits_enabled&&art.get(h.approved_artwork_id)?.home_id===h.id));
const prior=await readFile('.test-tmp/eos-home-artwork/reviewed.json','utf8').catch(()=>null);
if(prior){const pointers=new Map(pilot.map(h=>[h.id,h.approved_artwork_id]));for(const e of JSON.parse(prior).filter(e=>e.approved))assert.equal(pointers.get(e.homeId),e.artworkId,e.slug);}
const checks=[];
for(const w of world?[world]:Object.keys(worldHomeCounts)){
  const catalog=await loadWorldHomes(w),review=new Map(JSON.parse(await readFile('content/homes/reviewed/'+w+'.json','utf8')).map(a=>[a.homeId,a]));
  const deployed=rows.filter(h=>h.world.slug===w);assert.equal(deployed.length,catalog.length,w);assert.equal(review.size,catalog.length,w);
  const ops=await query('together_character_homes?select=id,together_worlds!inner(slug),artwork:together_home_artwork!together_home_artwork_home_id_fkey(id)&active=eq.true&visits_enabled=eq.true&together_worlds.slug=eq.'+w);
  assert.deepEqual(new Set(ops.map(h=>h.id)),new Set(published?deployed.map(h=>h.id):[]),w+' ops catalog');
  await query('together_home_artwork?select=id,home:together_character_homes!together_home_artwork_home_id_fkey!inner(visits_enabled,world:together_worlds!inner(slug))&status=eq.queued&home.visits_enabled=eq.true&home.world.slug=eq.'+w+'&limit=1');
  for(const h of catalog){const row=deployed.find(r=>r.id===h.homeId),approved=review.get(h.homeId);assert.ok(row&&approved,h.slug);assert.equal(row.name,h.name,h.slug);assert.equal(row.description,h.description,h.slug);assert.equal(row.source,'authored');assert.equal(row.visits_enabled,published,h.slug);
    assert.deepEqual(row.personal_details.map(d=>d.description),h.details,h.slug);assert.deepEqual(row.possible_activities,h.activities,h.slug);
    assert.equal(row.canonical_visual_context.windowOutlook,h.windowOutlook,h.slug);assert.equal(row.canonical_visual_context.interiorStyle,h.interiorStyle,h.slug);
    assert.doesNotMatch(row.canonical_visual_context.canonicalPrompt,/No people|architectural photograph/,h.slug);
    assert.equal(row.prompt_text,row.canonical_visual_context.canonicalPrompt,h.slug);assert.match(row.artwork_prompt,/No people/,h.slug);
    assert.ok(row.canonical_visual_context.canonicalPrompt.includes(h.windowOutlook),h.slug);
    assert.equal(row.approved_artwork_id,approved.artworkId,h.slug);const a=art.get(approved.artworkId);assert.equal(a?.home_id,h.homeId,h.slug);
    const bucket=url+'/storage/v1/object/public/'+a.storage_bucket+'/';
    assert.equal(approved.url,bucket+a.storage_path);assert.equal(approved.thumbnailUrl,bucket+a.thumbnail_path);assert.notEqual(a.thumbnail_path,a.storage_path);
    if(download){checks.push(async()=>{const original=await request(approved.url);assert.equal(createHash('sha256').update(original).digest('hex'),approved.sha256,h.slug);});
      checks.push(async()=>{const thumb=await sharp(await request(approved.thumbnailUrl)).metadata();assert.ok(thumb.width>0&&thumb.width<a.width&&thumb.height>0&&thumb.height<a.height,h.slug+' thumbnail');});}
  }
  console.log('Verified catalog and artwork pointers: '+w+' ('+deployed.length+')');
}
let next=0;await Promise.all(Array.from({length:Math.min(8,checks.length)},async()=>{while(next<checks.length)await checks[next++]();}));
console.log('PASS '+checks.length+' public image checks; Eos pilot still has 67 visitable homes. Visits '+(published?'enabled.':'staged.'));
