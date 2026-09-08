import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db=new PGlite();
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
try {
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create table together_conversations(id uuid primary key,user_id uuid,continuity_id uuid,kind text default 'direct',archived_at timestamptz,user_archived_at timestamptz);
create table together_character_instances(id uuid primary key,user_id uuid,continuity_id uuid);
create table together_conversation_participants(conversation_id uuid,user_id uuid,character_instance_id uuid,left_at timestamptz);
create table together_dialogue_turns(id uuid primary key default gen_random_uuid(),user_id uuid,continuity_id uuid,conversation_id uuid,request_id text,turn_kind text,state text,
 source_message_id uuid,lease_token uuid,lease_expires_at timestamptz,version integer default 1,metadata jsonb default '{}',planned_actions jsonb default '[]',completed_action_count integer default 0,
 created_at timestamptz default now(),updated_at timestamptz default now(),cancelled_at timestamptz,yielded_at timestamptz,unique(conversation_id,request_id));
create unique index active_floor on together_dialogue_turns(conversation_id) where state in ('planning','generating');
create table together_messages(id uuid primary key default gen_random_uuid(),user_id uuid,conversation_id uuid,speaker_character_instance_id uuid,character_instance_id uuid,role text,content text,delivery_status text,provider_metadata jsonb,dialogue_turn_id uuid,response_to_message_id uuid,response_key text);
create unique index response_identity on together_messages(conversation_id,response_key) where response_key is not null;
create table together_credit_accounts(user_id uuid primary key,permanent_balance integer not null default 0,subscription_balance integer not null default 0,subscription_expires_at timestamptz,subscription_grant_cycle text,updated_at timestamptz default now());
create table together_credit_ledger(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,permanent_delta integer default 0,subscription_delta integer default 0,idempotency_key text,reference_type text,reference_id text,metadata jsonb,unique(user_id,idempotency_key));
create table together_entitlements(user_id uuid,tier text);`);
await db.exec(migration('20260907220440_context_pricing.sql').replace(/^select cron.schedule.*$/m,''));
const hardening=migration('202608230015_kivelle_chat_message_hardening.sql');
await db.exec(hardening.slice(hardening.indexOf('create or replace function public.kivelle_begin_dialogue_turn'),hardening.lastIndexOf('commit;')));
await db.exec(migration('20260908110440_kivelle_chat_primary_completion.sql'));
const user=crypto.randomUUID(),continuity=crypto.randomUUID(),conversation=crypto.randomUUID(),speaker=crypto.randomUUID();
await db.query('insert into auth.users values($1)',[user]);
await db.query('insert into together_conversations(id,user_id,continuity_id) values($1,$2,$3)',[conversation,user,continuity]);
await db.query('insert into together_character_instances values($1,$2,$3)',[speaker,user,continuity]);
await db.query('insert into together_entitlements values($1,$2)',[user,'kivelle_plus']);
await db.query('insert into together_credit_accounts(user_id,permanent_balance) values($1,20)',[user]);
const acquire=async(request,kind='direct')=>(await db.query(`select * from kivelle_begin_${kind}_dialogue_turn_v2($1,$2,$3,$4)`,[user,continuity,conversation,request])).rows[0];
const activate=async turn=>db.query("update together_dialogue_turns set state='generating',source_message_id=$2 where id=$1",[turn.turn_id,crypto.randomUUID()]);
const commit=async(turn,key,metadata={})=>(await db.query('select * from kivelle_commit_direct_message($1,$2,$3,$4,$5,$6)',[turn.turn_id,turn.lease_token,speaker,'Canonical reply',metadata,key])).rows;
const mark=async(turn,message)=>(await db.query('select kivelle_mark_direct_primary_complete($1,$2,$3) as ok',[turn.turn_id,turn.lease_token,message])).rows[0].ok;
const balance=async()=>(await db.query('select permanent_balance from together_credit_accounts where user_id=$1',[user])).rows[0].permanent_balance;
async function reserve(turn,request){
  const manifest={maximumReplies:2,replies:[{speakerId:speaker,maximumCredits:5}]};
  const quote=(await db.query("insert into together_context_quotes(user_id,conversation_id,fingerprint,state_fingerprint,pricing_version,manifest,maximum_credits,expires_at) values($1,$2,'draft','state','v1',$3,5,now()+interval '1 minute') returning id",[user,conversation,manifest])).rows[0].id;
  await db.query("select kivelle_reserve_context($1,$2,$3,$4,'draft','state')",[user,quote,request,turn.turn_id]);
  return quote;
}
const request=crypto.randomUUID(),nextRequest=crypto.randomUUID(),first=await acquire(request);
assert.equal(first.acquired,true);
assert.equal((await acquire(request)).acquired,false);
assert.equal((await acquire(nextRequest)).acquired,false);
await activate(first);
assert.equal((await acquire(nextRequest)).acquired,false,'pending primary must retain the floor');
assert.equal(await mark(first,crypto.randomUUID()),false);
const quote=await reserve(first,request);assert.equal(await balance(),15);
const primaryKey=`direct:${request}:primary`;
const [primary]=await commit(first,primaryKey,{contextCharge:{quoteId:quote,replyKey:crypto.randomUUID(),credits:2}});
assert.equal(primary.created,true);
assert.equal((await commit(first,primaryKey))[0].created,false);
assert.equal((await acquire(nextRequest)).acquired,false,'commit alone cannot unlock before required scene updates');
assert.equal(await mark({...first,lease_token:crypto.randomUUID()},primary.message_id),false);
assert.equal(await mark(first,primary.message_id),true);
const next=await acquire(nextRequest);
assert.equal(next.acquired,true);assert.equal(next.interrupted_count,1);
assert.equal(await balance(),18,'unused hold is refunded in the takeover transaction');
assert.equal((await commit(first,`direct:${request}:secondary:${speaker}`)).length,0,'cancelled turn cannot commit');
assert.equal(await mark(first,primary.message_id),false);
await db.query('select kivelle_close_context($1)',[quote]);assert.equal(await balance(),18,'late old-worker settlement is idempotent');
const nextQuote=await reserve(next,nextRequest);assert.equal(await balance(),13);
await db.query('select kivelle_close_context($1)',[quote]);assert.equal(await balance(),13,'old worker cannot release the new hold');
await db.query('select kivelle_close_context($1)',[nextQuote]);
await db.query("update together_dialogue_turns set state='completed' where id=$1",[next.turn_id]);
await db.query("update together_conversations set kind='group' where id=$1",[conversation]);
await db.query('insert into together_conversation_participants values($1,$2,$3,null)',[conversation,user,speaker]);
const groupRequest=crypto.randomUUID(),group=await acquire(groupRequest,'group');await activate(group);
const groupQuote=await reserve(group,groupRequest);
const groupCommit=async version=>(await db.query('select * from kivelle_commit_group_message_v2($1,$2,$3,$4,$5)',[group.turn_id,version,speaker,'Group response',{groupActionId:'first',contextCharge:{quoteId:groupQuote,replyKey:crypto.randomUUID(),credits:1}}])).rows;
assert.equal((await groupCommit(1))[0].created,true);
assert.equal((await groupCommit(1))[0].created,false);
const groupNext=await acquire(crypto.randomUUID(),'group');assert.equal(groupNext.acquired,true);
assert.equal(await balance(),17);assert.equal((await groupCommit(1)).length,0);
await activate(groupNext);await db.query("update together_dialogue_turns set lease_expires_at=now()-interval '1 second' where id=$1",[groupNext.turn_id]);
assert.equal((await db.query("select * from kivelle_commit_group_message_v2($1,1,$2,'Expired','{}')",[groupNext.turn_id,speaker])).rows.length,0);
for(const signature of ['kivelle_begin_direct_dialogue_turn_v2(uuid,uuid,uuid,text,integer)','kivelle_begin_group_dialogue_turn_v2(uuid,uuid,uuid,text,integer)','kivelle_mark_direct_primary_complete(uuid,uuid,uuid)','kivelle_commit_direct_message(uuid,uuid,uuid,text,jsonb,text)','kivelle_commit_group_message_v2(uuid,integer,uuid,text,jsonb)']){
  for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as ok',[role,signature])).rows[0].ok,false);
}
console.log('PASS: primary gating, idempotent replay, takeover, stale/expired commits, isolated settlement, group interruption, and service-only grants.');
} finally { await db.close(); }
