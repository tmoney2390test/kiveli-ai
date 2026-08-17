import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const scanRoots = [
  'packages/together-domain/src',
  'supabase/functions/_shared',
  'supabase/functions/together-bootstrap',
  'supabase/functions/together-companion',
  'supabase/functions/together-date',
  'supabase/functions/together-dialogue',
  'supabase/functions/together-life-dispatch',
  'supabase/functions/together-plan',
  'supabase/functions/together-relationship',
];

// Starter names are valid only in compatibility identifiers and authored content packs.
const allowlist = new Set([
  'supabase/functions/_shared/together-content.ts',
  'supabase/functions/_shared/together.ts',
]);
const forbidden = /\b(?:Maya|Juniper(?: City| CafÃ©)?|Dinner at Juniper)\b|Maya's Apartment/g;

function filesUnder(path) {
  return readdirSync(path).flatMap((name) => {
    const child = resolve(path, name);
    return statSync(child).isDirectory() ? filesUnder(child) : child.endsWith('.ts') ? [child] : [];
  });
}

const failures = [];
for (const scanRoot of scanRoots) {
  for (const file of filesUnder(resolve(root, scanRoot))) {
    const name = relative(root, file).replaceAll('\\', '/');
    // Fixtures and regression tests are allowed to name authored starter
    // content. The guard protects runtime/domain implementation modules.
    if (name.endsWith('.test.ts')) continue;
    if (allowlist.has(name)) continue;
    const source = readFileSync(file, 'utf8');
    const matches = [...source.matchAll(forbidden)];
    if (matches.length) failures.push(`${name}: ${[...new Set(matches.map((match) => match[0]))].join(', ')}`);
  }
}

if (failures.length) {
  console.error('Starter content leaked into generic engine code:\n' + failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('Generic engine is free of starter-content literals.');

