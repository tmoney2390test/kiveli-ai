import { z } from "zod";
import { parseBody } from "../_shared/body.ts";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { json, serve } from "../_shared/http.ts";
import { buildKivelleConversationContext } from "../_shared/kivelle-conversation-context.ts";
import {
  configuredRealtimeVoiceProvider,
  normalizeMultimodalPreferences,
  type RealtimeVoiceSession,
  resolveCompanionVoiceProfile,
} from "../_shared/kivelle-multimodal.ts";
import {
  chatVoicePreset,
  validateCompanionVoicePreset,
} from "../_shared/companion-voice-selection.ts";
import {
  activeContinuity,
  requireInstanceInActiveContinuity,
} from "../_shared/together-continuity.ts";
import { runLifeSimulation } from "../_shared/together-life.ts";
import { track } from "../_shared/together.ts";
import { AppError } from "../_shared/types.ts";
import {
  finalizeVoiceCallTranscript,
  ingestVoiceTranscriptEvents,
  voiceCallNeedsTranscriptFinalization,
} from "../_shared/voice-call-transcript.ts";
import {
  activeVoiceEntitlement,
  chargeVoiceCallThroughMinute,
  recordVoiceCallUsage,
  refundUnconnectedVoiceCallCredit,
  resolveVoiceCreditBilling,
  voiceBilledMinute,
  voiceMeterMinuteAvailable,
} from "../_shared/voice-usage.ts";
import {
  resolveRealtimeVoiceContentMode,
  voiceCallFallbackLifeRun,
} from "../_shared/voice-call-policy.ts";
import { conversationDialogueContentMode } from "../_shared/conversation-content-mode.ts";
import { XAI_REALTIME_VOICE_MODEL } from "../_shared/xai-voice.ts";
import {
  voiceCallBlockingStatuses,
  voiceCallLeaseExpiresAt,
  voiceCallSessionIsStale,
} from "../_shared/voice-call-lifecycle.ts";

const transcriptEvent = z.object({
  sequence: z.number().int().positive().max(1_000_000),
  providerEventId: z.string().trim().min(1).max(240).optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
  occurredAt: z.string().datetime().optional(),
  final: z.boolean().default(true),
});
const usage = z.object({
  // Credit metering is server-authoritative. Keep a defensive one-day payload
  // ceiling for usage reconciliation from the client transport.
  connectedDurationMs: z.number().int().nonnegative().max(86_400_000)
    .optional(),
  inputAudioDurationMs: z.number().int().nonnegative().max(86_400_000)
    .optional(),
  outputAudioDurationMs: z.number().int().nonnegative().max(86_400_000)
    .optional(),
  reconnectCount: z.number().int().nonnegative().max(20).optional(),
}).default({});
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    characterInstanceId: z.string().uuid(),
    conversationId: z.string().uuid(),
    requestId: z.string().trim().min(8).max(120),
  }),
  z.object({ action: z.literal("status"), callSessionId: z.string().uuid() }),
  z.object({
    action: z.literal("heartbeat"),
    callSessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("abandon"),
    requestId: z.string().trim().min(8).max(120),
  }),
  z.object({
    action: z.literal("meter"),
    callSessionId: z.string().uuid(),
    minute: z.number().int().positive().max(1_440),
  }),
  z.object({
    action: z.literal("refresh_token"),
    callSessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("connected"),
    callSessionId: z.string().uuid(),
    providerSessionId: z.string().trim().min(1).max(240).optional(),
  }),
  z.object({
    action: z.literal("reconnecting"),
    callSessionId: z.string().uuid(),
    reconnectCount: z.number().int().positive().max(20),
  }),
  z.object({
    action: z.literal("transcript"),
    callSessionId: z.string().uuid(),
    events: z.array(transcriptEvent).min(1).max(50),
  }),
  z.object({
    action: z.literal("fail"),
    callSessionId: z.string().uuid(),
    failureCode: z.string().trim().min(1).max(80).optional(),
    reason: z.string().trim().min(1).max(240).optional(),
    usage,
    events: z.array(transcriptEvent).max(100).default([]),
  }),
  z.object({
    action: z.literal("end"),
    callSessionId: z.string().uuid(),
    endedReason: z.enum([
      "user_ended",
      "route_unmounted",
      "app_backgrounded",
      "token_expired",
      "provider_closed",
      "connection_failed",
      "credits_exhausted",
    ]).default("user_ended"),
    usage,
    events: z.array(transcriptEvent).max(100).default([]),
  }),
]);
const terminalStatuses = new Set(["ended", "failed"]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  const continuity = await activeContinuity(db, user.id);

  if (input.action === "create") {
    await enforceRateLimit(
      db,
      user.id,
      "together_voice_call_create",
      12,
      3_600,
    );
    const { instance } = await requireInstanceInActiveContinuity(
      db,
      user.id,
      input.characterInstanceId,
    );
    const { data: conversation } = await db.from("together_conversations")
      .select("*")
      .eq("id", input.conversationId).eq("user_id", user.id).eq(
        "continuity_id",
        continuity.id,
      )
      .eq("character_instance_id", input.characterInstanceId).maybeSingle();
    if (!conversation) {
      throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
    }

    const [{ data: profile }, { data: entitlement }] = await Promise.all([
      db.from("together_profiles").select(
        "multimodal_preferences,age_verified_at,content_preferences",
      ).eq("user_id", user.id).single(),
      db.from("together_entitlements").select("*").eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const preferences = normalizeMultimodalPreferences(
      profile?.multimodal_preferences,
    );
    const voiceEntitlement = activeVoiceEntitlement(entitlement);
    if (preferences.liveVoiceCalls === false) {
      throw new AppError(
        "FORBIDDEN",
        "Live calls are turned off in Settings.",
        403,
      );
    }
    const provider = configuredRealtimeVoiceProvider();
    if (!provider) {
      return json(
        {
          data: {
            status: "not_configured",
            providerStatus: "not_configured",
            message: "Live voice calls aren't connected yet.",
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }
    const { data: duplicate } = await db.from("together_voice_call_sessions")
      .select("*").eq("user_id", user.id).eq("request_id", input.requestId)
      .maybeSingle();
    if (duplicate) {
      if (terminalStatuses.has(String(duplicate.status))) {
        return json(
          { data: { call: sanitizeCall(duplicate) }, correlationId },
          200,
          correlationId,
        );
      }
      const prepared = await prepareProviderSession({
        db,
        userId: user.id,
        call: duplicate,
        instance,
        conversation,
        provider,
        profile,
        correlationId,
      });
      const billing = await resolveVoiceCreditBilling(db, user.id, 1);
      return json(
        {
          data: {
            call: sanitizeCall(prepared.call),
            ...sessionForClient(prepared.session),
            billing,
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }

    await resolveVoiceCreditBilling(db, user.id, 0, true);

    const { data: otherCall } = await db.from("together_voice_call_sessions")
      .select("*").eq("user_id", user.id).eq("continuity_id", continuity.id).in(
        "status",
        voiceCallBlockingStatuses,
      ).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (otherCall) {
      if (!voiceCallSessionIsStale(otherCall)) {
        throw new AppError(
          "CONFLICT",
          "End your current voice call before starting another.",
          409,
          false,
        );
      }
      const staleEndedAt = new Date().toISOString();
      const { data: reaped, error: reapError } = await db.from(
        "together_voice_call_sessions",
      ).update({
        status: "failed",
        ended_at: staleEndedAt,
        ended_reason: "connection_failed",
        failure_code: "stale_session",
        failure_reason_safe: "The previous call did not close cleanly.",
        lease_expires_at: null,
        updated_at: staleEndedAt,
      }).eq("id", otherCall.id).eq("user_id", user.id).in(
        "status",
        voiceCallBlockingStatuses,
      ).select("*").maybeSingle();
      if (reapError || !reaped) {
        throw new AppError(
          "CONFLICT",
          "The previous voice call is still closing. Try again in a moment.",
          409,
          true,
        );
      }
      await recordFailedCallUsage(
        db,
        otherCall,
        voiceEntitlement.tier,
        "stale_session",
      );
      await track(db, user.id, "voice_call_failed", {
        callSessionId: otherCall.id,
        characterInstanceId: otherCall.character_instance_id,
        failureCode: "stale_session",
      });
    }

    const id = crypto.randomUUID();
    const { data: created, error } = await db.from(
      "together_voice_call_sessions",
    ).insert({
      id,
      user_id: user.id,
      continuity_id: continuity.id,
      character_instance_id: input.characterInstanceId,
      conversation_id: input.conversationId,
      status: "creating",
      request_id: input.requestId,
      provider: provider.id,
      model: XAI_REALTIME_VOICE_MODEL,
      lease_expires_at: voiceCallLeaseExpiresAt("creating"),
      metadata: { contextVersion: 2, transport: "websocket_json_pcm16" },
    }).select("*").single();
    if (error || !created) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The call could not be started.",
        500,
        true,
      );
    }
    let firstMinuteTransactionId = "";
    try {
      const billing = await chargeVoiceCallThroughMinute(db, {
        userId: user.id,
        callSessionId: id,
        throughMinute: 1,
      });
      firstMinuteTransactionId = billing.lastTransactionId;
      await track(db, user.id, "voice_call_started", {
        callSessionId: id,
        characterInstanceId: input.characterInstanceId,
        creditsPerMinute: billing.creditsPerMinute,
      });
      const prepared = await prepareProviderSession({
        db,
        userId: user.id,
        call: created,
        instance,
        conversation,
        provider,
        profile,
        correlationId,
      });
      await track(db, user.id, "voice_call_session_created", {
        callSessionId: id,
        characterInstanceId: input.characterInstanceId,
        provider: provider.id,
        model: prepared.call.model,
      });
      return json(
        {
          data: {
            call: sanitizeCall(prepared.call),
            ...sessionForClient(prepared.session),
            billing,
          },
          correlationId,
        },
        201,
        correlationId,
      );
    } catch (error) {
      if (firstMinuteTransactionId) {
        await refundUnconnectedVoiceCallCredit(db, {
          userId: user.id,
          callSessionId: id,
          transactionId: firstMinuteTransactionId,
        });
      }
      const endedAt = new Date().toISOString();
      await db.from("together_voice_call_sessions").update({
        status: "failed",
        ended_at: endedAt,
        ended_reason: "connection_failed",
        failure_code: "provider_unavailable",
        failure_reason_safe: "The call couldn't connect.",
        lease_expires_at: null,
        updated_at: endedAt,
      }).eq("id", id).eq("user_id", user.id);
      await recordFailedCallUsage(
        db,
        created,
        voiceEntitlement.tier,
        "provider_unavailable",
      );
      await track(db, user.id, "voice_call_failed", {
        callSessionId: id,
        characterInstanceId: input.characterInstanceId,
        failureCode: "provider_unavailable",
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The call couldn't connect.",
        503,
        true,
      );
    }
  }

  if (input.action === "abandon") {
    const { data: abandoned } = await db.from("together_voice_call_sessions")
      .select("*").eq("user_id", user.id).eq("continuity_id", continuity.id)
      .eq("request_id", input.requestId).maybeSingle();
    if (!abandoned || terminalStatuses.has(String(abandoned.status))) {
      return json(
        {
          data: {
            abandoned: Boolean(abandoned),
            call: abandoned ? sanitizeCall(abandoned) : null,
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }
    const activeProvider = configuredRealtimeVoiceProvider();
    if (activeProvider && abandoned.provider_session_id) {
      await activeProvider.endSession(String(abandoned.provider_session_id))
        .catch(() => undefined);
    }
    if (!abandoned.connected_at) {
      await refundUnconnectedVoiceCallCredit(db, {
        userId: user.id,
        callSessionId: String(abandoned.id),
      }).catch(() => undefined);
    }
    const endedAt = new Date().toISOString();
    const { data: failed } = await db.from("together_voice_call_sessions")
      .update({
        status: "failed",
        ended_at: endedAt,
        ended_reason: "connection_failed",
        failure_code: "client_create_interrupted",
        failure_reason_safe:
          "The call setup was interrupted before it connected.",
        lease_expires_at: null,
        updated_at: endedAt,
      }).eq("id", abandoned.id).eq("user_id", user.id).in("status", [
        ...voiceCallBlockingStatuses,
        "ending",
      ]).select("*").maybeSingle();
    await track(db, user.id, "voice_call_failed", {
      callSessionId: abandoned.id,
      characterInstanceId: abandoned.character_instance_id,
      failureCode: "client_create_interrupted",
    });
    return json(
      {
        data: { abandoned: true, call: sanitizeCall(failed ?? abandoned) },
        correlationId,
      },
      200,
      correlationId,
    );
  }

  const { data: call } = await db.from("together_voice_call_sessions").select(
    "*",
  ).eq("id", input.callSessionId).eq("user_id", user.id).eq(
    "continuity_id",
    continuity.id,
  ).maybeSingle();
  if (!call) throw new AppError("NOT_FOUND", "That call is unavailable.", 404);
  if (input.action === "status") {
    return json(
      { data: { call: sanitizeCall(call) }, correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "heartbeat") {
    if (terminalStatuses.has(String(call.status)) || call.status === "ending") {
      return json(
        { data: { call: sanitizeCall(call) }, correlationId },
        200,
        correlationId,
      );
    }
    const updatedAt = new Date();
    const { data: heartbeat } = await db.from("together_voice_call_sessions")
      .update({
        lease_expires_at: voiceCallLeaseExpiresAt(
          String(call.status),
          updatedAt,
        ),
        updated_at: updatedAt.toISOString(),
      }).eq("id", call.id).eq("user_id", user.id).in(
        "status",
        voiceCallBlockingStatuses,
      ).select("*").maybeSingle();
    return json(
      { data: { call: sanitizeCall(heartbeat ?? call) }, correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "meter") {
    if (terminalStatuses.has(String(call.status))) {
      throw new AppError(
        "CONFLICT",
        "That call has already ended.",
        409,
        false,
      );
    }
    const availableMinute = voiceMeterMinuteAvailable(call.connected_at);
    if (!availableMinute || input.minute > availableMinute) {
      throw new AppError(
        "CONFLICT",
        "That voice minute has not started yet.",
        409,
        false,
      );
    }
    const billing = await chargeVoiceCallThroughMinute(db, {
      userId: user.id,
      callSessionId: String(call.id),
      throughMinute: input.minute,
    });
    const renewedAt = new Date();
    await db.from("together_voice_call_sessions").update({
      metadata: {
        ...(call.metadata ?? {}),
        billing: {
          type: "kivelle_credits_per_started_minute",
          creditsPerMinute: billing.creditsPerMinute,
          chargedMinutes: billing.chargedMinutes,
        },
      },
      lease_expires_at: voiceCallLeaseExpiresAt("active", renewedAt),
      updated_at: renewedAt.toISOString(),
    }).eq("id", call.id).eq("user_id", user.id);
    return json({ data: { billing }, correlationId }, 200, correlationId);
  }

  if (input.action === "refresh_token") {
    if (terminalStatuses.has(String(call.status))) {
      throw new AppError(
        "CONFLICT",
        "That call has already ended.",
        409,
        false,
      );
    }
    const provider = configuredRealtimeVoiceProvider();
    if (!provider) {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Live calls are temporarily unavailable.",
        503,
        true,
      );
    }
    const { instance } = await requireInstanceInActiveContinuity(
      db,
      user.id,
      String(call.character_instance_id),
    );
    const { data: conversation } = await db.from("together_conversations")
      .select("*").eq("id", call.conversation_id).eq("user_id", user.id)
      .single();
    const { data: profile } = await db.from("together_profiles").select(
      "age_verified_at,content_preferences",
    ).eq("user_id", user.id).single();
    const prepared = await prepareProviderSession({
      db,
      userId: user.id,
      call,
      instance,
      conversation,
      provider,
      profile,
      correlationId,
    });
    return json(
      {
        data: {
          call: sanitizeCall(prepared.call),
          ...sessionForClient(prepared.session),
        },
        correlationId,
      },
      200,
      correlationId,
    );
  }

  if (input.action === "connected") {
    if (terminalStatuses.has(String(call.status))) {
      return json(
        { data: { call: sanitizeCall(call) }, correlationId },
        200,
        correlationId,
      );
    }
    const connectedUpdateAt = new Date();
    const connectedAt = String(
      call.connected_at ?? connectedUpdateAt.toISOString(),
    );
    const { data: active, error } = await db.from(
      "together_voice_call_sessions",
    ).update({
      status: "active",
      started_at: call.started_at ?? connectedAt,
      connected_at: connectedAt,
      provider_session_id: input.providerSessionId ?? call.provider_session_id,
      lease_expires_at: voiceCallLeaseExpiresAt("active", connectedUpdateAt),
      updated_at: connectedUpdateAt.toISOString(),
    }).eq("id", call.id).eq("user_id", user.id).select("*").single();
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The connected call could not be recorded.",
        500,
        true,
      );
    }
    await track(db, user.id, "voice_call_connected", {
      callSessionId: call.id,
      characterInstanceId: call.character_instance_id,
    });
    return json(
      { data: { call: sanitizeCall(active) }, correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "reconnecting") {
    if (terminalStatuses.has(String(call.status))) {
      return json(
        { data: { call: sanitizeCall(call) }, correlationId },
        200,
        correlationId,
      );
    }
    const reconnectCount = Math.max(
      Number(call.reconnect_count ?? 0),
      input.reconnectCount,
    );
    const reconnectingAt = new Date();
    const { data: reconnecting } = await db.from("together_voice_call_sessions")
      .update({
        status: "reconnecting",
        reconnect_count: reconnectCount,
        lease_expires_at: voiceCallLeaseExpiresAt(
          "reconnecting",
          reconnectingAt,
        ),
        updated_at: reconnectingAt.toISOString(),
      }).eq("id", call.id).eq("user_id", user.id).select("*").single();
    await track(db, user.id, "voice_call_reconnecting", {
      callSessionId: call.id,
      characterInstanceId: call.character_instance_id,
      reconnectCount,
    });
    return json(
      { data: { call: sanitizeCall(reconnecting ?? call) }, correlationId },
      200,
      correlationId,
    );
  }

  if (input.action === "transcript") {
    if (terminalStatuses.has(String(call.status))) {
      throw new AppError(
        "CONFLICT",
        "That call has already ended.",
        409,
        false,
      );
    }
    const result = await ingestVoiceTranscriptEvents({
      db,
      call,
      events: input.events,
    });
    return json({ data: result, correlationId }, 202, correlationId);
  }

  const isFailure = input.action === "fail";
  if (call.status === "ended" || call.status === "failed") {
    return json(
      { data: { call: sanitizeCall(call) }, correlationId },
      200,
      correlationId,
    );
  }
  const activeProvider = configuredRealtimeVoiceProvider();
  if (activeProvider && call.provider_session_id) {
    await activeProvider.endSession(String(call.provider_session_id)).catch(
      () => undefined,
    );
  }
  const endedAt = new Date(),
    wallDuration = call.connected_at
      ? Math.max(0, endedAt.getTime() - new Date(call.connected_at).getTime())
      : 0;
  const reported = input.usage;
  const connectedDurationMs = Math.min(
    7_200_000,
    wallDuration,
    Math.max(0, reported.connectedDurationMs ?? wallDuration),
  );
  const inputAudioDurationMs = Math.min(
    connectedDurationMs,
    Math.max(0, reported.inputAudioDurationMs ?? 0),
  );
  const outputAudioDurationMs = Math.min(
    connectedDurationMs,
    Math.max(0, reported.outputAudioDurationMs ?? 0),
  );
  const reconnectCount = Math.max(
    Number(call.reconnect_count ?? 0),
    reported.reconnectCount ?? 0,
  );
  const endedReason = isFailure ? "connection_failed" : input.endedReason;
  const failureCode = isFailure
    ? (input.failureCode ?? "connection_failed")
    : null;
  const finalStatus = isFailure ? "failed" : "ended";
  // Release the exclusive lifecycle before transcript reconciliation, usage
  // telemetry, or any other secondary work. Those operations may retry or
  // fail, but they must never strand the user behind an `ending` row.
  const { data: terminalCall, error: terminalError } = await db.from(
    "together_voice_call_sessions",
  ).update({
    status: finalStatus,
    ended_at: endedAt.toISOString(),
    ended_reason: endedReason,
    failure_code: failureCode,
    failure_reason_safe: isFailure
      ? (input.reason ?? "The call lost its connection.")
      : null,
    connected_duration_ms: connectedDurationMs,
    input_audio_duration_ms: inputAudioDurationMs,
    output_audio_duration_ms: outputAudioDurationMs,
    reconnect_count: reconnectCount,
    lease_expires_at: null,
    updated_at: endedAt.toISOString(),
  }).eq("id", call.id).eq("user_id", user.id).in("status", [
    ...voiceCallBlockingStatuses,
    "ending",
  ]).select("*").maybeSingle();
  if (terminalError || !terminalCall) {
    const { data: currentCall } = await db.from("together_voice_call_sessions")
      .select("*").eq("id", call.id).eq("user_id", user.id).maybeSingle();
    if (!currentCall || !terminalStatuses.has(String(currentCall.status))) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The call could not be finalized.",
        500,
        true,
      );
    }
  }
  let billing = await resolveVoiceCreditBilling(db, user.id);
  if (call.connected_at) {
    const throughMinute = voiceBilledMinute(connectedDurationMs);
    try {
      billing = await chargeVoiceCallThroughMinute(db, {
        userId: user.id,
        callSessionId: String(call.id),
        throughMinute,
      });
    } catch (error) {
      if (
        !(error instanceof AppError) || error.code !== "INSUFFICIENT_CREDITS"
      ) {
        throw error;
      }
      await track(db, user.id, "voice_call_credit_shortfall", {
        callSessionId: call.id,
        characterInstanceId: call.character_instance_id,
        throughMinute,
      });
      billing = await resolveVoiceCreditBilling(
        db,
        user.id,
        Math.max(1, throughMinute - 1),
      );
    }
  } else {
    await refundUnconnectedVoiceCallCredit(db, {
      userId: user.id,
      callSessionId: String(call.id),
    });
    billing = await resolveVoiceCreditBilling(db, user.id);
  }
  const { data: entitlement } = await db.from("together_entitlements").select(
    "tier,entitlement_keys,expires_at",
  ).eq("user_id", user.id).maybeSingle();
  const voiceEntitlement = activeVoiceEntitlement(entitlement);
  if (input.events.length) {
    await ingestVoiceTranscriptEvents({ db, call, events: input.events }).catch(
      () => undefined,
    );
  }
  let reconciliation = { messageCount: 0, reconciled: false };
  if (
    voiceCallNeedsTranscriptFinalization({
      isFailure,
      incomingEventCount: input.events.length,
      transcriptStatus: call.transcript_status,
    })
  ) {
    try {
      const { context } = await buildCallContext({
        db,
        userId: user.id,
        instanceId: String(call.character_instance_id),
        conversationId: String(call.conversation_id),
        correlationId,
      });
      reconciliation = await finalizeVoiceCallTranscript({
        db,
        call: { ...call, connected_duration_ms: connectedDurationMs },
        context,
        correlationId,
      });
    } catch {
      await track(db, user.id, "voice_call_transcript_finalize_failed", {
        callSessionId: call.id,
        characterInstanceId: call.character_instance_id,
        endedReason,
      });
    }
  }
  const estimatedCostUsd = await recordVoiceCallUsage(db, {
    userId: user.id,
    continuityId: String(call.continuity_id),
    characterInstanceId: String(call.character_instance_id),
    conversationId: String(call.conversation_id),
    callSessionId: String(call.id),
    provider: String(call.provider ?? "xai"),
    model: String(call.model ?? XAI_REALTIME_VOICE_MODEL),
    planTier: voiceEntitlement.tier,
    status: isFailure ? "failure" : "success",
    connectedDurationMs,
    inputAudioDurationMs,
    outputAudioDurationMs,
    reconnectCount,
    ...(failureCode ? { failureCode } : {}),
  }).catch((error) => {
    if (String((error as { code?: string })?.code ?? "") === "23505") {
      return Number(call.estimated_cost_usd ?? 0);
    }
    return Number(call.estimated_cost_usd ?? 0);
  });
  const { data: enriched } = await db.from(
    "together_voice_call_sessions",
  ).update({
    estimated_cost_usd: estimatedCostUsd,
    usage_metadata: {
      ...(call.usage_metadata ?? {}),
      connectedDurationMs,
      inputAudioDurationMs,
      outputAudioDurationMs,
      reconnectCount,
      billing: {
        type: "kivelle_credits_per_started_minute",
        creditsPerMinute: billing.creditsPerMinute,
        chargedMinutes: billing.chargedMinutes,
        creditBalance: billing.creditBalance,
      },
    },
    updated_at: endedAt.toISOString(),
  }).eq("id", call.id).eq("user_id", user.id).in("status", ["ended", "failed"])
    .select("*").maybeSingle();
  await track(
    db,
    user.id,
    isFailure ? "voice_call_failed" : "voice_call_ended",
    {
      callSessionId: call.id,
      characterInstanceId: call.character_instance_id,
      connectedDurationMs,
      reconnectCount,
      ...(failureCode ? { failureCode } : {}),
    },
  );
  const ended = enriched ?? terminalCall ?? call;
  return json(
    {
      data: { call: sanitizeCall(ended), reconciliation, billing },
      correlationId,
    },
    200,
    correlationId,
  );
});

async function prepareProviderSession(
  input: {
    db: any;
    userId: string;
    call: Record<string, any>;
    instance: Record<string, any>;
    conversation: Record<string, any>;
    provider: NonNullable<ReturnType<typeof configuredRealtimeVoiceProvider>>;
    profile: Record<string, any> | null;
    correlationId: string;
  },
): Promise<{ call: Record<string, any>; session: RealtimeVoiceSession }> {
  const lifeRun = await resolveVoiceCallLifeRun({
    db: input.db,
    userId: input.userId,
    characterInstanceId: String(input.call.character_instance_id),
    instance: input.instance,
    now: new Date(),
    correlationId: input.correlationId,
    phase: "session_creation",
  });
  const context = await buildKivelleConversationContext({
    db: input.db,
    userId: input.userId,
    instance: input.instance,
    conversation: input.conversation,
    userMessage: "The user is starting a private live voice call.",
    lifeRun,
    semanticRows: [],
    now: new Date(),
    correlationId: input.correlationId,
  });
  context.contentMode = resolvedRealtimeContentMode(
    context,
    input.profile,
    input.instance,
    input.conversation,
  );
  const storedVoicePreset = chatVoicePreset(input.conversation.metadata);
  const voicePreset = storedVoicePreset
    ? await validateCompanionVoicePreset(
      input.db,
      String(input.call.character_instance_id),
      storedVoicePreset,
    )
    : null;
  const voice = await resolveCompanionVoiceProfile(
    input.db,
    String(input.call.character_instance_id),
    voicePreset,
  );
  const session = await input.provider.createSession({
    callSessionId: String(input.call.id),
    voice,
    context: safeRealtimeContext(context),
  });
  const now = new Date().toISOString(),
    providerMetadata = record(session.providerMetadata);
  const { data: updated, error } = await input.db.from(
    "together_voice_call_sessions",
  ).update({
    status: "connecting",
    provider_session_id: session.providerSessionId,
    model: String(
      providerMetadata.model ?? input.call.model ?? XAI_REALTIME_VOICE_MODEL,
    ),
    lease_expires_at: voiceCallLeaseExpiresAt("connecting", new Date(now)),
    metadata: {
      ...record(input.call.metadata),
      contextVersion: 2,
      providerMetadata,
    },
    updated_at: now,
  }).eq("id", input.call.id).eq("user_id", input.userId).select("*").single();
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The call session could not be prepared.",
      500,
      true,
    );
  }
  return { call: updated, session };
}

async function buildCallContext(
  input: {
    db: any;
    userId: string;
    instanceId: string;
    conversationId: string;
    correlationId: string;
  },
) {
  const { data: instance } = await input.db.from("together_character_instances")
    .select("*,together_character_templates(*),together_character_versions(*)")
    .eq("id", input.instanceId).eq("user_id", input.userId).single();
  const { data: conversation } = await input.db.from("together_conversations")
    .select("*").eq("id", input.conversationId).eq("user_id", input.userId)
    .single();
  const { data: profile } = await input.db.from("together_profiles").select(
    "age_verified_at,content_preferences",
  ).eq("user_id", input.userId).single();
  const now = new Date(),
    lifeRun = await resolveVoiceCallLifeRun({
      db: input.db,
      userId: input.userId,
      characterInstanceId: input.instanceId,
      instance,
      now,
      correlationId: input.correlationId,
      phase: "reconciliation",
    });
  const context = await buildKivelleConversationContext({
    db: input.db,
    userId: input.userId,
    instance,
    conversation,
    userMessage: "Reconcile the completed private live voice call.",
    lifeRun,
    semanticRows: [],
    now,
    correlationId: input.correlationId,
  });
  context.contentMode = resolvedRealtimeContentMode(
    context,
    profile,
    instance,
    conversation,
  );
  return { context, instance, conversation };
}

async function resolveVoiceCallLifeRun(input: {
  db: any;
  userId: string;
  characterInstanceId: string;
  instance: Record<string, unknown> | null;
  now: Date;
  correlationId: string;
  phase: "session_creation" | "reconciliation";
}): Promise<Record<string, unknown>> {
  try {
    return await runLifeSimulation({
      db: input.db,
      userId: input.userId,
      characterInstanceId: input.characterInstanceId,
      now: input.now,
      evaluateProactive: false,
      trigger: "conversation_continued",
    });
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      correlationId: input.correlationId,
      operation: "voice_call_life_context_degraded",
      phase: input.phase,
      characterInstanceId: input.characterInstanceId,
      code: error instanceof AppError ? error.code : "LIFE_CONTEXT_UNAVAILABLE",
    }));
    return voiceCallFallbackLifeRun(input.instance);
  }
}

function resolvedRealtimeContentMode(
  context: Record<string, any>,
  profile: Record<string, any> | null,
  instance: Record<string, any>,
  conversation: Record<string, any> | null,
): "standard" | "romance" | "mature" | "explicit" {
  const characterAge = Number(
    instance.together_character_templates?.age ??
      instance.together_character_versions?.age ?? context.character?.age ?? 0,
  );
  const relationship = record(context.relationship);
  return resolveRealtimeVoiceContentMode({
    requestedMode: conversationDialogueContentMode(profile, conversation),
    ageVerified: Boolean(profile?.age_verified_at),
    characterAge,
    romanceEnabled: profile?.content_preferences?.romanceEnabled !== false &&
      relationship.romance_enabled !== false,
    friendsOnly: relationship.romance_path_status === "friends_only",
    explicitProviderEnabled: Deno.env.get("KIVELLE_XAI_ENABLED") === "true" &&
      Deno.env.get("KIVELLE_XAI_EXPLICIT_ENABLED") === "true",
  });
}

function safeRealtimeContext(
  context: Record<string, any>,
): Record<string, unknown> {
  return {
    character: context.character,
    persona: context.persona,
    relationship: context.relationship,
    relationshipStance: context.relationshipStance,
    currentScene: context.currentScene,
    life: context.life,
    activePlan: context.activePlan,
    activeDate: context.activeDate,
    openThreads: context.openThreads,
    memories: context.memories,
    recent: context.recent,
    currentWorld: context.currentWorld,
    contentMode: context.contentMode,
    boundaries: context.boundaries,
    conversationStyle: context.conversationStyle,
  };
}
function sessionForClient(session: RealtimeVoiceSession) {
  return {
    clientSecret: session.clientSecret,
    expiresAt: session.expiresAt,
    clientConfiguration: session.clientConfiguration,
  };
}
function sanitizeCall(call: Record<string, any>) {
  const { provider_session_id: _providerSessionId, ...safe } = call;
  return safe;
}
function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
async function recordFailedCallUsage(
  db: any,
  call: Record<string, any>,
  planTier: string,
  failureCode: string,
) {
  await recordVoiceCallUsage(db, {
    userId: String(call.user_id),
    continuityId: String(call.continuity_id),
    characterInstanceId: String(call.character_instance_id),
    conversationId: String(call.conversation_id),
    callSessionId: String(call.id),
    provider: String(call.provider ?? "xai"),
    model: String(call.model ?? XAI_REALTIME_VOICE_MODEL),
    planTier,
    status: "failure",
    connectedDurationMs: 0,
    failureCode,
  }).catch(() => undefined);
}
