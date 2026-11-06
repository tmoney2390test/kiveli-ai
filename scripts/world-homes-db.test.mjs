import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { loadWorldHomes, homeSeedSql, worldHomeCounts } from './world-home-catalog.mjs';

test('world home migrations preserve households, Eos, account content, and explicit artwork queue semantics', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create table together_worlds(id uuid primary key default gen_random_uuid(),slug text,published boolean);
  create table together_character_templates(id uuid primary key default gen_random_uuid(),slug text,published boolean,creator_id uuid,current_published_version int);
  create table together_character_versions(id uuid primary key default gen_random_uuid(),character_template_id uuid,version int);
  create table together_character_homes(id uuid primary key default gen_random_uuid(),character_version_id uuid,world_id uuid,name text,description text,residence_type text,prompt_text text,personal_details jsonb,possible_activities text[],source text,reference_policy text,prompt_version int default 1,canonical_visual_context jsonb default '{}',canonical_lore jsonb default '{}',updated_at timestamptz,active boolean default true,visits_enabled boolean default false,approved_artwork_id uuid);
  alter table together_character_homes add artwork_prompt text;
  create table together_home_artwork(id uuid default gen_random_uuid(),home_id uuid,prompt_text text,status text default 'queued',storage_path text,thumbnail_path text,width int,height int);`);
  const seed = async (world,slug,creator=null,version=1) => {
   const w=(await db.query('insert into together_worlds(slug,published) values($1,true) returning id',[world])).rows[0].id;
   const t=(await db.query('insert into together_character_templates(slug,published,creator_id,current_published_version) values($1,true,$2,1) returning id',[slug,creator])).rows[0].id;
   const v=(await db.query('insert into together_character_versions(character_template_id,version) values($1,$2) returning id',[t,version])).rows[0].id;
   return (await db.query(`insert into together_character_homes(character_version_id,world_id,name,description,residence_type,prompt_text,canonical_lore) values($1,$2,'Unchanged','Original','Private room in existing shared house','original prompt','{"household":"Existing shared house","access":"specific_invitation_only","stableFacts":["Original household fact"]}') returning id`,[v,w])).rows[0].id;
  };
  const eos=await seed('eos-meridian','liora-haddad');
  const custom=await seed('juniper-city','amara-okafor','00000000-0000-4000-8000-000000000001');
  const historical=await seed('juniper-city','amara-okafor',null,2);
  const worlds=process.env.HOME_TEST_WORLD?[process.env.HOME_TEST_WORLD]:Object.keys(worldHomeCounts);
  const expected=worlds.reduce((n,w)=>n+worldHomeCounts[w],0);
  for(const world of worlds) {
   const homes=await loadWorldHomes(world);
   for(const home of homes)await seed(world,home.slug);
   const sql=homeSeedSql(world,homes);await db.exec(sql);
   const first=(await db.query('select count(*)::int n from together_home_artwork')).rows[0].n;
   await db.exec(sql);
   assert.equal((await db.query('select count(*)::int n from together_home_artwork')).rows[0].n,first,'rerun does not purchase duplicates');
  }
  assert.equal((await db.query('select count(*)::int n from together_home_artwork')).rows[0].n,expected);
  assert.equal((await db.query('select count(*)::int n from together_character_homes where visits_enabled')).rows[0].n,0,'art must be reviewed before activation');
  const staged=(await db.query("select * from together_character_homes where source='authored'")).rows;
  assert.equal(staged.length,expected);
  for(const h of staged) {
   assert.equal(h.residence_type,'Private room in existing shared house');assert.equal(h.canonical_lore.household,'Existing shared house');
   assert.equal(h.canonical_lore.access,'specific_invitation_only');assert.equal(h.canonical_lore.stableFacts.filter(s=>s==='Original household fact').length,1);
   assert.equal(h.prompt_version,2,'same migration does not increment the art revision again');
   assert.equal(h.possible_activities.length,6);assert.equal(h.personal_details.length,3);
   assert.match(h.artwork_prompt,/No people/);assert.equal(h.prompt_text,h.canonical_visual_context.canonicalPrompt);assert.ok(h.prompt_text.length>=300,h.name);assert.doesNotMatch(h.prompt_text,/No people|architectural photograph/);
   assert.ok(h.canonical_visual_context.canonicalPrompt.includes(h.canonical_visual_context.windowOutlook));
   assert.ok(h.personal_details.every(d=>h.canonical_visual_context.canonicalPrompt.includes(d.description)));
  }
  for(const id of [eos,custom,historical])assert.equal((await db.query('select name from together_character_homes where id=$1',[id])).rows[0].name,'Unchanged');
  if(!process.env.HOME_TEST_WORLD){
   await db.exec("update together_character_homes set prompt_text=artwork_prompt,canonical_visual_context=jsonb_set(canonical_visual_context,'{canonicalPrompt}',to_jsonb(artwork_prompt)),artwork_prompt=null where source='authored'");
   await db.exec(await readFile(new URL('../supabase/migrations/20261106003500_separate_home_scene_and_catalog_art_direction.sql',import.meta.url),'utf8'));
   await db.exec(await readFile(new URL('../supabase/migrations/20261106004300_home_artwork_prompt_for_legacy_media_readers.sql',import.meta.url),'utf8'));
   const separated=await db.query("select count(*)::int n from together_character_homes where source='authored' and canonical_visual_context->>'canonicalPrompt'=prompt_text and prompt_text not like '%No people%' and artwork_prompt like '%No people%'");
   assert.equal(separated.rows[0].n,expected);assert.equal((await db.query('select count(*)::int n from together_home_artwork')).rows[0].n,expected);
   const publish=await readFile(new URL('./publish-reviewed-world-homes.sql',import.meta.url),'utf8');
   await db.exec("update together_home_artwork set status='ready',storage_path=id||'.webp',thumbnail_path=id||'-thumb.webp',width=1536,height=1024; update together_character_homes h set approved_artwork_id=a.id from together_home_artwork a where a.home_id=h.id;");
   const last=(await db.query("select a.id from together_home_artwork a join together_character_homes h on h.id=a.home_id join together_worlds w on w.id=h.world_id where w.slug='vharadren' limit 1")).rows[0].id;
   await db.query('update together_home_artwork set thumbnail_path=null where id=$1',[last]);
   await assert.rejects(db.exec(publish),/release blocked for vharadren/i);await db.exec('rollback');
   assert.equal((await db.query('select count(*)::int n from together_character_homes where visits_enabled')).rows[0].n,0);
   await db.query("update together_home_artwork set thumbnail_path=id||'-thumb.webp' where id=$1",[last]);await db.exec(publish);await db.exec(publish);
   assert.equal((await db.query('select count(*)::int n from together_character_homes where visits_enabled')).rows[0].n,expected);
   for(const id of [eos,custom,historical])assert.equal((await db.query('select visits_enabled from together_character_homes where id=$1',[id])).rows[0].visits_enabled,false);
  }
  const bad=await loadWorldHomes(worlds[0]);bad[0]={...bad[0],slug:'missing-character'};
  await assert.rejects(db.exec(homeSeedSql(worlds[0],bad)),/Expected one current home/);
 }finally{await db.close();}
});
