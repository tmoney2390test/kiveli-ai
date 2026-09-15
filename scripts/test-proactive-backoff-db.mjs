import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
await db.exec(`create role anon;create role authenticated;
create table together_notification_preferences(user_id text,initiative_level text default 'natural',character_initiated_messages boolean default true,companion_initiative_levels jsonb);
create table together_conversations(id text,user_id text);
create table together_proactive_messages(id text,user_id text,dedupe_key text);
create table together_messages(id text,conversation_id text,user_id text,character_instance_id text,role text,delivery_status text,created_at timestamptz default now(),provider_metadata jsonb);
insert into together_notification_preferences values ('u','natural',true,'{}');
insert into together_conversations values ('c','u');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260915151434_proactive_backoff.sql',import.meta.url),'utf8'));
await db.exec("insert into together_notification_preferences(user_id) values ('new')");
assert.deepEqual((await db.query("select initiative_level,character_initiated_messages from together_notification_preferences where user_id='new'")).rows[0],{initiative_level:'off',character_initiated_messages:false});
for(const [hours,count,allowed] of [[20,1,false],[40,1,true],[40,2,false],[80,2,true],[200,3,false]]) {
await db.exec("delete from together_messages;insert into together_messages(id,conversation_id,user_id,role,created_at) values('user','c','u','user',now()-interval '300 hours')");
for(let i=0;i<count;i++) await db.query("insert into together_messages(id,conversation_id,user_id,character_instance_id,role,created_at) values ($1,'c','u','char','assistant',now()-make_interval(hours=>$2))",['old'+i,hours+i]);
await db.exec(`update together_messages set provider_metadata='{"proactive":true}' where role='assistant'`);
const result=await db.query(`insert into together_messages(id,conversation_id,user_id,character_instance_id,role,provider_metadata) values('send','c','u','char','assistant','{"proactive":true}') returning id`);
assert.equal(result.rows.length,allowed?1:0);
if(allowed) assert.equal((await db.query(`insert into together_messages(id,conversation_id,user_id,character_instance_id,role,provider_metadata) values('burst','c','u','char','assistant','{"proactive":true}') returning id`)).rows.length,0);
}
await db.exec("update together_messages set created_at=now()-interval '6 hours' where role='user';update together_messages set created_at=now()-interval '250 hours' where role='assistant'");
assert.equal((await db.query(`insert into together_messages(id,conversation_id,user_id,character_instance_id,role,provider_metadata) values('reset','c','u','char','assistant','{"proactive":true}') returning id`)).rows.length,1);
console.log('PASS: new-user Off, exponential backoff, three-message cap, burst suppression and reply reset');
}finally{await db.close();}

