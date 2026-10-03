import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectModuleBoundaries } from './check-module-boundaries.mjs';

const root = 'apps/together/src/lib/';
const inspect = (entries) => inspectModuleBoundaries(new Map(entries.map(([path, code]) => [`${root}${path}`, code])));

test('accepts feature APIs using one transport and explicit compatibility exports', () => {
  assert.deepEqual(inspect([
    ['api.ts', "export { load } from './api/catalog';"],
    ['api/catalog.ts', "import { invoke } from './transport'; export const load = () => invoke();"],
    ['api/transport.ts', 'export const invoke = () => Promise.resolve();'],
  ]), []);
});
test('rejects implementation growth in the compatibility facade', () => {
  assert.match(inspect([['api.ts', 'export const load = () => null;']])[0], /only re-export/);
});
test('rejects direct and dynamic imports of the facade from feature APIs', () => {
  for (const code of ["import { invoke } from '../api';", "export const load = () => import('../api');", "import { invoke } from '@/lib/api';"]) {
    assert.match(inspect([['api/feature.ts', code]])[0], /owning API module/);
  }
});
test('rejects API dependencies on application state', () => {
  assert.match(inspect([['api/feature.ts', "import { useTogether } from '../../store/useTogether';"]])[0], /application stores/);
});
test('rejects feature imports of route implementations', () => {
  const errors = inspectModuleBoundaries(new Map([
    ['apps/together/src/features/chat/components/Header.tsx', "import Chat from '../../../../app/chat';"],
  ]));
  assert.match(errors[0], /Expo route implementations/);
});
test('detects runtime cycles while permitting erased type-only relationships', () => {
  const cyclic = [['api/one.ts', "import { two } from './two'; export const one = () => two();"], ['api/two.ts', "import { one } from './one'; export const two = () => one();"]];
  assert.match(inspect(cyclic)[0], /Runtime import cycle/);
  assert.deepEqual(inspect([
    ['api/one.ts', "import type { Two } from './two'; export type One = { two: Two };"],
    ['api/two.ts', "import { type One } from './one'; export type Two = { one: One };"],
  ]), []);
});

test('rejects shared component barrel imports from routes and helpers', () => {
  for (const specifier of ['../src/components', '../src/components/index', '@/components']) {
    const errors = inspectModuleBoundaries(new Map([
      ['apps/together/app/home.tsx', `import { Screen } from '${specifier}';`],
    ]));
    assert.match(errors[0], /owning component module/);
  }
  assert.deepEqual(inspectModuleBoundaries(new Map([
    ['apps/together/app/home.tsx', "import { Screen } from '../src/components/ui'; import type { Props } from '../src/components';"],
  ])), []);
});
