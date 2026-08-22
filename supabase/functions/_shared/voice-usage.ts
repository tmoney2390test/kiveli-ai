import type { SupabaseClient } from "@supabase/supabase-js";
import {
  voiceCostTelemetryEnabled,
  XAI_REALTIME_AUDIO_COST_USD_PER_MINUTE,
} from "./xai-voice.ts";
import { AppError } from "./types.ts";
import { creditCost } from "../../../packages/together-domain/src/entitlements.ts";
import {
  refundCredits,
  resolveSubscriptionState,
  spendCredits,
} from "./kivelle-subscription.ts";

export type VoiceCreditBilling = {
  creditsPerMinute: number;
  creditBalance: number;
  chargedMinutes: number;
  remainingMinutes: number;
};

export function activeVoiceEntitlement(
  entitlement: Record<string, unknown> | null | undefined,
  now = new Date(),
): { tier: string; entitlementKeys: string[]; expired: boolean } {
  const expiresAt = parseDate(entitlement?.expires_at);
  const expired = Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
  if (expired) return { tier: "free", entitlementKeys: [], expired: true };
  return {
    tier: String(entitlement?.tier ?? "free"),
    entitlementKeys: Array.isArray(entitlement?.entitlement_keys)
      ? entitlement.entitlement_keys.map(String)
      : [],
    expired: false,
  };
}

export async function resolveVoiceCreditBilling(
  db: SupabaseClient,
  userId: string,
  chargedMinutes = 0,
  enforceMinimum = false,
): Promise<VoiceCreditBilling> {
  const state = await resolveSubscriptionState(db, userId);
  const creditsPerMinute = creditCost("voice_minute");
  if (enforceMinimum && state.creditBalance.total < creditsPerMinute) {
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      `A live call uses ${creditsPerMinute} Kivelle Credits per started minute. You have ${state.creditBalance.total}.`,
      402,
      false,
    );
  }
  return {
    creditsPerMinute,
    creditBalance: state.creditBalance.total,
    chargedMinutes,
    remainingMinutes: Math.floor(state.creditBalance.total / creditsPerMinute),
  };
}

export async function chargeVoiceCallThroughMinute(
  db: SupabaseClient,
  input: { userId: string; callSessionId: string; throughMinute: number },
): Promise<VoiceCreditBilling & { lastTransactionId: string }> {
  const throughMinute = Math.max(1, Math.min(1_440, Math.floor(input.throughMinute)));
  const state = await resolveSubscriptionState(db, input.userId);
  const { data: existing, error } = await db.from("together_credit_ledger")
    .select("id,idempotency_key").eq("user_id", input.userId)
    .eq("event_type", "spend")
    .eq("reference_type", "voice_call_session")
    .eq("reference_id", input.callSessionId);
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Voice call billing could not be checked.",
      500,
      true,
    );
  }
  const transactions = new Map(
    (existing ?? []).map((row) => [String(row.idempotency_key), String(row.id)]),
  );
  let lastTransactionId = transactions.get(
    voiceMinuteChargeKey(input.callSessionId, throughMinute),
  ) ?? "";
  let creditBalance = state.creditBalance.total;
  const creditsPerMinute = creditCost("voice_minute");
  for (let minute = 1; minute <= throughMinute; minute += 1) {
    const chargeKey = voiceMinuteChargeKey(input.callSessionId, minute);
    const existingTransactionId = transactions.get(chargeKey);
    if (existingTransactionId) {
      if (minute === throughMinute) lastTransactionId = existingTransactionId;
      continue;
    }
    const spent = await spendCredits(db, {
      userId: input.userId,
      action: "voice_minute",
      idempotencyKey: chargeKey,
      referenceType: "voice_call_session",
      referenceId: input.callSessionId,
      metadata: { callSessionId: input.callSessionId, minute },
    });
    lastTransactionId = spent.transactionId;
    creditBalance = spent.balance.total;
    transactions.set(chargeKey, spent.transactionId);
  }
  return {
    creditsPerMinute,
    creditBalance,
    chargedMinutes: throughMinute,
    remainingMinutes: Math.floor(creditBalance / creditsPerMinute),
    lastTransactionId,
  };
}

export async function refundUnconnectedVoiceCallCredit(
  db: SupabaseClient,
  input: { userId: string; callSessionId: string; transactionId?: string },
): Promise<boolean> {
  let transactionId = input.transactionId;
  if (!transactionId) {
    const { data } = await db.from("together_credit_ledger").select("id")
      .eq("user_id", input.userId)
      .eq("idempotency_key", voiceMinuteChargeKey(input.callSessionId, 1))
      .maybeSingle();
    transactionId = data?.id ? String(data.id) : undefined;
  }
  if (!transactionId) return false;
  return await refundCredits(db, {
    userId: input.userId,
    transactionId,
    idempotencyKey: `refund:voice-call:${input.callSessionId}:unconnected`,
    metadata: {
      reason: "voice_call_never_connected",
      callSessionId: input.callSessionId,
    },
  });
}

export function voiceBilledMinute(connectedDurationMs: number): number {
  return Math.max(1, Math.floor(Math.max(0, connectedDurationMs) / 60_000) + 1);
}

export function voiceMeterMinuteAvailable(
  connectedAt: unknown,
  now = new Date(),
): number {
  const connected = parseDate(connectedAt);
  if (!connected) return 0;
  return voiceBilledMinute(now.getTime() - connected.getTime());
}

function voiceMinuteChargeKey(callSessionId: string, minute: number): string {
  return `voice-call:${callSessionId}:minute:${minute}`;
}

export function estimateRealtimeVoiceCost(
  input: {
    connectedDurationMs: number;
    inputAudioDurationMs?: number;
    outputAudioDurationMs?: number;
  },
): number {
  if (!voiceCostTelemetryEnabled()) return 0;
  const metered = Math.max(0, Number(input.inputAudioDurationMs ?? 0)) +
    Math.max(0, Number(input.outputAudioDurationMs ?? 0));
  const billableMs = metered > 0
    ? metered
    : Math.max(0, Number(input.connectedDurationMs));
  return roundUsd(billableMs / 60_000 * XAI_REALTIME_AUDIO_COST_USD_PER_MINUTE);
}

export async function recordVoiceNoteUsage(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  conversationId: string;
  mediaId?: string;
  provider: string;
  model: string;
  planTier: string;
  status: "success" | "failure";
  characterCount: number;
  latencyMs?: number;
  estimatedCostUsd: number;
  failureCode?: string;
}): Promise<void> {
  await db.from("together_voice_usage_events").insert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_instance_id: input.characterInstanceId,
    conversation_id: input.conversationId,
    media_id: input.mediaId ?? null,
    usage_kind: "voice_note",
    provider: input.provider,
    model: input.model,
    plan_tier: input.planTier,
    status: input.status,
    character_count: Math.max(0, Math.floor(input.characterCount)),
    latency_ms: input.latencyMs == null
      ? null
      : Math.max(0, Math.round(input.latencyMs)),
    estimated_cost_usd: Math.max(0, input.estimatedCostUsd),
    failure_code: input.failureCode ?? null,
  });
}

export async function recordVoiceCallUsage(db: SupabaseClient, input: {
  userId: string;
  continuityId: string;
  characterInstanceId: string;
  conversationId: string;
  callSessionId: string;
  provider: string;
  model: string;
  planTier: string;
  status: "success" | "failure";
  connectedDurationMs: number;
  inputAudioDurationMs?: number;
  outputAudioDurationMs?: number;
  reconnectCount?: number;
  failureCode?: string;
}): Promise<number> {
  const estimatedCostUsd = estimateRealtimeVoiceCost(input);
  await db.from("together_voice_usage_events").insert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_instance_id: input.characterInstanceId,
    conversation_id: input.conversationId,
    call_session_id: input.callSessionId,
    usage_kind: "voice_call",
    provider: input.provider,
    model: input.model,
    plan_tier: input.planTier,
    status: input.status,
    connected_duration_ms: Math.max(0, Math.round(input.connectedDurationMs)),
    input_audio_duration_ms: Math.max(
      0,
      Math.round(input.inputAudioDurationMs ?? 0),
    ),
    output_audio_duration_ms: Math.max(
      0,
      Math.round(input.outputAudioDurationMs ?? 0),
    ),
    reconnect_count: Math.max(0, Math.floor(input.reconnectCount ?? 0)),
    estimated_cost_usd: estimatedCostUsd,
    failure_code: input.failureCode ?? null,
  });
  return estimatedCostUsd;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
