import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create table together_conversations(id uuid primary key);
create table together_dialogue_turns(id uuid primary key,user_id uuid,conversation_id uuid,request_id text,state text);
create table together_messages(id uuid primary key,user_id uuid,conversation_id uuid,speaker_character_instance_id uuid,character_instance_id uuid,role text,content text,delivery_status text,provider_metadata jsonb);
create table together_credit_accounts(user_id uuid primary key,permanent_balance integer not null default 0,subscription_balance integer not null default 0,subscription_expires_at timestamptz,subscription_grant_cycle text,updated_at timestamptz default now());
create table together_credit_ledger(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,permanent_delta integer default 0,subscription_delta integer default 0,idempotency_key text,reference_type text,reference_id text,metadata jsonb,unique(user_id,idempotency_key));
create table together_entitlements(user_id uuid,tier text);`);
const root=new URL('..',import.meta.url).pathname;
const migration=readFileSync(`${root}/supabase/migrations/20260907220440_context_pricing.sql`,'utf8').replace(/^select cron.schedule.*$/m,'');
await db.exec(migration);
const user=crypto.randomUUID(),conversation=crypto.randomUUID(),speaker=crypto.randomUUID();
await db.query('insert into auth.users values($1)',[user]);await db.query('insert into together_conversations values($1)',[conversation]);
await db.query('insert into together_entitlements values($1,$2)',[user,'kivelle_plus']);await db.query('insert into together_credit_accounts(user_id,permanent_balance,subscription_balance) values($1,20,20)',[user]);
const balance=async()=> (await db.query('select permanent_balance,subscription_balance from together_credit_accounts where user_id=$1',[user])).rows[0];
async function quote(max=5,expires='1 minute'){
 const request=crypto.randomUUID(),turn=crypto.randomUUID();
 await db.query("insert into together_dialogue_turns values($1,$2,$3,$4,'planning')",[turn,user,conversation,request]);
 const manifest={maximumReplies:1,replies:[{speakerId:speaker,maximumCredits:max}]};
 const q=(await db.query("insert into together_context_quotes(user_id,conversation_id,fingerprint,state_fingerprint,pricing_version,manifest,maximum_credits,expires_at) values($1,$2,'draft','state','v1',$3,$4,now()+$5::interval) returning id",[user,conversation,manifest,max,expires])).rows[0].id;
 return{q,turn,request};
}
async function reserve(q,fingerprint='draft'){return db.query('select kivelle_reserve_context($1,$2,$3,$4,$5,$6)',[user,q.q,q.request,q.turn,fingerprint,'state']);}
async function close(q){return db.query('select kivelle_close_context($1)',[q.q]);}
async function reply(q,cost,id=crypto.randomUUID()){await db.query("insert into together_messages values($1,$2,$3,$4,$4,'assistant','Completed reply','complete',$5)",[id,user,conversation,speaker,{contextCharge:{quoteId:q.q,replyKey:crypto.randomUUID(),credits:cost}}]);return id;}
const q=await quote();await reserve(q);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:15});
await Promise.all([reserve(q),reserve(q)]);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:15});
await assert.rejects(()=>reply(q,6),/CONTEXT_RECEIPT_INVALID/);assert.equal((await db.query('select count(*)::int as n from together_messages')).rows[0].n,0);
await reply(q,2);await close(q);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:18});await close(q);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:18});
await assert.rejects(()=>reply(q,1),/CONTEXT_RECEIPT_INVALID/);
const failure=await quote();await reserve(failure);await close(failure);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:18});
const stale=await quote(5,'-1 minute');await assert.rejects(()=>reserve(stale),/CONTEXT_QUOTE_EXPIRED/);
const wrong=await quote();await assert.rejects(()=>reserve(wrong,'different draft'),/CONTEXT_QUOTE_EXPIRED/);
const poor=await quote(100);await assert.rejects(()=>reserve(poor),/INSUFFICIENT/);assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:18});
const crash=await quote();await reserve(crash);await reply(crash,1);await db.query("update together_context_quotes set reserved_at=now()-interval '11 minutes' where id=$1",[crash.q]);await db.exec('select kivelle_recover_context_holds()');assert.deepEqual(await balance(),{permanent_balance:20,subscription_balance:17});
const mixed=await quote(20);await reserve(mixed);assert.deepEqual(await balance(),{permanent_balance:17,subscription_balance:0});await reply(mixed,19);await close(mixed);assert.deepEqual(await balance(),{permanent_balance:18,subscription_balance:0});
assert.equal((await db.query("select has_function_privilege('authenticated','kivelle_reserve_context(uuid,uuid,uuid,uuid,text,text)','execute') as allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_table_privilege('authenticated','together_context_quotes','select') as allowed")).rows[0].allowed,false);
const repeated=await quote(6);await db.query("update together_context_quotes set manifest=jsonb_set(manifest,'{maximumReplies}','2'::jsonb) where id=$1",[repeated.q]);await reserve(repeated);await reply(repeated,2);await reply(repeated,2);await assert.rejects(()=>reply(repeated,0),/CONTEXT_RECEIPT_INVALID/);await close(repeated);assert.deepEqual(await balance(),{permanent_balance:14,subscription_balance:0});
console.log('PASS: reservation idempotency, partial settlement, failure release, stale/mismatched quotes, insufficient funds, persisted-reply recovery, bucket provenance, and service-only permissions.');
await db.close();
