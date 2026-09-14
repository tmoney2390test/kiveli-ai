import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create table together_support_tickets(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,status text default 'open',first_response_at timestamptz,resolved_at timestamptz,updated_at timestamptz);
 create table together_ops_ticket_events(id uuid primary key default gen_random_uuid(),ticket_id uuid references together_support_tickets(id) on delete cascade,actor_user_id uuid,event_type text,previous_state jsonb,next_state jsonb);`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260914195956_support_portal_replies.sql',import.meta.url),'utf8'));
 const owner=crypto.randomUUID(),other=crypto.randomUUID(),staff=crypto.randomUUID(),ticket=crypto.randomUUID();
 await db.query('insert into auth.users values($1),($2),($3)',[owner,other,staff]);
 await db.query("insert into together_support_tickets(id,user_id,status,resolved_at) values($1,$2,'resolved',now())",[ticket,owner]);
 const reply=(author,isSupport,message='Follow-up details',request=crypto.randomUUID())=>db.query('select kivelle_reply_support_ticket($1,$2,$3,$4,$5)',[ticket,author,isSupport,message,request]);
 await assert.rejects(()=>reply(other,false),/unavailable/);
 const key=crypto.randomUUID();await Promise.all([reply(owner,false,'Follow-up details',key),reply(owner,false,'Follow-up details',key)]);
 assert.equal((await db.query('select count(*) as n from together_support_replies')).rows[0].n,1);
 const state=async()=>(await db.query('select * from together_support_tickets')).rows[0];
 assert.equal((await state()).status,'open');assert.equal((await state()).resolved_at,null);assert.equal((await state()).first_response_at,null);
 await assert.rejects(()=>reply(owner,false,'Different content',key),/conflict/);
 await reply(staff,true,'Support response');assert.equal((await state()).status,'waiting');assert.ok((await state()).first_response_at);
 const first=(await state()).first_response_at;await reply(staff,true,'More detail');assert.deepEqual((await state()).first_response_at,first);
 assert.equal((await db.query('select count(*) as n from together_ops_ticket_events')).rows[0].n,3);
 await db.exec('set role authenticated');await assert.rejects(()=>reply(other,true),/permission denied/);await assert.rejects(()=>db.query('select * from together_support_replies'),/permission denied/);
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);assert.equal((await db.query('select count(*) as n from together_support_replies')).rows[0].n,0);
 console.log('Support SQL checks passed: ownership, client access, duplicate/concurrent retries, conflict detection, reopening, response timing, atomic audit, deletion.');
}finally{await db.close();}

