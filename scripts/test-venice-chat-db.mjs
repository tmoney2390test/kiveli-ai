import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table together_ai_usage_events(provider text check(provider in ('openai','xai','gemini','deterministic')));`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260910234911_kivelle_venice_owner_chat.sql', import.meta.url), 'utf8'));
  for (const provider of ['openai', 'xai', 'gemini', 'venice', 'deterministic']) {
    await db.query('insert into together_ai_usage_events values($1)', [provider]);
  }
  await assert.rejects(db.query("insert into together_ai_usage_events values('unknown')"));
  assert.equal((await db.query('select enabled from kivelle_dialogue_experiments')).rows[0].enabled, false);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='kivelle_dialogue_experiments'")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      assert.equal((await db.query("select has_table_privilege($1,'kivelle_dialogue_experiments',$2) as allowed", [role, privilege])).rows[0].allowed, false);
    }
  }
  assert.equal((await db.query("select has_table_privilege('service_role','kivelle_dialogue_experiments','update') as allowed")).rows[0].allowed, true);
  console.log('PASS: Venice telemetry compatibility, disabled rollout default, RLS and service-only configuration.');
} finally { await db.close(); }
