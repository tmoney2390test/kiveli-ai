import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);
create table together_profiles(user_id uuid primary key,private_text_preference text,ai_data_consent_decision text,ai_data_consent_version text,ai_data_consent_recorded_at timestamptz);
create table together_ai_data_consents(user_id uuid,purpose text,disclosure_version text,decision text,decided_at timestamptz default now(),updated_at timestamptz default now(),primary key(user_id,purpose));
create table together_ai_data_consent_events(user_id uuid,purpose text,disclosure_version text,decision text,source text);
create table together_account_deletion_markers(user_id uuid primary key);
create table together_account_deletion_jobs(user_id uuid,apple_revocation_status text);
create table together_character_templates(creator_id uuid,visibility text,lifecycle_status text,updated_at timestamptz);
create table together_billing_subscriptions(user_id uuid);
create table together_credit_ledger(user_id uuid);
create table together_entitlements(user_id uuid);
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260910181917_apple_review_recovery.sql',import.meta.url),'utf8'));
const a=crypto.randomUUID(),b=crypto.randomUUID(),lease=crypto.randomUUID();
await db.query('insert into auth.users values($1),($2)',[a,b]);
await db.query("insert into together_profiles(user_id,private_text_preference) values($1,'mature'),($2,'standard')",[a,b]);
await db.query("select kivelle_record_ai_consent($1,'accepted','2026-09-06','privacy')",[a]);
await db.query("select kivelle_record_ai_consent($1,'withdrawn','2026-09-06','privacy')",[a]);
assert.equal((await db.query('select decision from together_ai_data_consents where user_id=$1',[a])).rows[0].decision,'withdrawn');
assert.equal((await db.query('select private_text_preference from together_profiles where user_id=$1',[a])).rows[0].private_text_preference,'mature');
assert.equal((await db.query('select count(*)::int as n from together_ai_data_consent_events where user_id=$1',[a])).rows[0].n,2);
assert.equal((await db.query('select count(*)::int as n from together_ai_data_consents where user_id=$1',[b])).rows[0].n,0);
await assert.rejects(()=>db.query("select kivelle_record_ai_consent($1,'accepted','obsolete','privacy')",[a]));
await db.query("select kivelle_store_apple_credential($1,'app.test','subject','encrypted-fixture')",[a]);
await db.query("insert into together_account_deletion_jobs values($1,'unavailable')",[a]);
await db.query('insert into together_account_deletion_markers values($1)',[a]);
assert.equal((await db.query('select apple_revocation_status from together_account_deletion_jobs where user_id=$1',[a])).rows[0].apple_revocation_status,'pending');
await assert.rejects(()=>db.query("select kivelle_store_apple_credential($1,'app.test','subject','later')",[a]));
await assert.rejects(()=>db.query("select kivelle_record_ai_consent($1,'accepted','2026-09-06','privacy')",[a]));
await db.query('select kivelle_delete_application_user_data($1)',[a]);
assert.equal((await db.query('select count(*)::int as n from together_apple_credentials where user_id=$1',[a])).rows[0].n,1,'shared Auth cleanup retains credential');
assert.equal((await db.query('select count(*)::int as n from together_profiles where user_id=$1',[b])).rows[0].n,1,'other account untouched');
for(const table of ['together_billing_subscriptions','together_credit_ledger','together_entitlements']){
  await assert.rejects(()=>db.query('insert into '+table+' values($1)',[a]));
}
await db.query('delete from auth.users where id=$1',[a]);
const claims=(await db.query('select * from kivelle_claim_apple_revocations(now())')).rows;
assert.equal(claims.length,1);assert.equal(claims[0].user_id,a);
assert.equal((await db.query('select * from kivelle_claim_apple_revocations(now())')).rows.length,0);
await db.query("update together_apple_credentials set lease_expires_at=now()-interval '1 second' where user_id=$1",[a]);
assert.equal((await db.query('select * from kivelle_claim_apple_revocations(now())')).rows[0].attempt_count,2);
assert.equal((await db.query('select kivelle_claim_billing_reconciliation($1,$2) as ok',[b,lease])).rows[0].ok,true);
assert.equal((await db.query('select kivelle_claim_billing_reconciliation($1,$2) as ok',[b,crypto.randomUUID()])).rows[0].ok,false);
for(const table of ['together_apple_credentials','together_billing_reconciliation_leases']){
  assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT') as ok",[role,table])).rows[0].ok,false);
}
for(const fn of ['kivelle_record_ai_consent(uuid,text,text,text)','kivelle_store_apple_credential(uuid,text,text,text)','kivelle_claim_apple_revocations(timestamptz)','kivelle_claim_billing_reconciliation(uuid,uuid)']){
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,fn])).rows[0].ok,false);
}
console.log('PASS: consent separation and withdrawal, account isolation, deleted-account denial, durable revocation, lease retries, billing serialization, RLS and service-only access.');
}finally{await db.close();}
