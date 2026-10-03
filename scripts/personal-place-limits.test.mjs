import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261003052104_tiered_personal_place_limits.sql', import.meta.url)), 'utf8');
const userId = '00000000-0000-4000-8000-000000000165';

test('private place trigger enforces Free, Plus and Max limits without deleting places on downgrade', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.together_entitlements(user_id uuid primary key,tier text not null,expires_at timestamptz);
      create table public.together_locations(id uuid primary key,owner_user_id uuid,archived_at timestamptz,name text);`);
    await db.exec(migration);
    await db.exec(`create trigger together_locations_private_limit before insert or update on public.together_locations
      for each row execute function public.kivelle_limit_private_places();`);
    await db.query('insert into public.together_entitlements(user_id,tier) values($1,$2)', [userId, 'free']);

    const add = async (n) => db.query('insert into public.together_locations(id,owner_user_id,name) values($1,$2,$3)',
      [`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, userId, `Place ${n}`]);
    const rejected = async (n) => assert.rejects(add(n), /Private place limit reached/);
    for (let n = 1; n <= 3; n++) await add(n);
    await rejected(4);

    await db.query("update public.together_entitlements set tier='kivelle_plus' where user_id=$1", [userId]);
    for (let n = 4; n <= 20; n++) await add(n);
    await rejected(21);

    await db.query("update public.together_entitlements set tier='kivelle_max' where user_id=$1", [userId]);
    for (let n = 21; n <= 50; n++) await add(n);
    await rejected(51);

    await db.query("update public.together_entitlements set tier='free' where user_id=$1", [userId]);
    await db.query("update public.together_locations set name='Still mine' where owner_user_id=$1 and name='Place 1'", [userId]);
    const active = await db.query('select count(*)::integer as count from public.together_locations where owner_user_id=$1 and archived_at is null', [userId]);
    assert.equal(active.rows[0].count, 50);
    await rejected(51);

    await db.query("update public.together_locations set archived_at=now() where owner_user_id=$1 and name='Still mine'", [userId]);
    await assert.rejects(db.query("update public.together_locations set archived_at=null where owner_user_id=$1 and name='Still mine'", [userId]), /Private place limit reached/);
    await db.query("update public.together_entitlements set tier='kivelle_max',expires_at=now()-interval '1 minute' where user_id=$1", [userId]);
    await rejected(51);
  } finally {
    await db.close();
  }
});
