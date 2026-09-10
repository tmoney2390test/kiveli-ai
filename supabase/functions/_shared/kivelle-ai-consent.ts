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
    allowsProviderCalls: decision === 'accepted' && row?.disclosure_version === AI_DATA_CONSENT_DISCLOSURE_VERSION && typeof row?.decided_at === 'string' && Number.isFinite(Date.parse(row.decided_at)),
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
  if (!state.allowsProviderCalls) throw new AppError('CONSENT_REQUIRED', 'Allow AI data sharing to use this feature. Open Privacy settings to review your choice. Older apps may need an update.', 403, false);
  return state;
}

export async function recordAiDataConsent(db: SupabaseClient, input: {
  userId: string;
  decision: AiDataConsentDecision;
  source: 'onboarding' | 'privacy' | 'account';
}): Promise<AiDataConsentState> {
  const { error } = await db.rpc('kivelle_record_ai_consent', {p_user_id:input.userId,p_decision:input.decision,p_version:AI_DATA_CONSENT_DISCLOSURE_VERSION,p_source:input.source});
  if (error) throw new AppError('INTERNAL_ERROR', 'Your AI privacy choice could not be saved.', 500, true);
  return loadAiDataConsent(db,input.userId);
}


/** Call immediately before a user-scoped provider operation, including post-turn work. */
export async function requireScopedAiConsent(scope:{db?:SupabaseClient;userId?:string}|undefined):Promise<void>{
  if(scope?.db&&scope.userId)await requireAiDataConsent(scope.db,scope.userId);
}
