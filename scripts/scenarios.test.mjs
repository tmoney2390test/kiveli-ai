import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const catalogue=JSON.parse(readFileSync('content/scenarios/catalogue-mapped.json','utf8'));
test('80 unique scenarios map to canonical characters/places and focus-specific references',()=>{
 assert.equal(catalogue.length,80);assert.equal(new Set(catalogue.map(s=>s.id)).size,80);
 for(const world of new Set(catalogue.map(s=>s.worldSlug))){const list=catalogue.filter(s=>s.worldSlug===world);assert.equal(list.length,10);assert.equal(list.filter(s=>s.gender==='female').length,7);}
 for(const s of catalogue){assert.match(s.characterTemplateId,/^[a-f0-9-]{36}$/);assert.match(s.locationId,/^[a-f0-9-]{36}$/);assert.ok(s.setup&&s.guidance&&s.opening);assert.equal(s.imageReferences.length,s.imageFocus==='both'?2:1);for(const ref of s.imageReferences)assert.ok(existsSync(ref),ref);}
 const client=readFileSync('apps/together/src/lib/scenarioCatalog.ts','utf8');assert.ok(!client.includes('"guidance"'));assert.ok(!client.includes('"opening"'));
 assert.equal(catalogue.find(s=>s.id==='cal-10').requiredState,'crowcut.access_granted');
});

test('scenario start is atomic, idempotent, scoped to a Life and inaccessible to client writes',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   grant usage on schema auth to authenticated;
   create table auth.users(id uuid primary key);
   create table together_continuities(id uuid primary key,user_id uuid);
   create table together_character_instances(id uuid primary key,user_id uuid,continuity_id uuid,character_template_id uuid);
   create table together_conversations(id uuid primary key,user_id uuid,character_instance_id uuid,continuity_id uuid,user_archived_at timestamptz);
   create table together_messages(id uuid default gen_random_uuid(),user_id uuid,conversation_id uuid,character_instance_id uuid,role text,content text,delivery_status text,provider_metadata jsonb,content_rating text,visibility_scope text,moderation_version text);`);
  await db.exec(readFileSync('supabase/migrations/20260909200807_kivelle_scenarios.sql','utf8'));
  const ids=Array.from({length:8},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),[user,other,life,otherLife,character,otherCharacter,conversation,template]=ids;
  await db.query('insert into auth.users values($1),($2)',[user,other]);
  await db.query('insert into together_continuities values($1,$2),($3,$2)',[life,user,otherLife]);
  await db.query('insert into together_character_instances values($1,$2,$3,$4),($5,$2,$6,$4)',[character,user,life,template,otherCharacter,otherLife]);
  await db.query('insert into together_conversations(id,user_id,character_instance_id,continuity_id) values($1,$2,$3,$4)',[conversation,user,character,life]);
  const start=(id='jun-01',actor=user,continuity=life)=>db.query('select (together_start_scenario($1,$2,$3,$4,$5,$6,$7)).*',[actor,continuity,conversation,character,template,id,'Scenario opening']);
  const first=(await start()).rows[0];assert.equal((await start()).rows[0].id,first.id);
  assert.equal((await db.query('select count(*)::int n from together_messages')).rows[0].n,1);
  await start('jun-02');assert.equal((await db.query("select count(*)::int n from together_scenario_sessions where status='active'")).rows[0].n,1);
  assert.equal((await db.query('select status from together_scenario_sessions where id=$1',[first.id])).rows[0].status,'paused');
  await start();assert.equal((await db.query('select count(*)::int n from together_messages')).rows[0].n,2);
  await assert.rejects(()=>start('jun-03',other),/unavailable/);
  await assert.rejects(()=>start('jun-03',user,otherLife),/unavailable/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from together_scenario_sessions')).rows.length,0);
  await assert.rejects(()=>start(),/permission denied/);
  await assert.rejects(()=>db.query("update together_scenario_sessions set status='completed'"),/permission denied/);
 }finally{await db.close();}
});
