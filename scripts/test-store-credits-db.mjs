import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create table together_credit_accounts(user_id uuid primary key,permanent_balance integer default 0,subscription_balance integer default 0,updated_at timestamptz);
    create table together_credit_ledger(id uuid primary key default gen_random_uuid(),user_id uuid,event_type text,permanent_delta integer,subscription_delta integer default 0,idempotency_key text,reference_type text,reference_id text,metadata jsonb,unique(user_id,idempotency_key));`);
  const old=readFileSync(new URL('../supabase/migrations/202608150004_kivelle_intelligence_subscriptions.sql',import.meta.url),'utf8');
  await db.exec(old.slice(old.indexOf('create or replace function public.kivelle_grant_permanent_credits'),old.indexOf('create or replace function public.kivelle_grant_subscription_credits')));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260914191828_native_consumable_credits.sql',import.meta.url),'utf8'));
  const owner=crypto.randomUUID(),other=crypto.randomUUID();
  await db.query('insert into auth.users values ($1),($2)',[owner,other]);
  const apply=(id,refund=false,user=owner)=>db.query("select kivelle_apply_store_credit_purchase($1,'APP_STORE','SANDBOX',$2,'app.kivelli.credits.100',100,$3)",[user,id,refund]);
  const balance=async()=>Number((await db.query('select permanent_balance from together_credit_accounts where user_id=$1',[owner])).rows[0]?.permanent_balance??0);
  await Promise.all([apply('one'),apply('one')]);assert.equal(await balance(),100);
  await assert.rejects(()=>apply('one',false,other),/ownership/);
  await apply('one',true);await apply('one',true);await apply('one');assert.equal(await balance(),0);
  await apply('early-refund',true);await apply('early-refund');assert.equal(await balance(),0);
  await apply('spent');await db.query('update together_credit_accounts set permanent_balance=25 where user_id=$1',[owner]);
  await apply('spent',true);assert.equal(await balance(),0);
  assert.equal((await db.query("select unrecovered_credits from together_store_credit_purchases where transaction_id='spent'")).rows[0].unrecovered_credits,75);
  await db.query('delete from auth.users where id=$1',[owner]);
  await assert.rejects(()=>apply('one',false,other),/ownership/);
  await db.exec('set role authenticated');
  await assert.rejects(()=>apply('forged',false,other),/permission denied/);
  console.log('Store credit SQL checks passed: duplicate delivery, ownership, refunds, out-of-order events, spent credits, deletion tombstones, client access.');
}finally{await db.close();}
