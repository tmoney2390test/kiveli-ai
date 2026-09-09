import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('Calder reservations protect all group journeys, edits and synchronized dates',async()=>{
  const db=new PGlite();
  const world='31740169-035e-5b10-8c9d-98b206e9f24b',user='00000000-0000-4000-8000-000000000001',continuity='00000000-0000-4000-8000-000000000002',a='00000000-0000-4000-8000-000000000003',b='00000000-0000-4000-8000-000000000004',location='00000000-0000-4000-8000-000000000005',template='00000000-0000-4000-8000-000000000006';
  const time=value=>`2026-09-10T${value}:00Z`;
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table together_shared_plans(id uuid primary key default gen_random_uuid(),user_id uuid,continuity_id uuid,character_instance_id uuid,participant_instance_ids uuid[],world_id uuid,location_id uuid,metadata jsonb,status text,starts_at timestamptz,ends_at timestamptz,title text,activity_key text,window_starts_at timestamptz,window_ends_at timestamptz,time_precision text,world_timezone text,user_timezone text,participation_mode text,grace_minutes int,grace_ends_at timestamptz,source text,completed_at timestamptz,cancelled_at timestamptz,updated_at timestamptz,miss_reason text);
      create table together_date_templates(id uuid primary key,world_id uuid,location_id uuid,name text,metadata jsonb);
      create table together_worlds(id uuid,timezone text);
      create table together_profiles(user_id uuid,experience_timezone text);
      create table together_plan_attendance(user_id uuid,continuity_id uuid,plan_id uuid,participant_type text,character_instance_id uuid,joined_at timestamptz,source text,metadata jsonb);
      create table together_date_sessions(id uuid primary key,user_id uuid,continuity_id uuid,character_instance_id uuid,date_template_id uuid,shared_plan_id uuid,status text,scheduled_for timestamptz,started_at timestamptz,completed_at timestamptz,state jsonb);
      create trigger date_sync before insert or update of status,scheduled_for,completed_at on together_date_sessions for each row execute function pg_catalog.suppress_redundant_updates_trigger();`);
    await db.exec(readFileSync('supabase/migrations/20260909170718_calders_reservation_guards.sql','utf8'));
    await db.exec('drop trigger date_sync on together_date_sessions;create trigger date_sync before insert or update of status,scheduled_for,completed_at on together_date_sessions for each row execute function kivelle_sync_date_commitment()');
    const save=async(actor,start,end,metadata={},participants=[actor],worldId=world)=>(await db.query('insert into together_shared_plans(user_id,continuity_id,character_instance_id,participant_instance_ids,world_id,location_id,status,starts_at,ends_at,metadata) values($1,$2,$3,$4,$5,$6,\'scheduled\',$7,$8,$9) returning id',[user,continuity,actor,participants,worldId,location,time(start),time(end),metadata])).rows[0].id;
    const group=await save(a,'12:00','13:00',{travelReservationsByParticipant:{[a]:{travelReservationStartsAt:time('11:50'),travelReservationEndsAt:time('13:10')},[b]:{travelReservationStartsAt:time('11:30'),travelReservationEndsAt:time('13:30')}}},[a,b]);
    await assert.rejects(()=>save(b,'13:15','14:00'),/CALDER_RESERVATION_CONFLICT/);
    const later=await save(b,'13:30','14:00');
    await assert.rejects(()=>db.query('update together_shared_plans set starts_at=$1 where id=$2',[time('13:20'),later]),/CALDER_RESERVATION_CONFLICT/);
    assert.equal((await db.query('select starts_at from together_shared_plans where id=$1',[later])).rows[0].starts_at.toISOString(),time('13:30').replace('Z','.000Z'));
    await db.query("update together_shared_plans set status='cancelled' where id=$1",[group]);
    await save(b,'12:00','13:30');
    // Existing worlds retain their original scheduling policy.
    await save(a,'12:00','13:00',{},[a],location);
    await save(a,'12:00','13:00',{},[a],location);
    await db.query('insert into together_worlds values($1,\'UTC\');',[world]);
    await db.query('insert into together_profiles values($1,\'UTC\')',[user]);
    await db.query('insert into together_date_templates values($1,$2,$3,\'Cafe\',\'{}\')',[template,world,location]);
    const state={travelReservationStartsAt:time('15:30'),travelReservationEndsAt:time('17:30'),reservedDateEndsAt:time('17:00')};
    const date=(await db.query('insert into together_date_sessions(id,user_id,continuity_id,character_instance_id,date_template_id,status,scheduled_for,state) values(gen_random_uuid(),$1,$2,$3,$4,\'upcoming\',$5,$6) returning *',[user,continuity,a,template,time('16:00'),state])).rows[0];
    await assert.rejects(()=>save(a,'17:15','18:00'),/CALDER_RESERVATION_CONFLICT/);
    await db.query("update together_date_sessions set status='active',started_at=$1 where id=$2",[time('16:20'),date.id]);
    const plan=(await db.query('select * from together_shared_plans where id=$1',[date.shared_plan_id])).rows[0];
    assert.equal(plan.ends_at.toISOString(),time('17:00').replace('Z','.000Z'));
    assert.equal(plan.metadata.travelReservationEndsAt,time('17:30'));
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select kivelle_guard_calder_reservation()'),/permission denied/);
  }finally{await db.close();}
});

