import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { WORLD_ID, world, worldFacts, originStoryFacts } from './eos-meridian-content.mjs';
import { migrationPath, renderOriginMigration } from './build-eos-meridian-origin.mjs';

test('origin story retains the Year 0 gap and separates the Year 20 Lyra emergency',()=>{
  const story=world.canonicalLore.originStory;
  assert.match(story,/six hundred people/);
  assert.match(story,/Seventeen hours are absent/);
  assert.match(story,/Year 20 were a later, separate crisis/);
  assert.match(story,/Year 38/);
  assert.doesNotMatch(story,/alien|signal.*caused|Lyra.*landing gap/i);
  assert.equal(worldFacts.length,40);
  assert.equal(originStoryFacts.length,3);
  assert.ok(originStoryFacts.every(fact=>fact.fact.length<=180&&fact.contentLevel==='standard'));
});

test('origin migration is reproducible and adds only world lore',async()=>{
  const sql=renderOriginMigration();
  assert.equal(readFileSync(migrationPath,'utf8').replace(/\r\n/g,'\n'),sql);
  for(const table of ['together_character_templates','together_character_versions','together_memories','together_story_arc_instances','together_character_instances']){
    assert.ok(!new RegExp(`(?:update|delete from|insert into) public\\.${table}\\b`,'i').test(sql),table);
  }

  const db=new PGlite();
  try{
    await db.exec(`
      create table public.together_worlds(id uuid primary key,metadata jsonb,updated_at timestamptz);
      create table public.together_world_facts(
        world_id uuid,slug text,title text,fact_text text,category text,truth_mode text,
        knowledge_scope text,content_level text,topic_tags text[],trigger_terms text[],
        weight numeric,cooldown_turns int,active boolean,metadata jsonb,updated_at timestamptz,
        unique(world_id,slug)
      );
    `);
    await db.query('insert into public.together_worlds values($1,$2,null)',[WORLD_ID,{canonicalLore:{founding:'original seed',other:'preserve'},custom:'preserve'}]);
    await db.exec(sql);
    const metadata=(await db.query('select metadata from public.together_worlds where id=$1',[WORLD_ID])).rows[0].metadata;
    assert.equal(metadata.canonicalLore.originStory,world.canonicalLore.originStory);
    assert.equal(metadata.canonicalLore.founding,'original seed');
    assert.equal(metadata.canonicalLore.other,'preserve');
    assert.equal(metadata.custom,'preserve');
    assert.equal(metadata.worldFactCount,40);
    const facts=(await db.query('select slug,fact_text,metadata from public.together_world_facts where world_id=$1',[WORLD_ID])).rows;
    assert.equal(facts.length,3);
    assert.ok(facts.every(fact=>fact.metadata.source==='eos_origin_story_v1'));

    await db.query('update public.together_world_facts set fact_text=$1,metadata=$2 where slug=$3',
      ['Curated local copy',{source:'custom'},'eos-becoming-home']);
    await db.exec(sql);
    const after=(await db.query('select slug,fact_text from public.together_world_facts where world_id=$1',[WORLD_ID])).rows;
    assert.equal(after.length,3);
    assert.equal(after.find(fact=>fact.slug==='eos-becoming-home').fact_text,'Curated local copy');
  }finally{
    await db.close();
  }
});
