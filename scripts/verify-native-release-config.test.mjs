import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeBuildProfiles, validateNativeReleaseEnvironment } from './verify-native-release-config.mjs';

test('empty review environments fail before building', () => {
  assert.ok(validateNativeReleaseEnvironment({}, 'ios').some((message) => message.includes('IOS_API_KEY')));
  assert.deepEqual(validateNativeBuildProfiles({build:{releaseCandidate:{distribution:'internal'}}}), ['releaseCandidate must explicitly select an EAS environment']);
});
test('preflight rejects public secrets without printing their values', () => {
  const errors = validateNativeReleaseEnvironment({EXPO_PUBLIC_SERVICE_ROLE:'do-not-print'}, 'ios');
  assert.ok(errors.some((message) => message.includes('must not be exposed')));
  assert.ok(errors.every((message) => !message.includes('do-not-print')));
});
