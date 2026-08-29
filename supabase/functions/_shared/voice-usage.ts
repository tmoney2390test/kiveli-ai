import type { SupabaseClient } from "@supabase/supabase-js";
import {
  voiceCostTelemetryEnabled,
  XAI_REALTIME_AUDIO_COST_USD_PER_MINUTE,
} from "./xai-voice.ts";
import { AppError } from "./types.ts";
import {
  refundCredits,
  resolveSubscriptionState,
} from "./kivelle-subscription.ts";
import { type VoiceCallRoute, voiceRoutePolicy } from "./voice-routes.ts";

export type VoiceCreditBilling = {
  route: VoiceCallRoute;
  creditsPerMinute: number;
  creditBalance: number;
  chargedMinutes: number;
  remainingMinutes: number;
  includedMinutes: number;
  includedMinutesUsed: number;
  includedMinutesRemaining: number;
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
  route: VoiceCallRoute = "express",
): Promise<VoiceCreditBilling> {
  const state = await resolveSubscriptionState(db, userId);
  const policy = voiceRoutePolicy(route, state.tier);
  const allowance = await resolveIncludedVoiceAllowance(db, userId, route, state.tier, state.billing);
  if (
    enforceMinimum && allowance.remaining <= 0 &&
    state.creditBalance.total < policy.creditsPerMinute
  ) {
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      `A ${policy.displayName} call uses ${policy.creditsPerMinute} Kivelle Credits per started minute. You have ${state.creditBalance.total}.`,
      402,
      false,
    );
  }
  return {
    route,
    creditsPerMinute: policy.creditsPerMinute,
    creditBalance: state.creditBalance.total,
    chargedMinutes,
    remainingMinutes: allowance.remaining + Math.floor(state.creditBalance.total / policy.creditsPerMinute),
    includedMinutes: allowance.limit,
    includedMinutesUsed: allowance.used,
    includedMinutesRemaining: allowance.remaining,
  };
}

export async function chargeVoiceCallThroughMinute(
  db: SupabaseClient,
  input: { userId: string; callSessionId: string; throughMinute: number; route?: VoiceCallRoute },
): Promise<VoiceCreditBilling & { lastTransactionId: string }> {
  const throughMinute = Math.max(1, Math.min(1_440, Math.floor(input.throughMinute)));
  const route = input.route ?? "express";
  const state = await resolveSubscriptionState(db, input.userId);
  const policy = voiceRoutePolicy(route, state.tier);
  const allowance = await resolveIncludedVoiceAllowance(db, input.userId, route, state.tier, state.billing);
  const { data: existing, error } = await db.from("together_voice_minute_ledger")
    .select("minute_number,billing_source,credit_transaction_id").eq("user_id", input.userId)
    .eq("call_session_id", input.callSessionId);
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Voice call billing could not be checked.",
      500,
      true,
    );
  }
  const transactions = new Map((existing ?? []).map((row) => [Number(row.minute_number), row]));
  let lastTransactionId = String(transactions.get(throughMinute)?.credit_transaction_id ?? "");
  let creditBalance = state.creditBalance.total;
  let includedUsed = allowance.used;
  for (let minute = 1; minute <= throughMinute; minute += 1) {
    const prior = transactions.get(minute);
    if (prior) {
      if (minute === throughMinute) lastTransactionId = String(prior.credit_transaction_id ?? "");
      continue;
    }
    let useIncluded = false;
    if (route === "standard" && allowance.limit > 0) {
      const allocated = await db.rpc("kivelle_allocate_voice_included_minute", {
        p_user_id: input.userId,
        p_call_session_id: input.callSessionId,
        p_minute_number: minute,
        p_limit: allowance.limit,
        p_period_start: allowance.periodStart,
        p_period_end: allowance.periodEnd,
      });
      if (allocated.error) {
        throw new AppError("INTERNAL_ERROR", "Voice allowance could not be allocated.", 500, true);
      }
      useIncluded = allocated.data === true;
    }
    let transactionId = "";
    if (!useIncluded) {
      const spent = await spendVoiceCredits(db, {
        userId: input.userId,
        callSessionId: input.callSessionId,
        minute,
        route,
        amount: policy.creditsPerMinute,
      });
      transactionId = spent.transactionId;
      creditBalance = spent.creditBalance;
    }
    const row = {
      user_id: input.userId,
      call_session_id: input.callSessionId,
      route,
      minute_number: minute,
      billing_source: useIncluded ? "included" : "credits",
      credits_charged: useIncluded ? 0 : policy.creditsPerMinute,
      credit_transaction_id: transactionId || null,
      allowance_period_start: allowance.periodStart,
      allowance_period_end: allowance.periodEnd,
    };
    if (!useIncluded) {
      const inserted = await db.from("together_voice_minute_ledger").upsert(row, { onConflict: "call_session_id,minute_number", ignoreDuplicates: true });
      if (inserted.error) throw new AppError("INTERNAL_ERROR", "Voice call billing could not be recorded.", 500, true);
    }
    if (useIncluded) includedUsed += 1;
    if (minute === throughMinute) lastTransactionId = transactionId;
    transactions.set(minute, row);
  }
  const includedMinutesUsed = Math.min(allowance.limit, includedUsed);
  return {
    route,
    creditsPerMinute: policy.creditsPerMinute,
    creditBalance,
    chargedMinutes: throughMinute,
    remainingMinutes: Math.max(0, allowance.limit - includedMinutesUsed) + Math.floor(creditBalance / policy.creditsPerMinute),
    includedMinutes: allowance.limit,
    includedMinutesUsed,
    includedMinutesRemaining: Math.max(0, allowance.limit - includedMinutesUsed),
    lastTransactionId,
  };
}

export async function refundUnconnectedVoiceCallCredit(
  db: SupabaseClient,
  input: { userId: string; callSessionId: string; transactionId?: string },
): Promise<boolean> {
  const { data: minute } = await db.from("together_voice_minute_ledger")
    .select("billing_source,credit_transaction_id").eq("user_id", input.userId)
    .eq("call_session_id", input.callSessionId).eq("minute_number", 1).maybeSingle();
  if (minute?.billing_source === "included") {
    const removed = await db.from("together_voice_minute_ledger").delete().eq("user_id", input.userId)
      .eq("call_session_id", input.callSessionId).eq("minute_number", 1);
    return !removed.error;
  }
  let transactionId = input.transactionId;
  if (!transactionId && minute?.credit_transaction_id) transactionId = String(minute.credit_transaction_id);
  if (!transactionId) {
    const { data } = await db.from("together_credit_ledger").select("id")
      .eq("user_id", input.userId)
      .eq("idempotency_key", voiceMinuteChargeKey(input.callSessionId, 1))
      .maybeSingle();
    transactionId = data?.id ? String(data.id) : undefined;
  }
  if (!transactionId) return false;
  const refunded = await refundCredits(db, {
    userId: input.userId,
    transactionId,
    idempotencyKey: `refund:voice-call:${input.callSessionId}:unconnected`,
    metadata: {
      reason: "voice_call_never_connected",
      callSessionId: input.callSessionId,
    },
  });
  if (refunded) await db.from("together_voice_minute_ledger").delete().eq("user_id", input.userId)
    .eq("call_session_id", input.callSessionId).eq("minute_number", 1);
  return refunded;
}

export function voiceBilledMinute(connectedDurationMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, connectedDurationMs) / 60_000));
}

export function voiceMeterMinuteAvailable(
  billingStartedAt: unknown,
  now = new Date(),
): number {
  const billingStarted = parseDate(billingStartedAt);
  if (!billingStarted) return 0;
  return voiceBilledMinute(now.getTime() - billingStarted.getTime());
}

export function voiceCallShouldStartBilling(
  billingStartedAt: unknown,
  events: Array<{ role?: unknown; content?: unknown }>,
): boolean {
  if (billingStartedAt != null && String(billingStartedAt).trim()) return false;
  return events.some((event) =>
    event.role === "user" && typeof event.content === "string" &&
    event.content.trim().length > 0
  );
}

function voiceMinuteChargeKey(callSessionId: string, minute: number): string {
  return `voice-call:${callSessionId}:minute:${minute}`;
}

async function spendVoiceCredits(db: SupabaseClient, input: {
  userId: string;
  callSessionId: string;
  minute: number;
  route: VoiceCallRoute;
  amount: number;
}): Promise<{ transactionId: string; creditBalance: number }> {
  const idempotencyKey = voiceMinuteChargeKey(input.callSessionId, input.minute);
  const { data, error } = await db.rpc("kivelle_spend_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_idempotency_key: idempotencyKey,
    p_reference_type: "voice_call_session",
    p_reference_id: input.callSessionId,
    p_metadata: {
      action: input.route === "standard" ? "voice_standard_minute" : "voice_minute",
      route: input.route,
      callSessionId: input.callSessionId,
      minute: input.minute,
    },
  });
  if (error) {
    if (String(error.message ?? "").includes("INSUFFICIENT_KIVELLE_CREDITS")) {
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        `The next ${input.route === "standard" ? "Essential" : "Immersive"} voice minute needs ${input.amount} Kivelle Credits.`,
        402,
        false,
      );
    }
    throw new AppError("INTERNAL_ERROR", "Voice call credits could not be applied.", 500, true);
  }
  return {
    transactionId: String(data?.transactionId ?? ""),
    creditBalance: Number(data?.total ?? 0),
  };
}

async function resolveIncludedVoiceAllowance(
  db: SupabaseClient,
  userId: string,
  route: VoiceCallRoute,
  tier: string,
  billing: { periodStart?: string | null; periodEnd?: string | null },
): Promise<{ limit: number; used: number; remaining: number; periodStart: string | null; periodEnd: string | null }> {
  const limit = route === "standard" ? voiceRoutePolicy(route, tier).includedMinutes : 0;
  if (!limit) return { limit: 0, used: 0, remaining: 0, periodStart: null, periodEnd: null };
  let periodStart: string | null = null, periodEnd: string | null = null;
  if (tier !== "free") {
    const now = new Date();
    const suppliedStart = parseDate(billing.periodStart), suppliedEnd = parseDate(billing.periodEnd);
    const start = suppliedStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = suppliedEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    periodStart = start.toISOString();
    periodEnd = end.toISOString();
  }
  let query = db.from("together_voice_minute_ledger").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("route", "standard").eq("billing_source", "included");
  if (periodStart && periodEnd) {
    query = query.eq("allowance_period_start", periodStart).eq("allowance_period_end", periodEnd);
  } else {
    query = query.is("allowance_period_start", null).is("allowance_period_end", null);
  }
  const { count, error } = await query;
  if (error) throw new AppError("INTERNAL_ERROR", "Voice allowance could not be checked.", 500, true);
  const used = Math.max(0, Number(count ?? 0));
  return { limit, used, remaining: Math.max(0, limit - used), periodStart, periodEnd };
}

export function estimateRealtimeVoiceCost(
  input: {
    route?: VoiceCallRoute;
    connectedDurationMs: number;
    inputAudioDurationMs?: number;
    outputAudioDurationMs?: number;
  },
): number {
  if (!voiceCostTelemetryEnabled()) return 0;
  if (input.route === "standard") return 0;
  const metered = Math.max(0, Number(input.inputAudioDurationMs ?? 0)) +
    Math.max(0, Number(input.outputAudioDurationMs ?? 0));
  const billableMs = metered > 0
    ? metered
    : Math.max(0, Number(input.connectedDurationMs));
  return roundUsd(billableMs / 60_000 * XAI_REALTIME_AUDIO_COST_USD_PER_MINUTE);
}

export function estimateStandardVoicePipelineCost(input: {
  sttBillableMs?: number;
  dialogueInputTokens?: number;
  dialogueCachedInputTokens?: number;
  dialogueOutputTokens?: number;
  ttsCharacters?: number;
}): number {
  if (!voiceCostTelemetryEnabled()) return 0;
  const stt = Math.max(0, Number(input.sttBillableMs ?? 0)) / 3_600_000 * .20;
  const uncachedInput = Math.max(0, Number(input.dialogueInputTokens ?? 0) - Number(input.dialogueCachedInputTokens ?? 0));
  const cachedInput = Math.max(0, Number(input.dialogueCachedInputTokens ?? 0));
  const output = Math.max(0, Number(input.dialogueOutputTokens ?? 0));
  const dialogue = uncachedInput / 1_000_000 * 1.25 + cachedInput / 1_000_000 * .20 + output / 1_000_000 * 2.50;
  const tts = Math.max(0, Number(input.ttsCharacters ?? 0)) / 1_000_000 * 15;
  return roundUsd(stt + dialogue + tts);
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
  route?: VoiceCallRoute;
  estimatedCostUsdOverride?: number;
  connectedDurationMs: number;
  inputAudioDurationMs?: number;
  outputAudioDurationMs?: number;
  reconnectCount?: number;
  failureCode?: string;
}): Promise<number> {
  const estimatedCostUsd = input.estimatedCostUsdOverride == null
    ? estimateRealtimeVoiceCost(input)
    : roundUsd(Math.max(0, input.estimatedCostUsdOverride));
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
    metadata: { route: input.route ?? "express" },
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
