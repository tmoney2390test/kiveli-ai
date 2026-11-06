import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const source = JSON.parse(await readFile('content/schedule-repairs/adult-cast-2026.json', 'utf8'));
const worlds = [...new Set(source.characters.map(x => x.world))];
const migrationNames = await readdir('supabase/migrations');
const castMigrations = await Promise.all(worlds.map(async world => {
  const suffix = `_${world.replaceAll('-', '_')}_routine_variation.sql`;
  const matches = migrationNames.filter(name => name.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected one migration for ${world}`);
  return readFile(`supabase/migrations/${matches[0]}`, 'utf8');
}));
const eosName = migrationNames.find(name => name.endsWith('_eos_evening_routine_realism.sql'));
assert.ok(eosName);
const eosMigration = await readFile(`supabase/migrations/${eosName}`, 'utf8');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

test('the authored routine migrations preserve distinct weekly slots and split Eos evenings', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table together_worlds(id text primary key,slug text,published boolean);
      create table together_character_templates(id text primary key,slug text,published boolean,current_published_version integer);
      create table together_character_versions(id text primary key,character_template_id text,version integer);
      create table together_character_world_presence(character_version_id text,world_id text);
      create table together_locations(id text primary key,world_id text,slug text,owner_user_id text,name text,hours jsonb);
      create table together_schedule_templates(id integer generated always as identity primary key,
        character_version_id text,day_of_week smallint,start_minute smallint,end_minute smallint,
        location_id text,activity text,availability text,energy_delta smallint,metadata jsonb,
        week_index smallint generated always as (coalesce((metadata->>'weekIndex')::smallint,0)) stored);
      create unique index together_schedule_rotation_slot on together_schedule_templates
        (character_version_id,day_of_week,start_minute,week_index);
      create table together_character_instances(id text primary key,character_version_id text);
      create table together_character_schedule_events(id text,character_instance_id text,source text,ends_at timestamptz);
    `);
    await db.exec(`insert into together_worlds values ${worlds.map(x => `(${quote(x)},${quote(x)},true)`).join(',')};`);
    const people = [...source.characters, ...['hana-petrov', 'liora-haddad'].map(slug => ({ slug, world: 'eos-meridian' }))];
    await db.exec(`insert into together_character_templates values ${people.map(x => `(${quote(x.slug)},${quote(x.slug)},true,1)`).join(',')};`);
    await db.exec(`insert into together_character_versions values ${people.map(x => `(${quote(x.slug)},${quote(x.slug)},1)`).join(',')};`);
    await db.exec(`insert into together_character_world_presence values ${people.map(x => `(${quote(x.slug)},${quote(x.world)})`).join(',')};`);
    await db.exec(`insert into together_locations values
      ('test-venue','eos-meridian','test-venue',null,'Test Venue','{"open":"06:00","close":"23:00"}'),
      ('foundry-baths','eos-meridian','foundry-baths',null,'Foundry Baths','{"open":"06:00","close":"01:00"}'),
      ('solace-reservoir','eos-meridian','solace-reservoir',null,'Solace Reservoir','{"open":"06:00","close":"22:00"}');`);
    await db.exec(`insert into together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,metadata)
      values ${source.characters.flatMap(x => [
        `(${quote(x.slug)},0,420,540,null,'Having a meal and preparing for the day','available',0,'{"source":"adult_cast_schedule_v2","activityKey":"home"}')`,
        `(${quote(x.slug)},0,600,690,'test-venue','Having a meal','available',0,'{"source":"adult_cast_schedule_v2","activityKey":"leisure"}')`,
      ]).join(',')};`);
    await db.exec(`insert into together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,metadata)
      values (${quote(source.characters[0].slug)},1,480,1080,null,'Cooking and taking care of home','available',0,
        '{"source":"adult_cast_schedule_v2","activityKey":"home"}');`);
    await db.exec(`insert into together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,metadata)
      values ${['hana-petrov', 'liora-haddad'].flatMap(slug => [0,2,3,4,6].map(day =>
        `(${quote(slug)},${day},990,1440,null,${quote(slug === 'hana-petrov' ? 'Personal time: swimming' : 'Personal time: picnics')},'available',0,'{"source":"eos_editorial_v3"}')`
      )).join(',')},
      ('liora-haddad',1,840,1080,null,'Tease Hana over a shared childhood story.','available',0,'{"source":"eos_editorial_v3"}');`);

    for (const migration of castMigrations) await db.exec(migration);
    await db.exec(eosMigration);
    const { rows: adult } = await db.query(`select count(*) filter (where metadata->>'weekIndex'='0') as outings,
      count(*) filter (where metadata->>'weekIndex'='1') as alternate_homes,
      count(*) filter (where metadata->>'activityKey'='home' and jsonb_array_length(metadata->'activityVariants')>=3) as varied_homes
      from together_schedule_templates where character_version_id in
        (select id from together_character_versions where id not in ('hana-petrov','liora-haddad'))`);
    assert.equal(Number(adult[0].outings), 180);
    assert.equal(Number(adult[0].alternate_homes), 180);
    assert.ok(Number(adult[0].varied_homes) >= 180);
    const { rows: longHome } = await db.query(`select start_minute,end_minute from together_schedule_templates
      where character_version_id = ${quote(source.characters[0].slug)} and day_of_week = 1
      order by start_minute`);
    assert.equal(longHome[0].start_minute, 480);
    assert.equal(longHome.at(-1).end_minute, 1080);
    assert.ok(longHome.every(row => row.end_minute - row.start_minute <= 240));
    for (let i = 1; i < longHome.length; i++) assert.equal(longHome[i - 1].end_minute, longHome[i].start_minute);
    const { rows: eos } = await db.query(`select character_version_id,day_of_week,start_minute,end_minute,
      activity,location_id from together_schedule_templates
      where character_version_id in ('hana-petrov','liora-haddad') order by 1,2,3`);
    assert.equal(eos.filter(row => row.location_id === 'foundry-baths').length, 1);
    assert.equal(eos.filter(row => row.location_id === 'solace-reservoir').length, 1);
    assert.equal(eos.filter(row => /Personal time: swimming|Personal time: picnics|Tease Hana/.test(row.activity)).length, 0);
    assert.ok(eos.every(row => row.end_minute - row.start_minute <= 180));
    for (const slug of ['hana-petrov', 'liora-haddad']) {
      for (const day of [0,2,3,4,6]) {
        const blocks = eos.filter(row => row.character_version_id === slug && row.day_of_week === day);
        assert.equal(blocks[0].start_minute, 990);
        assert.equal(blocks.at(-1).end_minute, 1440);
        for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i - 1].end_minute, blocks[i].start_minute);
      }
    }
  } finally {
    await db.close();
  }
});
