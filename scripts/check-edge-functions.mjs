import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const functionsRoot = resolve(root, 'supabase/functions');
const entries = readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => resolve(functionsRoot, entry.name, 'index.ts'));

const result = spawnSync('deno', ['check', '--sloppy-imports', '--config', resolve(functionsRoot, 'deno.json'), ...entries], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error('Deno is required for Edge Function typechecking.');
  process.exit(1);
}
process.exit(result.status ?? 1);
