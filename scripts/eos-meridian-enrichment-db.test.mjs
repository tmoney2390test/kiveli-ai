import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { WORLD_ID, LOCATION_PREFIX, characters, locations, socialEdges, storyArcs, recurringEvents, buildSchedules } from './eos-meridian-content.mjs';
import { renderEnrichmentMigration } from './build-eos-meridian-enrichment.mjs';

test('additive migration preserves adult material, custom introductions and user outcomes; rerun is idempotent',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create table together_worlds(id uuid primary key,metadata jsonb,updated_at timestamptz);
   create table together_character_templates(id uuid primary key,slug text,first_meeting jsonb,spice_level int,connection_config jsonb,updated_at timestamptz);
   create table together_character_versions(id uuid primary key,character_template_id uuid references together_character_templates(id),character_bible jsonb,relationship_config jsonb,boundaries jsonb,visual_identity jsonb,life_config jsonb,updated_at timestamptz);
   create table together_locations(id uuid primary key,world_id uuid,slug text,canonical_lore jsonb,metadata jsonb,updated_at timestamptz);
   create table together_story_arc_templates(slug text primary key,specific_world_id uuid,chapters jsonb,min_relationship_stage text,prerequisites jsonb,updated_at timestamptz);
   create table together_character_relationship_edges(world_id uuid,source_template_id uuid,target_template_id uuid,trust int,history text,metadata jsonb,updated_at timestamptz);
   create table together_event_templates(id uuid primary key,name text,event_type text,world_id uuid,default_location_id uuid,participant_template_ids uuid[],significance numeric,probability numeric,duration_minutes int,narrative_summary text,state_effects jsonb,user_visibility text,proactive_eligible boolean,metadata jsonb,active boolean,category text,tone text,scale text,content_level text,conditions jsonb,followups text[],updated_at timestamptz);
   create table together_world_facts(world_id uuid,slug text,title text,fact_text text,category text,truth_mode text,knowledge_scope text,content_level text,topic_tags text[],trigger_terms text[],weight numeric,cooldown_turns int,active boolean,metadata jsonb,updated_at timestamptz,unique(world_id,slug));
   create table together_schedule_templates(character_version_id uuid references together_character_versions(id),day_of_week int,start_minute int,end_minute int,location_id uuid references together_locations(id),activity text,availability text,energy_delta int,mood_influence text,variation_weight numeric,metadata jsonb,unique(character_version_id,day_of_week,start_minute));
   create table together_story_arc_instances(id int,current_chapter_id text,decision jsonb);
   insert into together_story_arc_instances values(1,'chapter-2','{"decision":"preserve privacy"}');
  `);
  await db.query('insert into together_worlds values($1,$2,null)',[WORLD_ID,{canonicalLore:{original:'unchanged'}}]);
  const protectedBible={hiddenSexual:{sentinel:'adult canon must survive'},intimateAnatomy:{sentinel:'unchanged'},romanceStyle:'original',currentGoals:['existing personal goal'],ambitions:['existing ambition'],concerns:['existing concern']};
  for(const [index,c] of characters.entries()){
    await db.query('insert into together_character_templates values($1,$2,$3,3,$4,null)',[c.templateId,c.slug,{opener:index===0?'Custom private authored opener':'You meet somebody who has a reason to speak with you that comes from the immediate setting rather than instant attraction.',custom:'keep'}, {original:'relationship config'}]);
    await db.query('insert into together_character_versions values($1,$2,$3,$4,$5,$6,$7,null)',[c.versionId,c.templateId,protectedBible,{adult:'unchanged'},['original boundary'],{adult:'unchanged'},{private:'unchanged'}]);
  }
  for(const place of locations)await db.query('insert into together_locations values($1,$2,$3,$4,$5,null)',[LOCATION_PREFIX+String(place.index).padStart(12,'0'),WORLD_ID,place.slug,{version:2,storySeeds:['existing mature venue lore'],conversationHooks:['existing hook'],adultNotes:'unchanged'},{}]);
  for(const arc of storyArcs)await db.query('insert into together_story_arc_templates values($1,$2,$3,$4,$5,null)',[arc.slug,WORLD_ID,[],arc.minStage,{original:'keep'}]);
  for(const edge of socialEdges){
    for(const [source,target] of [[edge.source,edge.target],[edge.target,edge.source]])await db.query('insert into together_character_relationship_edges values($1,$2,$3,$4,$5,$6,null)',[WORLD_ID,characters.find(c=>c.slug===source).templateId,characters.find(c=>c.slug===target).templateId,edge.trust,edge.history,{original:'keep'}]);
  }
  for(let index=0;index<8;index++)await db.query('insert into together_event_templates(id,name,world_id,narrative_summary,content_level,metadata) values($1,$2,$3,$4,$5,$6)',[`3b000000-0000-4000-8012-${String(index+1).padStart(12,'0')}`,recurringEvents[index].name,WORLD_ID,'original event narrative',index===0?'mature':'standard',{original:'keep'}]);
  // A scheduled user outcome exists before authoring changes and must not be rewritten.
  const beforeChoices=(await db.query('select * from together_story_arc_instances')).rows;
  await db.exec(renderEnrichmentMigration());
  const versions=(await db.query('select * from together_character_versions')).rows;
  assert.equal(versions.length,47);
  for(const version of versions){
    assert.deepEqual(version.character_bible.hiddenSexual,protectedBible.hiddenSexual);
    assert.deepEqual(version.character_bible.intimateAnatomy,protectedBible.intimateAnatomy);
    assert.deepEqual(version.relationship_config,{adult:'unchanged'});
    assert.deepEqual(version.boundaries,['original boundary']);
    assert.deepEqual(version.visual_identity,{adult:'unchanged'});
    assert.deepEqual(version.life_config,{private:'unchanged'});
    assert.equal(version.character_bible.currentGoals[0],'existing personal goal');
    assert.equal(version.character_bible.currentGoals.length,2);
    assert.ok(version.character_bible.editorialLife);
  }
  assert.equal((await db.query('select first_meeting from together_character_templates where id=$1',[characters[0].templateId])).rows[0].first_meeting.opener,'Custom private authored opener');
  assert.equal((await db.query('select first_meeting from together_character_templates where id=$1',[characters[1].templateId])).rows[0].first_meeting.opener,characters[1].firstMeeting.opener);
  const lore=(await db.query("select canonical_lore from together_locations where slug='static-garden'")).rows[0].canonical_lore;
  assert.equal(lore.adultNotes,'unchanged');assert.ok(lore.storySeeds.includes('existing mature venue lore'));assert.ok(lore.publicHistory.length);
  assert.equal((await db.query("select narrative_summary from together_event_templates where content_level='mature'")).rows[0].narrative_summary,'original event narrative');
  assert.equal((await db.query('select count(*)::int n from together_schedule_templates')).rows[0].n,buildSchedules().length);
  assert.deepEqual((await db.query('select * from together_story_arc_instances')).rows,beforeChoices);
  const stableBefore=(await db.query('select id,character_bible from together_character_versions order by id')).rows;
  await db.exec(renderEnrichmentMigration());
  assert.deepEqual((await db.query('select id,character_bible from together_character_versions order by id')).rows,stableBefore);
  assert.deepEqual((await db.query("select canonical_lore from together_locations where slug='static-garden'")).rows[0].canonical_lore,lore);
  assert.equal((await db.query('select count(*)::int n from together_event_templates')).rows[0].n,9);
  assert.equal((await db.query('select count(*)::int n from together_world_facts')).rows[0].n,7);
  assert.equal((await db.query('select count(*)::int n from together_schedule_templates')).rows[0].n,buildSchedules().length);
 }catch(error){throw new Error(error.message);}
 finally{await db.close();}
});
