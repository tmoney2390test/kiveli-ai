import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('world choices commit once, reject stale/cross-account writes and keep private state server-only',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create table together_worlds(id uuid primary key);
      create table together_continuities(id uuid primary key,user_id uuid);
      create table together_character_instances(id uuid primary key,user_id uuid,continuity_id uuid,character_version_id uuid,character_template_id uuid);
      create table together_character_world_presence(character_version_id uuid,world_id uuid);
      create table together_character_schedule_events(character_instance_id uuid,user_id uuid,source text,ends_at timestamptz);
      create table together_shared_plans(id uuid,user_id uuid,continuity_id uuid,world_id uuid,character_instance_id uuid,participant_instance_ids uuid[],status text,starts_at timestamptz,ends_at timestamptz,cancelled_at timestamptz,updated_at timestamptz,metadata jsonb);
      create table together_date_sessions(character_instance_id uuid,user_id uuid,continuity_id uuid,status text,state jsonb,scheduled_for timestamptz,started_at timestamptz,updated_at timestamptz);
      create table together_scene_sessions(character_instance_id uuid,user_id uuid,continuity_id uuid,ended_at timestamptz,updated_at timestamptz);
      create table together_locations(access_metadata jsonb);
      create table together_schedule_templates(metadata jsonb);
      create table together_character_homes(world_id uuid);`);
    await db.exec(readFileSync('supabase/migrations/20260908163856_calders_run_progress.sql','utf8'));
    const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',continuity='00000000-0000-4000-8000-000000000003',world='31740169-035e-5b10-8c9d-98b206e9f24b';
    await db.query('insert into auth.users values($1),($2)',[user,other]);
    await db.query('insert into together_worlds values($1)',[world]);
    await db.query('insert into together_continuities values($1,$2)',[continuity,user]);
    const commit=(actor,version,key)=>db.query('select kivelle_commit_world_progress($1,$2,$3,$4,$5,$6,$7) result',[actor,continuity,world,version,key,{flags:['crowcut.access_granted']},{version:version+1}]);
    assert.equal((await commit(user,0,'first')).rows[0].result.version,1);
    assert.equal((await commit(user,0,'first')).rows[0].result.version,1);
    assert.equal((await db.query('select version from together_world_progress')).rows[0].version,1);
    await assert.rejects(()=>commit(user,0,'stale'),/WORLD_PROGRESS_CONFLICT/);
    await assert.rejects(()=>commit(other,1,'foreign'),/WORLD_PROGRESS_FORBIDDEN/);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select * from together_world_progress'),/permission denied/);
    await assert.rejects(()=>commit(user,1,'client'),/permission denied/);
  } finally {await db.close();}
});
