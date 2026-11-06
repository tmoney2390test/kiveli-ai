import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

const root = resolve('supabase/functions');
const target = resolve(root, '_shared/together-schedule.ts');
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await walk(join(dir, entry.name));
    else if (entry.name.endsWith('.ts')) files.push(join(dir, entry.name));
  }
}
await walk(root);
const dependencies = new Map();
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const refs = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .filter(ref => ref.startsWith('.'))
    .map(ref => resolve(dirname(file), extname(ref) ? ref : `${ref}.ts`));
  dependencies.set(file, refs);
}
const pathToTarget = (file, visited = new Set()) => {
  if (file === target) return [file];
  if (visited.has(file)) return null;
  visited.add(file);
  for (const dep of dependencies.get(file) ?? []) {
    const path = pathToTarget(dep, new Set(visited));
    if (path) return [file, ...path];
  }
  return null;
};
const consumers = files.filter(file => file.endsWith(`${join('index.ts')}`) &&
  dirname(file) !== root && pathToTarget(file)).map(file => ({
    name: dirname(file).split(/[\\/]/).at(-1),
    via: pathToTarget(file).slice(1, -1).map(dep => dep.slice(root.length + 1).replaceAll('\\', '/')),
  })).sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify(consumers, null, 2));
