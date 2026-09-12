import { assertEquals } from 'jsr:@std/assert@1';
import { creatorAppearanceRecoveryAction } from './together-media-auxiliary.ts';

Deno.test('creator recovery never resubmits a provider job with a confirmed ID', () => {
  assertEquals(creatorAppearanceRecoveryAction({ status: 'processing', provider_request_id: 'prediction-1' }), 'wait');
  assertEquals(creatorAppearanceRecoveryAction({ status: 'submitting', provider_request_id: 'prediction-1' }), 'resume');
});

Deno.test('creator recovery settles orphaned and ambiguous portraits', () => {
  assertEquals(creatorAppearanceRecoveryAction(null), 'fail_asset');
  assertEquals(creatorAppearanceRecoveryAction({ status: 'submitting', provider_request_id: null }), 'fail_job');
  assertEquals(creatorAppearanceRecoveryAction({ status: 'processing', provider_request_id: null }), 'fail_job');
  assertEquals(creatorAppearanceRecoveryAction({ status: 'failed' }), 'fail_asset');
});

Deno.test('creator recovery restores an already delivered portrait without a new generation', () => {
  assertEquals(creatorAppearanceRecoveryAction({ status: 'completed', output_storage_path: 'user/portrait.jpg' }), 'restore');
});
