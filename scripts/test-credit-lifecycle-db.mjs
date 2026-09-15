import {PGlite} from '@electric-sql/pglite';import{readFileSync}from'node:fs';import assert from'node:assert/strict';
const db=new PGlite();const u=crypto.randomUUID();
try{
await db.exec(`create role anon;create role authenticated;create role service_role;
create table together_credit_accounts(user_id uuid primary key,permanent_balance integer not null default 0 check(permanent_balance>=0),subscription_balance integer not null default 0 check(subscription_balance>=0),subscription_grant_cycle text,subscription_expires_at timestamptz,updated_at timestamptz);
create table together_credit_ledger(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,permanent_delta integer default 0,subscription_delta integer default 0,idempotency_key text not null,reference_type text,reference_id text,metadata jsonb default '{}',created_at timestamptz default now(),unique(user_id,idempotency_key));
create table together_generated_media(id uuid primary key,user_id uuid,status text,metadata jsonb,updated_at timestamptz);
create table together_entitlements(user_id uuid primary key,tier text,expires_at timestamptz);`);
const lifecycle=readFileSync(new URL('../supabase/migrations/202608310003_kivelle_subscription_plan_change_credits.sql',import.meta.url),'utf8');
await db.exec(lifecycle.slice(lifecycle.indexOf('create or replace function'),lifecycle.indexOf('-- Guard lifecycle')));
await db.exec(readFileSync(new URL('../supabase/migrations/20260915152625_credit_ledger_hardening.sql',import.meta.url),'utf8'));
await db.query("insert into together_entitlements values($1,'kivelle_plus',null)",[u]);
const q=async(sql,args=[])=> (await db.query(sql,args)).rows[0];
const balance=()=>q('select permanent_balance p,subscription_balance s from together_credit_accounts where user_id=$1',[u]);
const grant=(month,target=500,cap=1000,key=month+'-'+target)=>q('select kivelle_grant_subscription_credit_target($1,$2,$3,$4,$5) result',[u,target,cap,'benefit:'+month,key]);
const spend=(n,key)=>q("select kivelle_spend_credits($1,$2,$3,'test','job') result",[u,n,key]);
const refund=(tx,key)=>q('select kivelle_refund_credit_transaction($1,$2,$3) result',[u,tx,key]);
await Promise.all([q("select kivelle_grant_permanent_credits($1,250,'purchase','pack')",[u]),q("select kivelle_grant_permanent_credits($1,250,'purchase','pack')",[u])]);
assert.deepEqual(await balance(),{p:250,s:0});
await grant('2026-06');await grant('2026-07');await grant('2026-08');assert.deepEqual(await balance(),{p:250,s:1000});
const spends=await Promise.all([spend(200,'one'),spend(200,'one')]);assert.equal(spends[0].result.transactionId,spends[1].result.transactionId);assert.deepEqual(await balance(),{p:250,s:800});
await grant('2026-08');assert.deepEqual(await balance(),{p:250,s:800});
await grant('2026-09');assert.deepEqual(await balance(),{p:250,s:1000});
assert.equal((await grant('2026-07',1200,2400,'late')).result.stale,true);
await Promise.all([refund(spends[0].result.transactionId,'refund1'),refund(spends[0].result.transactionId,'refund2')]);assert.deepEqual(await balance(),{p:450,s:1000});
await db.query("update together_entitlements set tier='kivelle_max' where user_id=$1",[u]);
await grant('2026-09',1200,2400);assert.equal((await balance()).s,2000); // September already granted 200; top-up supplies remaining 1000.
await grant('2026-10',1200,2400);assert.equal((await balance()).s,2400);
const expiredSpend=await spend(100,'expiring');await db.query("update together_credit_accounts set subscription_expires_at=now()-interval '1 second' where user_id=$1",[u]);
await refund(expiredSpend.result.transactionId,'expired-refund');assert.equal((await balance()).p,550);
await spend(50,'after-expiry');assert.deepEqual(await balance(),{p:500,s:0});
await assert.rejects(()=>spend(501,'too-much'),/INSUFFICIENT/);assert.deepEqual(await balance(),{p:500,s:0});
const totals=await q('select sum(permanent_delta)::int p,sum(subscription_delta)::int s from together_credit_ledger where user_id=$1',[u]);assert.deepEqual(totals,await balance());
const failed=await spend(10,'failed-photo');await db.query("insert into together_generated_media values($1,$2,'failed',$3,now()-interval '10 minutes')",[crypto.randomUUID(),u,JSON.stringify({creditTransactionId:failed.result.transactionId})]);
assert.equal((await q('select kivelle_repair_failed_media_refunds() n')).n,1);assert.equal((await q('select kivelle_repair_failed_media_refunds() n')).n,0);assert.equal((await balance()).p,500);
const v=crypto.randomUUID(),at=new Date(),cycle='benefit:'+at.toISOString().slice(0,7);
await db.query("select kivelle_grant_permanent_credits($1,17,'welcome_grant','welcome')",[v]);
await db.query("select kivelle_grant_subscription_credit_target($1,1200,2400,$2,'max')",[v,cycle]);
const lifecycleAt=(cap,paid,days=0)=>db.query('select kivelle_reconcile_subscription_credits($1,$2,$3,30,$4)',[v,cap,paid,new Date(at.getTime()+days*86400000).toISOString()]);
await lifecycleAt(1000,true);assert.equal((await q('select subscription_balance s from together_credit_accounts where user_id=$1',[v])).s,1000);
await lifecycleAt(2400,true);assert.equal((await q('select subscription_balance s from together_credit_accounts where user_id=$1',[v])).s,1200);
await lifecycleAt(0,false);await lifecycleAt(0,false,29);assert.equal((await q('select subscription_balance s from together_credit_accounts where user_id=$1',[v])).s,1200);
await lifecycleAt(0,false,31);assert.deepEqual(await q('select permanent_balance p,subscription_balance s from together_credit_accounts where user_id=$1',[v]),{p:17,s:0});
await db.exec('set role authenticated');await assert.rejects(()=>spend(1,'forged'),/permission denied/);
console.log('PASS: rollover/cap, no replay refill, upgrades, stale grants, spend retry, refund once per charge, late refunds preserved, expiry spending, insufficient funds, ledger and permissions');
}finally{await db.close();}

