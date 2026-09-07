import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiDataConsentState, requireAiDataConsent } from './kivelle-ai-consent.ts';

Deno.test('AI features do not require separate enrollment', () => {
  assertEquals(aiDataConsentState(null).allowsProviderCalls, true);
  assertEquals(aiDataConsentState(null).decision, 'missing');
  assertEquals(aiDataConsentState(null).decidedAt, null);
  assertEquals(aiDataConsentState({ decision: 'withdrawn' }).allowsProviderCalls, true);
  assertEquals(aiDataConsentState({ decision: 'declined' }).allowsProviderCalls, true);
});

Deno.test('historical decisions remain visible without controlling feature access', () => {
  assertEquals(aiDataConsentState({ decision: 'invalid' }).allowsProviderCalls, true);
});

Deno.test('a recorded accepted decision remains supported', () => {
  assertEquals(aiDataConsentState({ decision: 'accepted', disclosure_version: 'v1', decided_at: '2026-09-06T00:00:00Z' }), {
    purpose: 'core_ai_processing_v1',
    disclosureVersion: 'v1',
    decision: 'accepted',
    decidedAt: '2026-09-06T00:00:00Z',
    allowsProviderCalls: true,
  });
});

Deno.test('the compatibility guard does not query consent storage', async () => {
  const db = {
    from: () => {
      throw new Error('consent storage should not be queried');
    },
  } as unknown as SupabaseClient;

  assertEquals(await requireAiDataConsent(db, 'user-id'), {
    purpose: 'core_ai_processing_v1',
    disclosureVersion: null,
    decision: 'missing',
    decidedAt: null,
    allowsProviderCalls: true,
  });
});
