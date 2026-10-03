import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'scripts/world-pulse-seed.mjs');

function seed(world, output, major = true) {
  return spawnSync(process.execPath, [script, ...(major ? ['--major'] : []), '--world', world, output], {
    cwd: root, encoding: 'utf8', maxBuffer: 2_000_000,
  });
}

test('major seed requires a complete character-level pack and includes Juniper City', () => {
  const directory = mkdtempSync(join(tmpdir(), 'world-pulse-seed-guard-'));
  try {
    const contentRoot = resolve(root, 'content/world-pulse');
    const incompleteWorld = readdirSync(resolve(contentRoot, 'reference'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -5))
      .find((world) => world !== 'juniper-city' && !existsSync(resolve(contentRoot, `${world}.json`)));
    if (incompleteWorld) {
      const incomplete = join(directory, `${incompleteWorld}.sql`);
      const result = seed(incompleteWorld, incomplete);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /world-pulse-validate\.mjs failed/);
      assert.equal(existsSync(incomplete), false);
    }

    const juniperOutput = join(directory, 'juniper-city.sql');
    const juniper = seed('juniper-city', juniperOutput);
    assert.equal(juniper.status, 0, juniper.stderr);
    assert.equal(existsSync(juniperOutput), true);
    assert.match(juniper.stdout, /Wrote 15 Pulse templates/);
    assert.match(readFileSync(juniperOutput, 'utf8'), /'pulseTier':'major'|"pulseTier":"major"/);
    assert.doesNotMatch(readFileSync(juniperOutput, 'utf8'), /review-only/);

    const juniperRoutineOutput = join(directory, 'juniper-city-routine.sql');
    const juniperRoutine = seed('juniper-city', juniperRoutineOutput, false);
    assert.equal(juniperRoutine.status, 0, juniperRoutine.stderr);
    assert.equal(existsSync(juniperRoutineOutput), true);
    assert.match(juniperRoutine.stdout, /Wrote 200 Pulse templates/);

    const ready = join(directory, 'eos-meridian.sql');
    const eos = seed('eos-meridian', ready);
    assert.equal(eos.status, 0, eos.stderr);
    assert.equal(existsSync(ready), true);
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('roster replacement is one atomic world-scoped seed and preserves published occurrences', () => {
  const directory = mkdtempSync(join(tmpdir(), 'world-pulse-replacement-'));
  try {
    const output = join(directory, 'eos-replacement.sql');
    const result = spawnSync(process.execPath, [script, '--world', 'eos-meridian', '--replace-roster', output], {
      cwd: root, encoding: 'utf8', maxBuffer: 2_000_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const sql = readFileSync(output, 'utf8');
    assert.match(sql, /begin;[\s\S]*commit;/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /Future Pulse reservation has user engagement/);
    assert.match(sql, /delete from public\.together_world_pulse_occurrences where world_id = v_world and slot between 0 and 7 and status = 'reserved' and occurred_at > now\(\)/);
    assert.doesNotMatch(sql, /delete from public\.together_world_pulse_occurrences[^;]*slot = 8/);
    assert.doesNotMatch(sql, /delete from public\.together_world_pulse_occurrences[^;]*status = 'published'/);
    assert.match(sql, /Replacement Pulse catalog failed database readiness check/);
    assert.match(sql, /kivelle_world_pulse_reserve_world\(v_world/);

    const batched = spawnSync(process.execPath, [script, '--world', 'eos-meridian', '--replace-roster', '--batch-size', '50', join(directory, 'batched.sql')], {
      cwd: root, encoding: 'utf8', maxBuffer: 2_000_000,
    });
    assert.notEqual(batched.status, 0);
    assert.match(batched.stderr, /single atomic seed file/);
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`));
    rmSync(directory, { recursive: true, force: true });
  }
});
