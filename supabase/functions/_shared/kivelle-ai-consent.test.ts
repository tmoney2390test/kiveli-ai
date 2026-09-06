import { assertEquals } from 'jsr:@std/assert@1';
import { aiDataConsentState } from './kivelle-ai-consent.ts';

Deno.test('AI data sharing fails closed when consent is missing or withdrawn', () => {
  assertEquals(aiDataConsentState(null).allowsProviderCalls, false);
  assertEquals(aiDataConsentState({ decision: 'withdrawn' }).allowsProviderCalls, false);
  assertEquals(aiDataConsentState({ decision: 'declined' }).allowsProviderCalls, false);
});

Deno.test('only a recorded accepted decision enables provider calls', () => {
  assertEquals(aiDataConsentState({ decision: 'accepted', disclosure_version: 'v1', decided_at: '2026-09-06T00:00:00Z' }), {
    purpose: 'core_ai_processing_v1',
    disclosureVersion: 'v1',
    decision: 'accepted',
    decidedAt: '2026-09-06T00:00:00Z',
    allowsProviderCalls: true,
  });
});
