import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const stories=JSON.parse(read('content/scenarios/storyline-catalog.json')),originals=JSON.parse(read('content/scenarios/runtime-catalog.json')),source=JSON.parse(read('content/scenarios/storyline-source.json')),audit=JSON.parse(read('content/scenarios/storyline-audit.json'));
test('Every current or retired arc has an explicit reviewed disposition',()=>{
 assert.equal(source.arcs.length,117);assert.equal(stories.length,85);assert.equal(audit.length,117);
 assert.equal(new Set(audit.map(a=>a.slug)).size,117);
 for(const a of source.arcs){const row=audit.find(s=>s.slug===a.slug);assert.ok(row);if(row.status.startsWith('retired'))assert.ok(!a.active||a.eligibleTemplateIds.every(id=>!source.characters.find(c=>c.id===id)?.selectable));else assert.ok(stories.some(s=>s.arcSlug===a.slug));}
 assert.equal(audit.filter(s=>s.status==='woven').length,23);assert.equal(audit.filter(s=>s.status==='new_scenario').length,62);
});
test('All openings have a published local lead and a canonical matching location',()=>{
 for(const s of stories){const lead=source.characters.find(c=>c.id===s.characterTemplateId),loc=source.locations.find(l=>l.id===s.locationId);assert.ok(lead.published&&lead.selectable,s.id);assert.ok(lead.residentWorldIds.includes(s.worldId),s.id+' resident');assert.equal(loc.worldId,s.worldId,s.id);assert.equal(loc.slug,s.locationSlug);assert.ok(s.setup.length>70,s.id+' needs a developed hook');assert.ok(s.chapters.length>=3);assert.equal(new Set(s.chapters.map(c=>c.id)).size,s.chapters.length);for(const c of s.chapters)assert.doesNotMatch(c.guidance,/^Continue from the saved story decision\.$/,s.id);}
});
test('Public catalogue excludes spoilers and retains all 80 original scenario ids',()=>{
 const publicText=read('apps/together/src/lib/scenarioCatalog.ts');const rows=JSON.parse(publicText.split('export const scenarios:Scenario[] = ')[1].trim().slice(0,-1));assert.equal(rows.length,142);assert.equal(new Set(rows.map(s=>s.id)).size,142);
 for(const o of originals)assert.ok(rows.some(s=>s.id===o.id));
 for(const row of rows){assert.equal(row.guidance,undefined);assert.equal(row.chapters,undefined);assert.equal(row.canon,undefined);assert.equal(row.outcomes,undefined);assert.doesNotMatch(row.setup,/Author-only|Continue from the saved|Invite an investigation/);}
 for(const s of stories)for(const truth of s.canon)assert.ok(!publicText.includes(truth),s.id+' leaked canon');
});
test('Original mature scenario material and artwork are preserved',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(originals)).digest('hex'),'4c866342aedfd64c2f514fe4ed6c2d4d9aec4e776b42acb1962446722c182494');
 for(const s of originals)assert.ok(fs.statSync(`apps/together/assets/scenarios/${s.id}.jpg`).size>1000);
 const migration=read('supabase/migrations/20260914233719_storyline_scenarios.sql');assert.doesNotMatch(migration,/update public\.together_character_(?:templates|versions) set|delete from public\.together_(?:memories|relationship_states|world_progress)/i);
});
test('Generated catalogue can be reproduced without changes',()=>{
 const paths=['content/scenarios/storyline-catalog.json','content/scenarios/storyline-audit.json','apps/together/src/lib/scenarioCatalog.ts','content/scenarios/storyline-definitions.sql'];const before=paths.map(read);execFileSync(process.execPath,['scripts/build-storyline-scenarios.mjs']);assert.deepEqual(paths.map(read),before);
 const sql=read('supabase/migrations/20260914233719_storyline_scenarios.sql');assert.ok(sql.includes(read('content/scenarios/storyline-definitions.sql')));
});
