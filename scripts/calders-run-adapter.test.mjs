import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { adaptCaldersRun } from './lib/calders-run-adapter.mjs';
import { generateCaldersMigration } from './generate-calders-run-content.mjs';

const pack=JSON.parse(readFileSync('content/calders-run/calders_run_content_pack.json','utf8'));
const schema=JSON.parse(readFileSync('scripts/fixtures/calders-schema.json','utf8'));
const adapted=adaptCaldersRun(pack);
test('location and home photo prompts do not inherit the cover panorama',()=>{
  const allowed=new Set(['river-ward','the-railhead','pikes-ferry','bridge-works']);
  for(const location of adapted.records.together_locations){
    assert.ok(!location.canonical_visual_context.canonicalPrompt.includes(pack.world.visualContext.hero));
    assert.equal(location.canonical_visual_context.railwayBridgeVisible,allowed.has(location.slug));
  }
  for(const home of adapted.records.together_character_homes){
    assert.ok(!home.prompt_text.includes(pack.world.visualContext.hero));
    assert.ok(home.prompt_text.includes('railway bridge is outside the frame'));
  }
});
test('public projections preserve the adult cast and omit private canon',()=>{
  const r=adapted.records;
  assert.equal(r.together_character_templates.filter(c=>c.discovery_metadata.gender==='woman').length,32);
  assert.equal(r.together_character_templates.filter(c=>c.discovery_metadata.gender==='man').length,17);
  assert.deepEqual([1,2,3].map(level=>r.together_character_templates.filter(c=>c.spice_level===level).length),[10,15,24]);
  const publicJson=JSON.stringify([r.together_worlds,r.together_character_templates,r.together_character_versions,adapted.publicLocations]);
  for(const c of pack.characters)assert.ok(!publicJson.includes(c.psychology.authorOnlyPrivateTruth));
  for(const p of pack.locations)if(p.authorOnlyPrivateTruth)assert.ok(!publicJson.includes(p.authorOnlyPrivateTruth));
  assert.ok(!adapted.publicLocations.some(p=>p.slug==='crowcut-hollow'));
  assert.equal(r.together_character_homes.length,49);
  assert.ok(r.together_character_homes.every(h=>!r.together_locations.some(p=>p.id===h.id)));
  assert.ok(r.together_story_arc_templates.every(a=>!JSON.stringify(a).includes('endings')));
});
test('migration runs twice against production column types and check constraints',async()=>{
  const db=new PGlite();
  try {
    for(const f of schema.functions)await db.exec(f.definition);
    for(const table of Object.keys(adapted.records)) {
      const columns=schema.columns.filter(c=>c.table_name===table);
      await db.exec(`create table public.${table} (${columns.map(c=>`${c.name} ${c.type}${c.required?' not null':''}${c.default_value?' default '+c.default_value:''}`).join(',')});`);
      for(const c of schema.constraints.filter(c=>c.table_name===table))await db.exec(`alter table public.${table} add constraint ${c.conname} ${c.definition};`);
    }
    const migration=generateCaldersMigration(adapted,schema);
    await db.exec(migration); await db.exec(migration);
    for(const [table,rows] of Object.entries(adapted.records))assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,rows.length,table);
    const gaps=await db.query(`select character_version_id,day_of_week from together_schedule_templates group by 1,2 having count(*)<>6 or sum(end_minute-start_minute)<>1440`);
    assert.equal(gaps.rows.length,0);
    assert.equal((await db.query('select published from together_worlds')).rows[0].published,false);
    await db.exec("update together_worlds set metadata='{}'::jsonb");
    await assert.rejects(()=>db.exec(migration),/ID collision/);
  } finally { await db.close(); }
});
