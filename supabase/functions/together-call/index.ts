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
  estimateStandardVoicePipelineCost,
  refundUnconnectedVoiceCallCredit,
  resolveVoiceCreditBilling,
  voiceBilledMinute,
  voiceCallShouldStartBilling,
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
import {
  normalizeVoiceCallRoute,
  type VoiceCallRoute,
  voiceRoutePolicy,
  XAI_STANDARD_DIALOGUE_MODEL,
} from "../_shared/voice-routes.ts";
import { verifyVoiceRelayUsageProof } from "../_shared/voice-relay-token.ts";
import { normalizeChatLanguage } from "../../../packages/together-domain/src/chat-language.ts";

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
const pipelineUsage = z.object({
  proof: z.string().trim().min(32).max(128),
  sequence: z.number().int().positive().max(1_000_000),
  sttBillableMs: z.number().int().nonnegative().max(3_600_000).default(0),
  inputSpeechMs: z.number().int().nonnegative().max(3_600_000).default(0),
  dialogueInputTokens: z.number().int().nonnegative().max(2_000_000).default(0),
  dialogueCachedInputTokens: z.number().int().nonnegative().max(2_000_000).default(0),
  dialogueOutputTokens: z.number().int().nonnegative().max(100_000).default(0),
  ttsCharacters: z.number().int().nonnegative().max(60_000).default(0),
  outputAudioMs: z.number().int().nonnegative().max(3_600_000).default(0),
  discardedOutputAudioMs: z.number().int().nonnegative().max(3_600_000).default(0),
  sttFinalLatencyMs: z.number().int().nonnegative().max(120_000).optional(),
  dialogueFirstTokenLatencyMs: z.number().int().nonnegative().max(120_000).optional(),
  ttsFirstAudioLatencyMs: z.number().int().nonnegative().max(120_000).optional(),
  status: z.enum(["success", "interrupted", "failure"]),
  failureCode: z.string().trim().min(1).max(80).optional(),
});
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("options") }),
  z.object({
    action: z.literal("create"),
    characterInstanceId: z.string().uuid(),
    conversationId: z.string().uuid(),
    requestId: z.string().trim().min(8).max(120),
    route: z.enum(["standard", "express"]).default("express"),
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
    action: z.literal("pipeline_usage"),
    callSessionId: z.string().uuid(),
    event: pipelineUsage,
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

  if (input.action === "options") {
    const { data: entitlement } = await db.from("together_entitlements").select("*")
      .eq("user_id", user.id).maybeSingle();
    const voiceEntitlement = activeVoiceEntitlement(entitlement);
    const routes = await Promise.all((["standard", "express"] as const).map(async (route) => {
      const policy = voiceRoutePolicy(route, voiceEntitlement.tier);
      const billing = await resolveVoiceCreditBilling(db, user.id, 0, false, route);
      const available = Boolean(configuredRealtimeVoiceProvider(route, user.id));
      return {
        ...policy,
        available,
        ...(!available && policy.available
          ? { unavailableReason: "This voice route is not available for this account yet." }
          : {}),
        billing,
      };
    }));
    return json({ data: { routes }, correlationId }, 200, correlationId);
  }

  const continuity = await activeContinuity(db, user.id);

  if (input.action === "create") {
    await enforceRateLimit(
      db,
      user.id,
      "together_voice_call_create",
      12,
      3_600,
    );
    const [
      { data: instance },
      { data: conversation },
      { data: profile },
      { data: entitlement },
      { data: duplicate },
    ] = await Promise.all([
      db.from("together_character_instances").select("*")
        .eq("id", input.characterInstanceId).eq("user_id", user.id)
        .eq("continuity_id", continuity.id).maybeSingle(),
      db.from("together_conversations").select("*")
        .eq("id", input.conversationId).eq("user_id", user.id).eq(
          "continuity_id",
          continuity.id,
        ).eq("character_instance_id", input.characterInstanceId).maybeSingle(),
      db.from("together_profiles").select(
        "multimodal_preferences,age_verified_at,content_preferences",
      ).eq("user_id", user.id).single(),
      db.from("together_entitlements").select("*").eq("user_id", user.id)
        .maybeSingle(),
      db.from("together_voice_call_sessions").select("*")
        .eq("user_id", user.id).eq("request_id", input.requestId).maybeSingle(),
    ]);
    if (!instance) {
      throw new AppError(
        "NOT_FOUND",
        "That companion is not part of this Kivelle Life.",
        404,
      );
    }
    if (!conversation) {
      throw new AppError("NOT_FOUND", "That conversation is unavailable.", 404);
    }
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
    const route = normalizeVoiceCallRoute(input.route);
    const routePolicy = voiceRoutePolicy(route, voiceEntitlement.tier);
    const provider = configuredRealtimeVoiceProvider(route, user.id);
    if (!provider) {
      const unavailableReason = routePolicy.available
        ? "This voice route is not available for this account yet."
        : routePolicy.unavailableReason;
      return json(
        {
          data: {
            status: "not_configured",
            providerStatus: "not_configured",
            message: unavailableReason ?? `${routePolicy.displayName} Voice isn't connected yet.`,
          },
          correlationId,
        },
        200,
        correlationId,
      );
    }
    if (duplicate) {
      if (terminalStatuses.has(String(duplicate.status))) {
        return json(
          { data: { call: sanitizeCall(duplicate) }, correlationId },
          200,
          correlationId,
        );
      }
      const duplicateRoute = normalizeVoiceCallRoute(duplicate.route);
      const duplicateProvider = configuredRealtimeVoiceProvider(duplicateRoute, user.id);
      if (!duplicateProvider) throw new AppError("PROVIDER_UNAVAILABLE", "That voice route is temporarily unavailable.", 503, true);
      const prepared = await prepareProviderSession({
        db,
        userId: user.id,
        call: duplicate,
        instance,
        conversation,
        provider: duplicateProvider,
        profile,
        correlationId,
      });
      const billing = await resolveVoiceCreditBilling(
        db,
        user.id,
        duplicate.billing_started_at ? voiceMeterMinuteAvailable(duplicate.billing_started_at) : 0,
        false,
        duplicateRoute,
      );
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

    await resolveVoiceCreditBilling(db, user.id, 0, true, route);

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
      model: route === "standard" ? XAI_STANDARD_DIALOGUE_MODEL : XAI_REALTIME_VOICE_MODEL,
      route,
      billing_mode: "credits",
      credits_per_minute: routePolicy.creditsPerMinute,
      lease_expires_at: voiceCallLeaseExpiresAt("creating"),
      metadata: { contextVersion: 2, route, chatLanguage:normalizeChatLanguage(conversation.metadata?.chatPreferences?.chatLanguage), transport: route === "standard" ? "kivelle_relay_websocket_pcm16" : "websocket_json_pcm16" },
    }).select("*").single();
    if (error || !created) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The call could not be started.",
        500,
        true,
      );
    }
    try {
      const billing = await resolveVoiceCreditBilling(db, user.id, 0, false, route);
      await track(db, user.id, "voice_call_started", {
        callSessionId: id,
        characterInstanceId: input.characterInstanceId,
        creditsPerMinute: billing.creditsPerMinute,
        route,
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
      // Backward-compatible cleanup for calls created before deferred billing.
      await refundUnconnectedVoiceCallCredit(db, {
        userId: user.id,
        callSessionId: id,
      });
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
    const activeProvider = configuredRealtimeVoiceProvider(normalizeVoiceCallRoute(abandoned.route), user.id);
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
    const availableMinute = voiceMeterMinuteAvailable(call.billing_started_at);
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
      route: normalizeVoiceCallRoute(call.route),
    });
    const renewedAt = new Date();
    await db.from("together_voice_call_sessions").update({
      included_minutes_charged: billing.includedMinutesUsed,
      credits_per_minute: billing.creditsPerMinute,
      metadata: {
        ...(call.metadata ?? {}),
        billing: {
          type: "kivelle_credits_per_started_minute",
          creditsPerMinute: billing.creditsPerMinute,
          chargedMinutes: billing.chargedMinutes,
          includedMinutesUsed: billing.includedMinutesUsed,
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
    const provider = configuredRealtimeVoiceProvider(normalizeVoiceCallRoute(call.route), user.id);
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
    let transcriptCall = call;
    let billing:
      | Awaited<ReturnType<typeof chargeVoiceCallThroughMinute>>
      | undefined;
    const firstUserResponse = voiceCallShouldStartBilling(
      call.billing_started_at,
      input.events,
    );
    if (firstUserResponse) {
      billing = await chargeVoiceCallThroughMinute(db, {
        userId: user.id,
        callSessionId: String(call.id),
        throughMinute: 1,
        route: normalizeVoiceCallRoute(call.route),
      });
      const respondedAt = new Date().toISOString();
      const { data: activated, error: activationError } = await db.from(
        "together_voice_call_sessions",
      ).update({
        first_user_response_at: respondedAt,
        billing_started_at: respondedAt,
        included_minutes_charged: billing.includedMinutesUsed,
        credits_per_minute: billing.creditsPerMinute,
        metadata: {
          ...(call.metadata ?? {}),
          billing: {
            type: "kivelle_credits_per_started_minute",
            startsOn: "first_final_user_response",
            creditsPerMinute: billing.creditsPerMinute,
            chargedMinutes: billing.chargedMinutes,
            includedMinutesUsed: billing.includedMinutesUsed,
          },
        },
        updated_at: respondedAt,
      }).eq("id", call.id).eq("user_id", user.id).is(
        "billing_started_at",
        null,
      ).select("*").maybeSingle();
      if (activationError) {
        throw new AppError(
          "INTERNAL_ERROR",
          "Voice billing could not be activated.",
          500,
          true,
        );
      }
      if (activated) {
        transcriptCall = activated;
        await track(db, user.id, "voice_call_billing_started", {
          callSessionId: call.id,
          characterInstanceId: call.character_instance_id,
          route: normalizeVoiceCallRoute(call.route),
          creditsPerMinute: billing.creditsPerMinute,
        });
      } else {
        const { data: current } = await db.from("together_voice_call_sessions")
          .select("*").eq("id", call.id).eq("user_id", user.id).single();
        if (current) transcriptCall = current;
      }
    }
    const result = await ingestVoiceTranscriptEvents({
      db,
      call: transcriptCall,
      events: input.events,
    });
    return json({
      data: {
        ...result,
        call: sanitizeCall(transcriptCall),
        ...(billing ? { billing } : {}),
      },
      correlationId,
    }, 202, correlationId);
  }

  if (input.action === "pipeline_usage") {
    if (normalizeVoiceCallRoute(call.route) !== "standard") {
      throw new AppError("VALIDATION_FAILED", "Pipeline usage is only valid for Essential Voice.", 422, false);
    }
    const event = input.event;
    const relaySecret = Deno.env.get("KIVELLE_VOICE_RELAY_SIGNING_SECRET")?.trim() ?? "";
    const proofValid = await verifyVoiceRelayUsageProof({
      callSessionId: String(call.id),
      event,
      proof: event.proof,
      secret: relaySecret,
    });
    if (!proofValid) {
      throw new AppError("FORBIDDEN", "Voice usage proof is invalid.", 403, false);
    }
    const estimatedCostUsd = estimateStandardVoicePipelineCost(event);
    const { error } = await db.from("together_voice_pipeline_usage_events").upsert({
      user_id: user.id,
      call_session_id: call.id,
      sequence: event.sequence,
      route: "standard",
      stt_billable_ms: event.sttBillableMs,
      input_speech_ms: event.inputSpeechMs,
      dialogue_input_tokens: event.dialogueInputTokens,
      dialogue_cached_input_tokens: event.dialogueCachedInputTokens,
      dialogue_output_tokens: event.dialogueOutputTokens,
      tts_characters: event.ttsCharacters,
      output_audio_ms: event.outputAudioMs,
      discarded_output_audio_ms: event.discardedOutputAudioMs,
      stt_final_latency_ms: event.sttFinalLatencyMs ?? null,
      dialogue_first_token_latency_ms: event.dialogueFirstTokenLatencyMs ?? null,
      tts_first_audio_latency_ms: event.ttsFirstAudioLatencyMs ?? null,
      estimated_cost_usd: estimatedCostUsd,
      status: event.status,
      failure_code: event.failureCode ?? null,
    }, { onConflict: "call_session_id,sequence" });
    if (error) throw new AppError("INTERNAL_ERROR", "Voice usage could not be recorded.", 500, true);
    await db.from("together_voice_call_sessions").update({
      last_usage_sequence: Math.max(Number(call.last_usage_sequence ?? 0), event.sequence),
      updated_at: new Date().toISOString(),
    }).eq("id", call.id).eq("user_id", user.id);
    return json({ data: { accepted: true, sequence: event.sequence }, correlationId }, 202, correlationId);
  }

  const isFailure = input.action === "fail";
  if (call.status === "ended" || call.status === "failed") {
    return json(
      { data: { call: sanitizeCall(call) }, correlationId },
      200,
      correlationId,
    );
  }
  const activeProvider = configuredRealtimeVoiceProvider(normalizeVoiceCallRoute(call.route), user.id);
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
    86_400_000,
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
  const callRoute = normalizeVoiceCallRoute(call.route);
  let billing = await resolveVoiceCreditBilling(db, user.id, 0, false, callRoute);
  if (call.billing_started_at) {
    const billingDurationMs = Math.max(
      0,
      endedAt.getTime() - new Date(call.billing_started_at).getTime(),
    );
    const throughMinute = voiceBilledMinute(billingDurationMs);
    try {
      billing = await chargeVoiceCallThroughMinute(db, {
        userId: user.id,
        callSessionId: String(call.id),
        throughMinute,
        route: callRoute,
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
        false,
        callRoute,
      );
    }
  } else {
    // Normally a no-op for deferred-billing calls; retained so legacy sessions
    // that charged at creation are repaired when they end before a response.
    await refundUnconnectedVoiceCallCredit(db, {
      userId: user.id,
      callSessionId: String(call.id),
    });
    billing = await resolveVoiceCreditBilling(db, user.id, 0, false, callRoute);
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
  let standardPipelineCost: number | undefined;
  if (callRoute === "standard") {
    const { data: pipelineRows } = await db.from("together_voice_pipeline_usage_events")
      .select("estimated_cost_usd").eq("call_session_id", call.id).eq("user_id", user.id);
    standardPipelineCost = (pipelineRows ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.estimated_cost_usd ?? 0)), 0);
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
    route: callRoute,
    ...(standardPipelineCost == null ? {} : { estimatedCostUsdOverride: standardPipelineCost }),
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
    included_minutes_charged: billing.includedMinutesUsed,
    credits_per_minute: billing.creditsPerMinute,
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
        includedMinutesUsed: billing.includedMinutesUsed,
        includedMinutesRemaining: billing.includedMinutesRemaining,
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
  const preparationStartedAt = Date.now();
  const lifeRun = await resolveVoiceCallLifeRun({
    db: input.db,
    userId: input.userId,
    characterInstanceId: String(input.call.character_instance_id),
    instance: input.instance,
    now: new Date(),
    correlationId: input.correlationId,
    phase: "session_creation",
  });
  const storedVoicePreset = chatVoicePreset(input.conversation.metadata);
  const [context, voice] = await Promise.all([
    buildKivelleConversationContext({
      db: input.db,
      userId: input.userId,
      instance: input.instance,
      conversation: input.conversation,
      userMessage: "The user is starting a private live voice call.",
      lifeRun,
      semanticRows: [],
      now: new Date(),
      correlationId: input.correlationId,
    }),
    (async () => {
      const voicePreset = storedVoicePreset
        ? await validateCompanionVoicePreset(
          input.db,
          String(input.call.character_instance_id),
          storedVoicePreset,
        )
        : null;
      return await resolveCompanionVoiceProfile(
        input.db,
        String(input.call.character_instance_id),
        voicePreset,
      );
    })(),
  ]);
  context.contentMode = resolvedRealtimeContentMode(
    context,
    input.profile,
    input.instance,
    input.conversation,
  );
  const voiceUsageSequenceStart = Math.max(
    0,
    Number(input.call.last_usage_sequence ?? 0),
  );
  const providerStartedAt = Date.now();
  const session = await input.provider.createSession({
    callSessionId: String(input.call.id),
    voice,
    context: safeRealtimeContext({
      ...context,
      voiceUsageSequenceStart,
    }),
  });
  const providerLatencyMs = Date.now() - providerStartedAt;
  const now = new Date().toISOString();
  const rawProviderMetadata = record(session.providerMetadata);
  const providerMetadata: Record<string, any> = {
    ...rawProviderMetadata,
    startup: {
      ...record(rawProviderMetadata.startup),
      contextAndVoiceLatencyMs: providerStartedAt - preparationStartedAt,
      providerSessionLatencyMs: providerLatencyMs,
      totalPreparationLatencyMs: Date.now() - preparationStartedAt,
    },
  };
  const { data: updated, error } = await input.db.from(
    "together_voice_call_sessions",
  ).update({
    status: "connecting",
    provider_session_id: session.providerSessionId,
    relay_session_id: providerMetadata.relaySessionId ?? input.call.relay_session_id ?? null,
    model: String(
      providerMetadata.model ?? input.call.model ?? XAI_REALTIME_VOICE_MODEL,
    ),
    lease_expires_at: voiceCallLeaseExpiresAt("connecting", new Date(now)),
    metadata: {
      ...record(input.call.metadata),
      contextVersion: 2,
      route: normalizeVoiceCallRoute(input.call.route),
      chatLanguage:normalizeChatLanguage(context.chatLanguage),
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
  // Session setup only needs the latest canonical presence snapshot. Running
  // the complete world simulation here added many reads/writes to the user's
  // wait before audio could connect. Full simulation still runs during the
  // bounded post-call reconciliation phase below.
  if (input.phase === "session_creation") {
    return voiceCallFallbackLifeRun(input.instance);
  }
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
    chatLanguage: context.chatLanguage,
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
  const {
    provider_session_id: _providerSessionId,
    relay_session_id: _relaySessionId,
    ...safe
  } = call;
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
    route: normalizeVoiceCallRoute(call.route),
    connectedDurationMs: 0,
    failureCode,
  }).catch(() => undefined);
}
