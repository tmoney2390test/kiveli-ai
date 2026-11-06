import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Run the shipped SQL and trigger against an isolated database, never production.
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions;
    create table together_entitlements(user_id uuid primary key, tier text, expires_at timestamptz);
    create table together_billing_subscriptions(user_id uuid, provider text, plan_key text, status text,
      current_period_end timestamptz, access_ends_at timestamptz, updated_at timestamptz default now());
    create table together_conversations(id uuid primary key default gen_random_uuid(), user_id uuid,
      kind text, archived_at timestamptz, user_archived_at timestamptz);
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261026131153_use_active_billing_for_chat_limit.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const original = await readFile(new URL('../supabase/migrations/202609010009_kivelle_active_conversation_limits.sql', import.meta.url), 'utf8');
  const trigger = original.slice(original.indexOf('create or replace function public.kivelle_enforce_active_conversation_limit()'), original.indexOf('create or replace function public.kivelle_start_conversation('));
  assert.ok(trigger.includes('create trigger together_conversations_active_limit'));
  await db.exec(trigger);
  const user = crypto.randomUUID();
  const limit = async (id = user) => (await db.query('select kivelle_active_conversation_limit($1) as value', [id])).rows[0].value;
  const subscribe = async (plan = 'kivelle_max', status = 'active', end = "now()+interval '1 month'", provider = 'stripe') => {
    // SQL expressions here are fixed test fixtures, never user input.
    await db.query(`insert into together_billing_subscriptions values($1,$2,$3,$4,${end},${end},now())`, [user, provider, plan, status]);
  };
  assert.equal(await limit(), 5);
  await db.query("insert into together_entitlements values($1,'kivelle_max',now()-interval '1 month')", [user]);
  assert.equal(await limit(), 5);
  await subscribe();
  assert.equal(await limit(), 50, 'Renewed billing must override the expired cached entitlement');
  const addChat = async (kind = 'direct', archived = false) => db.query(`insert into together_conversations(user_id,kind,archived_at) values($1,$2,${archived ? 'now()' : 'null'}) returning id`, [user, kind]);
  for (let n = 0; n < 50; n++) await addChat(n % 3 === 0 ? 'group' : n % 3 === 1 ? 'direct' : 'first_meeting');
  await assert.rejects(() => addChat(), /ACTIVE_CONVERSATION_LIMIT_REACHED:50/);
  await addChat('direct', true);
  const first = (await db.query('select id from together_conversations where archived_at is null limit 1')).rows[0].id;
  await db.query('update together_conversations set user_archived_at=now() where id=$1', [first]);
  await addChat();
  await assert.rejects(() => db.query('update together_conversations set user_archived_at=null where id=$1', [first]), /ACTIVE_CONVERSATION_LIMIT_REACHED:50/);
  assert.equal(await limit(crypto.randomUUID()), 5, 'Another account cannot inherit the subscriber limit');

  for (const [status, end, expected] of [
    ['active', 'now()', 5], ['trialing', 'now()', 5], ['past_due', 'now()', 5],
    ['past_due', "now()+interval '1 day'", 50], ['past_due', 'null', 5],
    ['active', 'null', 50], ['trialing', 'null', 50],
    ['canceled', "now()+interval '1 month'", 5], ['unpaid', "now()+interval '1 month'", 5],
    ['incomplete', "now()+interval '1 month'", 5],
  ]) {
    await db.exec('delete from together_billing_subscriptions');
    await subscribe('kivelle_max', status, end);
    assert.equal(await limit(), expected, `${status}, ${end}`);
  }
  await db.exec('delete from together_billing_subscriptions');
  await db.query("update together_entitlements set tier='kivelle_plus',expires_at=now()-interval '1 month' where user_id=$1", [user]);
  await subscribe('kivelle_plus', 'active', "now()+interval '1 year'", 'revenuecat');
  assert.equal(await limit(), 20, 'Plus renewal must also override an expired same-tier entitlement');
  await subscribe();
  assert.equal(await limit(), 50, 'Overlapping store subscriptions choose the higher active plan');
  await db.exec("update together_billing_subscriptions set status='canceled' where provider='stripe'");
  assert.equal(await limit(), 20, 'Canceled Max must not hide active Plus');
  await db.exec('delete from together_billing_subscriptions');
  await db.query("update together_entitlements set tier='kivelle_max',expires_at=now()+interval '1 year' where user_id=$1", [user]);
  assert.equal(await limit(), 50, 'Legacy valid grants remain valid');
  await subscribe('kivelle_max', 'canceled');
  assert.equal(await limit(), 5, 'Provider revocation supersedes legacy access');
  for (const [role, expected] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
    assert.equal((await db.query("select has_function_privilege($1,'kivelle_active_conversation_limit(uuid)','execute') as allowed", [role])).rows[0].allowed, expected);
  }
  console.log('PASS: renewal, plan overlap, expiry/grace, legacy grants, revocation, 50-chat enforcement, archive/restore, account isolation, and service-only access.');
} finally { await db.close(); }
