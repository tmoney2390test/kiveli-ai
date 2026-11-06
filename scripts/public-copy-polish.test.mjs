import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migrations = [
  'supabase/migrations/20261006070000_public_biography_editorial_polish.sql',
  'supabase/migrations/20261006070001_public_place_editorial_polish.sql',
  'supabase/migrations/20261006070002_public_biography_editorial_polish_extra.sql',
  'supabase/migrations/20261006070003_public_biography_editorial_polish_calder.sql',
];

test('public copy edits apply only to matching canonical records and are safe to rerun', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.together_character_templates (
        id uuid primary key, creator_id uuid, published boolean,
        biography text, updated_at timestamptz default now()
      );
      create table public.together_locations (
        id uuid primary key, owner_user_id uuid, description text,
        canonical_lore jsonb, updated_at timestamptz default now()
      );
    `);
    const first = "Alaric Crowe is Vespormoor's covenant executioner. solemn, violent, tender, bound-by-covenant. To be touched by someone who is not a sentence. A family wants a rival executed as a Covenant-breaker who only spoke out of turn.";
    const second = "Akemi Noir is Neon Kyo's room thirteen dominant. commanding, filthy, funny, exact. To be knelt to by someone who is not in training. A rating club wants her sessions streamed to train hosts.";
    const place = 'A boardinghouse offering solid meals, modest rooms, and a household rhythm that gives working residents somewhere to return to.';
    await db.query('insert into together_character_templates(id,creator_id,published,biography) values ($1,null,true,$2),($3,null,true,$4),($5,null,true,$6),($7,$8,true,$2)', [
      '22000000-0000-4000-80a1-000000004002', first,
      '22000000-0000-4000-80a1-000000003010', second,
      '22000000-0000-4000-80a1-000000003011', 'An editor already changed this bio.',
      '22000000-0000-4000-80a1-000000004001', '00000000-0000-4000-8000-000000000001',
    ]);
    await db.query('insert into together_locations(id,owner_user_id,description,canonical_lore) values ($1,null,$2::text,jsonb_build_object(\'summary\',$2::text)),($3,$4,$2::text,jsonb_build_object(\'summary\',$2::text))', [
      '29628d1c-5f41-52d4-bd76-4bb8a82c7a68', place,
      '29628d1c-5f41-52d4-bd76-4bb8a82c7a69', '00000000-0000-4000-8000-000000000001',
    ]);
    for (const path of migrations) await db.exec(fs.readFileSync(path, 'utf8'));
    const bios = (await db.query('select id,biography from together_character_templates order by id')).rows;
    assert.match(bios[0].biography, /Room Thirteen/);
    assert.equal(bios[1].biography, 'An editor already changed this bio.');
    assert.equal(bios[2].biography, first);
    assert.match(bios[3].biography, /Covenant sentences/);
    const locations = (await db.query('select owner_user_id,description,canonical_lore->>\'summary\' as summary from together_locations order by id')).rows;
    assert.equal(locations[0].description, locations[0].summary);
    assert.match(locations[0].description, /Boatmen rent small rooms/);
    assert.equal(locations[1].description, place);
    for (const path of migrations) await db.exec(fs.readFileSync(path, 'utf8'));
    assert.deepEqual((await db.query('select id,biography from together_character_templates order by id')).rows, bios);
  } finally {
    await db.close();
  }
});
