import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('place activity migration updates only matching public catalog rows and is idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.together_worlds (id uuid primary key, slug text not null);
      create table public.together_locations (
        id uuid primary key, world_id uuid not null, slug text not null,
        owner_user_id uuid, archived_at timestamptz, possible_activities text[] not null,
        canonical_lore jsonb, updated_at timestamptz
      );
      insert into public.together_worlds values
        ('10000000-0000-4000-8000-000000000014', 'gilded-coast'),
        ('10000000-0000-4000-8000-000000000009', 'neon-kyo');
      insert into public.together_locations values
        ('2e000000-0000-4000-8014-000000000003', '10000000-0000-4000-8000-000000000014', 'customs-house', null, null,
          array['customs inquiry','paperwork','conversation'], '{"activityDescriptions":{"conversation":"Try conversation here with someone who is available."}}', now()),
        ('2e000000-0000-4000-8014-000000000099', '10000000-0000-4000-8000-000000000014', 'customs-house', '99999999-9999-4999-8999-999999999999', null,
          array['customs inquiry','paperwork','conversation'], '{}', now()),
        ('2e000000-0000-4000-8014-000000000098', '10000000-0000-4000-8000-000000000014', 'arrival-steps', null, null,
          array['changed by an editor','conversation'], '{}', now()),
        ('2e000000-0000-4000-8014-000000000097', '10000000-0000-4000-8000-000000000009', 'quiet-hours', null, null,
          array['drinks','conversation','neighborhood gossip','late food'], '{}', now());
    `);
    const migration = await readFile('supabase/migrations/20261008002618_audit_place_activities.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const { rows } = await db.query('select slug, owner_user_id, possible_activities, canonical_lore from public.together_locations order by id');
    const publicCustoms = rows.find((row) => row.slug === 'customs-house' && !row.owner_user_id);
    assert.ok(publicCustoms.possible_activities.includes('Check a cargo seal'));
    assert.equal(publicCustoms.canonical_lore.activityDescriptions['Check a cargo seal'], 'Ask a clerk to verify a public cargo seal at the counter.');
    assert.ok(rows.find((row) => row.slug === 'customs-house' && row.owner_user_id).possible_activities.includes('conversation'));
    assert.deepEqual(rows.find((row) => row.slug === 'arrival-steps').possible_activities, ['changed by an editor', 'conversation']);
    assert.ok(rows.find((row) => row.slug === 'quiet-hours').possible_activities.includes('Find a quiet table'));
    assert.equal(rows.length, 4);
  } finally {
    await db.close();
  }
});
