import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261001174331_analytics_explicit_opt_in.sql', import.meta.url), 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';

test('analytics migration requires a recorded opt-in at the database boundary', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.together_profiles(user_id uuid primary key, privacy_settings jsonb not null default '{"personalization":true,"analytics":true}'::jsonb, updated_at timestamptz default now());
      create table public.together_analytics_events(user_id uuid, event_name text, properties jsonb default '{}'::jsonb);
      create table public.together_client_performance_events(user_id uuid, surface text);
      insert into public.together_profiles(user_id) values('${userId}');
      insert into public.together_analytics_events(user_id,event_name) values('${userId}','old_event');
      insert into public.together_client_performance_events(user_id,surface) values('${userId}','old_surface');
    `);
    await db.exec(migration);
    assert.equal((await db.query('select count(*)::int as n from public.together_analytics_events')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.together_client_performance_events')).rows[0].n, 0);
    assert.equal((await db.query('select privacy_settings->>\'analytics\' as enabled from public.together_profiles')).rows[0].enabled, 'false');
    assert.equal((await db.query('select public.kivelle_track_event($1,$2) as tracked', [userId, 'legacy_event'])).rows[0].tracked, false);

    await db.exec(`insert into public.together_analytics_events(user_id,event_name) values('${userId}','denied');`);
    await db.exec(`insert into public.together_client_performance_events(user_id,surface) values('${userId}','denied');`);
    assert.equal((await db.query('select count(*)::int as n from public.together_analytics_events')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.together_client_performance_events')).rows[0].n, 0);

    await db.query('update public.together_profiles set privacy_settings=$1 where user_id=$2', [
      { analytics: true, analyticsConsent: { decision: 'accepted', version: 'product-analytics-v1', recordedAt: new Date().toISOString() } }, userId,
    ]);
    await db.exec(`insert into public.together_analytics_events(user_id,event_name) values('${userId}','accepted');`);
    await db.exec(`insert into public.together_client_performance_events(user_id,surface) values('${userId}','accepted');`);
    assert.equal((await db.query('select count(*)::int as n from public.together_analytics_events')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.together_client_performance_events')).rows[0].n, 1);
    assert.equal((await db.query('select public.kivelle_track_event($1,$2) as tracked', [userId, 'consented_event'])).rows[0].tracked, true);

    await db.query("update public.together_profiles set privacy_settings=jsonb_set(privacy_settings,'{analytics}','false'::jsonb) where user_id=$1", [userId]);
    await db.exec(`insert into public.together_analytics_events(user_id,event_name) values('${userId}','withdrawn');`);
    assert.equal((await db.query('select count(*)::int as n from public.together_analytics_events')).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
