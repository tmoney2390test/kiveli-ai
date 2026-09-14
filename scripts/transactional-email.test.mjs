import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('email events are atomic, deduplicated, private and quota limited', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
      create table together_support_tickets(id uuid primary key,user_id uuid,ticket_number bigint);
      create table together_support_replies(id uuid primary key,ticket_id uuid,sender text);
      create table together_billing_subscriptions(id uuid primary key,user_id uuid,provider text,status text,plan_key text,billing_interval text,metadata jsonb);
      insert into auth.users values('00000000-0000-4000-8000-000000000001');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260914213704_transactional_email_outbox.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into together_support_tickets values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',42);
      insert into together_support_replies values(gen_random_uuid(),'00000000-0000-4000-8000-000000000002','support');
      insert into together_support_replies values(gen_random_uuid(),'00000000-0000-4000-8000-000000000002','customer');
      insert into together_billing_subscriptions values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','revenuecat','active','kivelle_plus','monthly','{"sandbox":true}');`);
    assert.equal((await db.query('select * from together_email_outbox')).rows.length, 4);
    await db.exec(`insert into together_billing_subscriptions values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','revenuecat','active','kivelle_plus','monthly','{"sandbox":false}');
      update together_billing_subscriptions set billing_interval='annual' where metadata->>'sandbox'='false';`);
    assert.equal((await db.query("select * from together_email_outbox where kind='membership_welcome'")).rows.length, 1);
    assert.equal((await db.query("select has_table_privilege('authenticated','together_email_outbox','select') allowed")).rows[0].allowed, false);
    const claimed = (await db.query('select * from kivelle_claim_transactional_email()')).rows;
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].attempts, 1);
    await db.exec('insert into together_email_attempts(attempted_at) select now() from generate_series(1,89)');
    assert.equal((await db.query('select * from kivelle_claim_transactional_email()')).rows.length, 0);
    await db.exec('delete from together_email_attempts');
    await db.query("update together_email_outbox set first_attempt_at=now()-interval '25 hours',next_attempt_at=now()-interval '1 hour' where id=$1", [claimed[0].id]);
    await db.query('select * from kivelle_claim_transactional_email()');
    assert.equal((await db.query('select status from together_email_outbox where id=$1', [claimed[0].id])).rows[0].status, 'failed');
  } finally { await db.close(); }
});
