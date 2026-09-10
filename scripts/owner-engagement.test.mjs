import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('engagement aggregates enforce consent, app scope, QA exclusion, cohort maturity and request-level quality',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create table together_profiles(user_id uuid primary key,created_at timestamptz,privacy_settings jsonb default '{}');
 create table together_entitlements(user_id uuid primary key,tier text,expires_at timestamptz);
 create table together_messages(id uuid primary key default gen_random_uuid(),user_id uuid,character_instance_id uuid,conversation_id uuid,role text,delivery_status text default 'complete',provider_metadata jsonb default '{}',created_at timestamptz);
 create table together_character_instances(id uuid primary key,user_id uuid,character_template_id uuid,current_location_id uuid,created_at timestamptz);
 create table together_character_templates(id uuid primary key,name text,slug text);
 create table together_locations(id uuid primary key,world_id uuid);
 create table together_worlds(id uuid primary key,name text);
 create table together_scenario_sessions(user_id uuid,scenario_id text,status text,started_at timestamptz);
 create table together_generated_media(user_id uuid,media_type text,status text,generation_ms int,attempt_count int,created_at timestamptz);
 create table together_ai_usage_events(user_id uuid,provider text,model text,success boolean,provider_cost_usd numeric,estimated_cost_usd numeric,latency_ms int,created_at timestamptz);
 create table together_analytics_events(user_id uuid,event_name text,created_at timestamptz);
 create table together_proactive_messages(user_id uuid,status text,sent_message_id uuid,context jsonb,created_at timestamptz,dedupe_key text);
 create table together_ops_audit_log(actor_user_id uuid,actor_role text,action text,target_type text,target_id text,request_id text,reason_safe text,metadata jsonb);`);
 await db.exec(readFileSync('supabase/migrations/20260910130706_owner_engagement_console.sql','utf8'));
 const ids=Array.from({length:10},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`),[user,qa,optout,unrelated,admin,character,template,world,location,conversation]=ids;
 for(const [id,email,metadata] of [[user,'person@example.com',{}],[qa,'qa@example.com',{}],[optout,'private@example.com',{}],[unrelated,'other-app@example.com',{}],[admin,'owner@example.com',{together_admin:true}]]){
  await db.query('insert into auth.users values($1,$2,$3)',[id,email,metadata]);if(id!==unrelated)await db.query('insert into together_profiles values($1,$2,$3)',[id,'2026-09-01T20:00:00Z',{analytics:id!==optout}]);
 }
 await db.query("insert into together_entitlements values($1,'kivelle_plus',null)",[user]);
 await db.query('select kivelle_label_engagement_account($1,$2,$3,$4,$5)',[admin,qa,'test','QA test account','req']);
 assert.equal((await db.query('select count(*)::int n from together_ops_audit_log')).rows[0].n,1);
 await db.query('insert into together_character_templates values($1,$2,$3)',[template,'Freya','freya']);await db.query('insert into together_worlds values($1,$2)',[world,'A world']);await db.query('insert into together_locations values($1,$2)',[location,world]);await db.query('insert into together_character_instances values($1,$2,$3,$4,$5)',[character,user,template,location,'2026-09-01T21:00:00Z']);
 for(const who of [user,qa,optout,unrelated,admin])await db.query("insert into together_messages(user_id,character_instance_id,conversation_id,role,created_at) values($1,$2,$3,'user','2026-09-02T12:00:00Z')",[who,character,conversation]);
 await db.query("insert into together_messages(user_id,character_instance_id,conversation_id,role,created_at) values($1,$2,$3,'assistant','2026-09-02T12:01:00Z'),($1,$2,$3,'user','2026-09-08T23:00:00Z')",[user,character,conversation]);
 await db.query("insert into together_generated_media values($1,'image','ready',1000,2,'2026-09-02'),($1,'image','failed',2000,1,'2026-09-02'),($1,'image','pending',null,1,'2026-09-02')",[user]);
 await db.query("insert into together_ai_usage_events values($1,'provider','model',true,.04,.08,1200,'2026-09-02'),($1,'provider','model',false,null,null,400,'2026-09-02')",[user]);
 await db.query("insert into together_proactive_messages values($1,'queued',null,'{}','2026-09-02',null),($1,'queued',null,'{}','2026-09-02','plan:pre:example'),($1,'queued',null,'{\"groupPlanId\":\"example\"}','2026-09-02',null)",[user]);
 const report=async(tier='all',internal=false,from='2026-09-01T00:00:00Z',to='2026-09-10T00:00:00Z')=>(await db.query('select kivelle_engagement_dashboard($1,$2,$3,$4) r',[from,to,tier,internal])).rows[0].r;
 let r=await report();assert.equal(r.summary.chatters,1);assert.equal(r.summary.messages,2);assert.equal(r.coverage.optedOut,1);assert.equal(r.coverage.excludedInternal,2);assert.equal(r.activation.successfulExchange,1);assert.equal(r.activation.secondChatDay,1);assert.equal(r.media[0].requested,3);assert.equal(r.media[0].ready,1);assert.equal(r.media[0].failed,1);assert.equal(r.media[0].pending,1);assert.equal(r.media[0].retried,1);
 assert.equal(r.providers[0].priced,1);assert.equal(r.providers[0].requests,2);assert.equal(Number(r.providers[0].cost),.04);assert.equal(r.proactive.queued,1);
 assert.equal(r.cohorts.find(c=>c.day===1).returned,1);assert.equal(r.cohorts.find(c=>c.day===7).returned,1);assert.equal(r.cohorts.find(c=>c.day===30).eligible,0);assert.equal(r.daily.length,9);assert.equal((await report('free')).summary.chatters,0);assert.equal((await report('all',true)).summary.chatters,3);
 assert.equal((await report('all',false,'2026-09-01T00:00:00Z','2026-09-08T12:00:00Z')).cohorts.find(c=>c.day===7).eligible,0,'Partial return day is not mature');
 const event=ids[7],session=ids[8];const record=async(who)=>(await db.query("select kivelle_record_engagement($1,$2,$3,'foreground_ping','chat',null,100,'web') ok",[who,event,session])).rows[0].ok;
 assert.equal(await record(optout),false);assert.equal(await record(unrelated),false);assert.equal(await record(user),true);assert.equal(await record(user),false);assert.equal((await db.query('select active_seconds from together_engagement_events')).rows[0].active_seconds,60);
 for(const fn of ['kivelle_engagement_dashboard(timestamptz,timestamptz,text,boolean,uuid[])','kivelle_record_engagement(uuid,uuid,uuid,text,text,text,integer,text)','kivelle_label_engagement_account(uuid,uuid,text,text,text)'])assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') ok",[fn])).rows[0].ok,false);
 await assert.rejects(()=>report('invalid'),/INVALID_REPORT_RANGE/);await assert.rejects(()=>report('all',false,'2026-01-01','2026-09-10'),/INVALID_REPORT_RANGE/);
 await db.exec("update together_profiles set privacy_settings='{\"analytics\":false}'");r=await report();assert.equal(r.summary.messages,0);assert.equal(r.characters.length,0);assert.equal(r.media.length,0);
 }finally{await db.close();}
});
