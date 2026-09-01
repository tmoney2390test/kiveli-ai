import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

test('Expo Router serializes browser history from the current navigation root state', () => {
  const source = readFileSync(
    resolve('apps/together/node_modules/expo-router/build/fork/useLinking.js'),
    'utf8',
  );
  assert.equal(source.match(/const state = rootState;/g)?.length, 2);
  assert.doesNotMatch(source, /const state = store\.state;/);
});
