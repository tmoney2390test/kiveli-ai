import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { characters } from './eos-meridian-content.mjs';
import { publicBiographies } from './eos-meridian-public-biographies.mjs';
import { migrationPath, renderPublicBiographyMigration } from './build-eos-public-biographies.mjs';

const summaryCleanupPath = 'supabase/migrations/20260927010251_eos_public_summary_cleanup.sql';

test('every Eos public biography describes the resident without repeating their plot hook', () => {
  assert.equal(characters.length, 47);
  assert.deepEqual(Object.keys(publicBiographies).sort(), characters.map(({ slug }) => slug).sort());
  assert.equal(new Set(characters.map(({ biography }) => biography)).size, characters.length);
  for (const character of characters) {
    assert.ok(character.biography.length >= 100 && character.biography.length <= 260, character.slug);
    assert.ok(!character.biography.includes(character.storyHook), character.slug);
    assert.equal(character.characterBible.storyHook, character.storyHook);
  }
  assert.equal(readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n'), renderPublicBiographyMigration());
});

test('migration refreshes matching public copy and leaves custom biographies and story hooks intact', async () => {
  const db = new PGlite();
  try {
    await db.exec('create schema if not exists public; create table public.together_character_templates(id uuid primary key,creator_id uuid,biography text,discovery_metadata jsonb,updated_at timestamptz);');
    for (const character of characters) {
      const biography = character.slug === 'liora-haddad' ? 'An editor-approved introduction to Liora.' : `Old introduction. ${character.storyHook}`;
      const summary = character.slug === 'sora-bell'
        ? `A raw seed summary. ${character.storyHook}`
        : character.slug === 'cassian-vale'
          ? 'A separate editor-approved discovery summary.'
          : biography;
      await db.query('insert into public.together_character_templates(id,biography,discovery_metadata) values($1,$2,$3)', [character.templateId, biography, { residentWorldSlug: 'eos-meridian', storyHook: character.storyHook, summary }]);
    }
    await db.exec(renderPublicBiographyMigration());
    await db.exec(readFileSync(summaryCleanupPath, 'utf8'));
    const { rows } = await db.query('select id,biography,discovery_metadata from public.together_character_templates');
    for (const character of characters) {
      const row = rows.find((entry) => entry.id === character.templateId);
      assert.ok(row, character.slug);
      assert.equal(row.discovery_metadata.storyHook, character.storyHook);
      assert.equal(row.biography, character.slug === 'liora-haddad' ? 'An editor-approved introduction to Liora.' : character.biography);
      assert.equal(row.discovery_metadata.summary, character.slug === 'cassian-vale' ? 'A separate editor-approved discovery summary.' : row.biography);
    }
    await db.exec(renderPublicBiographyMigration());
    await db.exec(readFileSync(summaryCleanupPath, 'utf8'));
    assert.equal((await db.query("select count(*)::int as n from public.together_character_templates where biography like 'Old introduction.%'")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
