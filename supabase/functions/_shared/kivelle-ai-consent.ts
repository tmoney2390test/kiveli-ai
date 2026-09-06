import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

export const AI_DATA_CONSENT_PURPOSE = 'core_ai_processing_v1';
export const AI_DATA_CONSENT_DISCLOSURE_VERSION = '2026-09-06';

export type AiDataConsentDecision = 'accepted' | 'declined' | 'withdrawn';
export type AiDataConsentState = {
  purpose: string;
  disclosureVersion: string | null;
  decision: AiDataConsentDecision | 'missing';
  decidedAt: string | null;
  allowsProviderCalls: boolean;
};

export function aiDataConsentState(row: Record<string, unknown> | null | undefined): AiDataConsentState {
  const decision = row?.decision === 'accepted' || row?.decision === 'declined' || row?.decision === 'withdrawn'
    ? row.decision
    : 'missing';
  return {
    purpose: AI_DATA_CONSENT_PURPOSE,
    disclosureVersion: typeof row?.disclosure_version === 'string' ? row.disclosure_version : null,
    decision,
    decidedAt: typeof row?.decided_at === 'string' ? row.decided_at : null,
    allowsProviderCalls: decision === 'accepted',
  };
}

export async function loadAiDataConsent(db: SupabaseClient, userId: string): Promise<AiDataConsentState> {
  const { data, error } = await db.from('together_ai_data_consents')
    .select('purpose,disclosure_version,decision,decided_at')
    .eq('user_id', userId)
    .eq('purpose', AI_DATA_CONSENT_PURPOSE)
    .maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'Your AI privacy choice could not be verified.', 500, true);
  return aiDataConsentState(data as Record<string, unknown> | null);
}

export async function requireAiDataConsent(db: SupabaseClient, userId: string): Promise<AiDataConsentState> {
  const state = await loadAiDataConsent(db, userId);
  if (!state.allowsProviderCalls) {
    throw new AppError('CONSENT_REQUIRED', 'Review AI data sharing in Privacy before using this feature.', 403, false);
  }
  return state;
}

export async function recordAiDataConsent(db: SupabaseClient, input: {
  userId: string;
  decision: AiDataConsentDecision;
  source: 'onboarding' | 'privacy' | 'account';
}): Promise<AiDataConsentState> {
  const now = new Date().toISOString();
  const current = {
    user_id: input.userId,
    purpose: AI_DATA_CONSENT_PURPOSE,
    disclosure_version: AI_DATA_CONSENT_DISCLOSURE_VERSION,
    decision: input.decision,
    decided_at: now,
    updated_at: now,
  };
  const { error } = await db.from('together_ai_data_consents').upsert(current, { onConflict: 'user_id,purpose' });
  if (error) throw new AppError('INTERNAL_ERROR', 'Your AI privacy choice could not be saved.', 500, true);
  const event = await db.from('together_ai_data_consent_events').insert({
    user_id: input.userId,
    purpose: AI_DATA_CONSENT_PURPOSE,
    disclosure_version: AI_DATA_CONSENT_DISCLOSURE_VERSION,
    decision: input.decision,
    source: input.source,
  });
  if (event.error) throw new AppError('INTERNAL_ERROR', 'Your AI privacy choice could not be recorded.', 500, true);
  return aiDataConsentState(current);
}

