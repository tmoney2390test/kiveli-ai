import { z } from "zod";
import { authenticated, enforceRateLimit } from "../_shared/context.ts";
import { parseBody } from "../_shared/body.ts";
import { json, serve } from "../_shared/http.ts";
import { AppError } from "../_shared/types.ts";
import { kickMediaDispatcher } from "../_shared/together-media-base.ts";
import { refundCredits } from "../_shared/kivelle-subscription.ts";
import {
  evaluateOperationalAlerts,
  type OperationsRole,
  recordOperationsAudit,
  requireOperationsRole,
  sanitizeOperationsText,
} from "../_shared/kivelle-ops.ts";
import {
  operationsDashboard,
  supportUserLookup,
} from "../_shared/kivelle-ops-dashboard.ts";

const ticketStatus = z.enum([
    "open",
    "in_progress",
    "waiting",
    "resolved",
    "closed",
  ]),
  ticketPriority = z.enum(["low", "normal", "high", "urgent"]),
  incidentStatus = z.enum(["open", "acknowledged", "monitoring", "resolved"]),
  incidentSeverity = z.enum(["info", "warning", "critical"]);
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("report_client_error"),
    route: z.string().max(200).default("unknown"),
    surface: z.string().max(80).default("client"),
    errorName: z.string().max(100).default("Error"),
    messageSafe: z.string().min(1).max(600),
    stackHash: z.string().max(128).optional(),
    stackSafe: z.string().max(4000).optional(),
    platform: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
    buildId: z.string().max(100).optional(),
    correlationId: z.string().max(128).optional(),
    metadata: z.record(
      z.string(),
      z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
    ).default({}),
  }),
  z.object({
    action: z.literal("client_heartbeat"),
    platform: z.string().min(1).max(40),
    appVersion: z.string().min(1).max(40),
    buildId: z.string().max(100).default("unknown"),
  }),
  z.object({
    action: z.literal("report_client_performance"),
    events: z.array(z.object({
      surface: z.string().trim().min(1).max(100),
      operation: z.string().trim().min(1).max(160),
      durationMs: z.number().int().min(0).max(600000),
      success: z.boolean(),
      statusCode: z.number().int().min(100).max(599).optional(),
      platform: z.string().trim().max(40).optional(),
      appVersion: z.string().trim().max(40).optional(),
      buildId: z.string().trim().max(100).optional(),
      metadata: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
    })).min(1).max(25),
  }),
  z.object({
    action: z.literal("create_support_ticket"),
    category: z.enum([
      "bug",
      "billing",
      "safety",
      "account",
      "feedback",
      "other",
    ]),
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(10).max(5000),
    correlationId: z.string().max(128).optional(),
    conversationId: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("my_tickets") }),
  z.object({ action: z.literal("dashboard") }),
  z.object({ action: z.literal("ticket_detail"), ticketId: z.string().uuid() }),
  z.object({
    action: z.literal("update_ticket"),
    ticketId: z.string().uuid(),
    status: ticketStatus.optional(),
    priority: ticketPriority.optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    note: z.string().trim().min(2).max(2000).optional(),
  }),
  z.object({ action: z.literal("incidents") }),
  z.object({
    action: z.literal("update_incident"),
    incidentId: z.string().uuid(),
    status: incidentStatus.optional(),
    severity: incidentSeverity.optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    note: z.string().trim().min(2).max(1000).optional(),
  }),
  z.object({
    action: z.literal("lookup_user"),
    query: z.string().trim().min(3).max(320),
  }),
  z.object({
    action: z.literal("retry_media"),
    mediaId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
    confirmTarget: z.string().uuid(),
  }),
  z.object({
    action: z.literal("fail_media_job"),
    jobId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
    confirmTarget: z.string().uuid(),
  }),
  z.object({
    action: z.literal("refund_credit"),
    userId: z.string().uuid(),
    transactionId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
    confirmTarget: z.string().uuid(),
  }),
  z.object({
    action: z.literal("invalidate_sessions"),
    userId: z.string().uuid(),
    reason: z.string().trim().min(8).max(500),
    confirmTarget: z.string().uuid(),
  }),
  z.object({
    action: z.literal("update_alert_rule"),
    ruleId: z.string().uuid(),
    enabled: z.boolean().optional(),
    threshold: z.number().finite().min(0).max(1_000_000).optional(),
    cooldownMinutes: z.number().int().min(5).max(10080).optional(),
    channels: z.array(z.enum(["dashboard", "webhook", "email"])).min(1).max(3)
      .optional(),
  }),
  z.object({ action: z.literal("evaluate_alerts") }),
  z.object({ action: z.literal("audit_log") }),
  z.object({
    action: z.literal("record_release"),
    environment: z.enum(["development", "preview", "production"]).default(
      "production",
    ),
    gitCommit: z.string().trim().min(7).max(80),
    deployId: z.string().trim().max(160).optional(),
    appVersion: z.string().trim().max(40).optional(),
    webUrl: z.string().url().max(500).optional(),
    migrationVersion: z.string().trim().max(80).optional(),
    edgeVersions: z.record(
      z.string(),
      z.union([z.string().max(100), z.number()]),
    ).default({}),
  }),
]);

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request),
    input = await parseBody(request, schema);
  if (input.action === "report_client_error") {
    await enforceRateLimit(db, user.id, "client_error_report", 30, 3600);
    const messageSafe = sanitizeOperationsText(input.messageSafe, 600),
      stackSafe = input.stackSafe
        ? sanitizeOperationsText(input.stackSafe, 4000)
        : null,
      dedupeKey = `client:${
        input.stackHash ?? `${input.route}:${input.surface}:${input.errorName}`
      }`.slice(0, 240);
    const { data: incidentId } = await db.rpc("kivelle_ops_upsert_incident", {
      p_dedupe_key: dedupeKey,
      p_source: "client_error",
      p_severity: input.surface.includes("boundary") ? "critical" : "warning",
      p_title: `${input.errorName} · ${input.route}`.slice(0, 180),
      p_summary_safe: messageSafe,
      p_correlation_id: input.correlationId ?? null,
      p_metadata: {
        surface: input.surface,
        platform: input.platform ?? "unknown",
        appVersion: input.appVersion ?? "unknown",
      },
    });
    const { error } = await db.from("together_client_error_events").insert({
      user_id: user.id,
      route: input.route,
      surface: input.surface,
      error_name: input.errorName,
      message_safe: messageSafe,
      stack_hash: input.stackHash ?? null,
      stack_safe: stackSafe,
      platform: input.platform ?? null,
      app_version: input.appVersion ?? null,
      build_id: input.buildId ?? null,
      correlation_id: input.correlationId ?? null,
      incident_id: incidentId ?? null,
      metadata: input.metadata,
    });
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Diagnostics could not be recorded.",
        500,
        true,
      );
    }
    return json({ data: { ok: true }, correlationId }, 200, correlationId);
  }
  if (input.action === "client_heartbeat") {
    await enforceRateLimit(db, user.id, "client_heartbeat", 12, 86400);
    const { error } = await db.from("together_client_sessions").upsert({
      user_id: user.id,
      platform: input.platform,
      app_version: input.appVersion,
      build_id: input.buildId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform,app_version,build_id" });
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Client version could not be recorded.",
        500,
        true,
      );
    }
    return json({ data: { ok: true }, correlationId }, 200, correlationId);
  }
  if (input.action === "report_client_performance") {
    await enforceRateLimit(db, user.id, "client_performance", 120, 3600);
    const createdAt = new Date().toISOString();
    const { error } = await db.from("together_client_performance_events").insert(
      input.events.map((event) => ({
        user_id: user.id,
        surface: event.surface,
        operation: event.operation,
        duration_ms: event.durationMs,
        success: event.success,
        status_code: event.statusCode ?? null,
        platform: event.platform ?? null,
        app_version: event.appVersion ?? null,
        build_id: event.buildId ?? null,
        metadata: event.metadata,
        created_at: createdAt,
      })),
    );
    if (error) throw new AppError("INTERNAL_ERROR", "Performance diagnostics could not be recorded.", 500, true);
    return json({ data: { accepted: input.events.length }, correlationId }, 202, correlationId);
  }
  if (input.action === "create_support_ticket") {
    await enforceRateLimit(db, user.id, "support_ticket", 8, 86400);
    if (input.conversationId) {
      const { data } = await db.from("together_conversations").select("id").eq(
        "id",
        input.conversationId,
      ).eq("user_id", user.id).maybeSingle();
      if (!data) {
        throw new AppError(
          "NOT_FOUND",
          "That conversation is unavailable.",
          404,
        );
      }
    }
    const { data, error } = await db.from("together_support_tickets").insert({
      user_id: user.id,
      category: input.category,
      subject: input.subject,
      message: input.message,
      correlation_id: input.correlationId ?? correlationId,
      conversation_id: input.conversationId ?? null,
    }).select("id,status,created_at").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Your support request could not be created.",
        500,
        true,
      );
    }
    await db.from("together_ops_ticket_events").insert({
      ticket_id: data.id,
      actor_user_id: user.id,
      event_type: "created",
      next_state: { status: data.status },
    });
    return json({ data: { ticket: data }, correlationId }, 201, correlationId);
  }
  if (input.action === "my_tickets") {
    const { data, error } = await db.from("together_support_tickets").select(
      "id,category,subject,status,priority,created_at,updated_at",
    ).eq("user_id", user.id).order("created_at", { ascending: false }).limit(
      30,
    );
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Support requests could not be loaded.",
        500,
        true,
      );
    }
    return json(
      { data: { tickets: data ?? [] }, correlationId },
      200,
      correlationId,
    );
  }

  const role = requireOperationsRole(user, "viewer");
  if (input.action === "dashboard") {
    return json(
      { data: await operationsDashboard(db, role), correlationId },
      200,
      correlationId,
    );
  }
  if (input.action === "incidents") {
    const { data, error } = await db.from("together_ops_incidents").select("*")
      .order("last_seen_at", { ascending: false }).limit(150);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Incidents could not be loaded.",
        500,
        true,
      );
    }
    return json(
      { data: { incidents: data ?? [] }, correlationId },
      200,
      correlationId,
    );
  }
  if (input.action === "ticket_detail") {
    requireMinimumRole(role, "support");
    const [ticket, events] = await Promise.all([
      db.from("together_support_tickets").select(
        "id,user_id,category,subject,message,status,priority,correlation_id,conversation_id,assigned_to,tags,first_response_at,resolved_at,incident_id,created_at,updated_at",
      ).eq("id", input.ticketId).maybeSingle(),
      db.from("together_ops_ticket_events").select("*").eq(
        "ticket_id",
        input.ticketId,
      ).order("created_at", { ascending: true }),
    ]);
    if (ticket.error || events.error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The support request could not be loaded.",
        500,
        true,
      );
    }
    if (!ticket.data) {
      throw new AppError(
        "NOT_FOUND",
        "That support request is unavailable.",
        404,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "support_ticket_viewed",
      targetType: "support_ticket",
      targetId: input.ticketId,
      requestId: correlationId,
    });
    return json(
      {
        data: { ticket: ticket.data, events: events.data ?? [] },
        correlationId,
      },
      200,
      correlationId,
    );
  }
  if (input.action === "update_ticket") {
    requireMinimumRole(role, "support");
    const { data: before, error: loadError } = await db.from(
      "together_support_tickets",
    ).select("*").eq("id", input.ticketId).maybeSingle();
    if (loadError) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The support request could not be loaded.",
        500,
        true,
      );
    }
    if (!before) {
      throw new AppError(
        "NOT_FOUND",
        "That support request is unavailable.",
        404,
      );
    }
    const now = new Date().toISOString(),
      patch: Record<string, unknown> = { updated_at: now };
    if (input.status) {
      patch.status = input.status;
      patch.resolved_at = ["resolved", "closed"].includes(input.status)
        ? now
        : null;
    }
    if (input.priority) patch.priority = input.priority;
    if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
    if (input.tags) {
      patch.tags = [...new Set(input.tags.map((tag) => tag.toLowerCase()))];
    }
    if (input.note && !before.first_response_at) patch.first_response_at = now;
    const { data, error } = await db.from("together_support_tickets").update(
      patch,
    ).eq("id", input.ticketId).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The support request could not be updated.",
        500,
        true,
      );
    }
    await db.from("together_ops_ticket_events").insert({
      ticket_id: input.ticketId,
      actor_user_id: user.id,
      event_type: input.note
        ? "note"
        : input.status && input.status !== before.status
        ? "status"
        : input.priority && input.priority !== before.priority
        ? "priority"
        : input.assignedTo !== undefined
        ? "assignment"
        : "tag",
      note_safe: input.note ? sanitizeOperationsText(input.note, 2000) : null,
      previous_state: ticketState(before),
      next_state: ticketState(data),
    });
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "support_ticket_updated",
      targetType: "support_ticket",
      targetId: input.ticketId,
      requestId: correlationId,
      reasonSafe: input.note ?? null,
      metadata: {
        status: String(data.status),
        priority: String(data.priority),
      },
    });
    return json({ data: { ticket: data }, correlationId }, 200, correlationId);
  }
  if (input.action === "update_incident") {
    requireMinimumRole(role, "support");
    const { data: before } = await db.from("together_ops_incidents").select("*")
      .eq("id", input.incidentId).maybeSingle();
    if (!before) {
      throw new AppError("NOT_FOUND", "That incident is unavailable.", 404);
    }
    const now = new Date().toISOString(),
      patch: Record<string, unknown> = { updated_at: now };
    if (input.status) {
      patch.status = input.status;
      patch.acknowledged_at =
        input.status === "acknowledged" && !before.acknowledged_at
          ? now
          : before.acknowledged_at;
      patch.resolved_at = input.status === "resolved" ? now : null;
    }
    if (input.severity) patch.severity = input.severity;
    if (input.assignedTo !== undefined) {
      patch.assignee_user_id = input.assignedTo;
    }
    const { data, error } = await db.from("together_ops_incidents").update(
      patch,
    ).eq("id", input.incidentId).select("*").single();
    if (error || !data) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The incident could not be updated.",
        500,
        true,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "incident_updated",
      targetType: "incident",
      targetId: input.incidentId,
      requestId: correlationId,
      reasonSafe: input.note ?? null,
      metadata: {
        status: String(data.status),
        severity: String(data.severity),
      },
    });
    return json(
      { data: { incident: data }, correlationId },
      200,
      correlationId,
    );
  }
  if (input.action === "lookup_user") {
    requireMinimumRole(role, "support");
    const result = await supportUserLookup(db, input.query);
    if (!result) {
      throw new AppError(
        "NOT_FOUND",
        "No account matched that exact email or user ID.",
        404,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "support_user_lookup",
      targetType: "user",
      targetId: String(result.account.userId),
      requestId: correlationId,
    });
    return json({ data: result, correlationId }, 200, correlationId);
  }
  if (input.action === "retry_media") {
    requireMinimumRole(role, "support");
    confirmTarget(input.confirmTarget, input.mediaId);
    const { data: media } = await db.from("together_generated_media").select(
      "*",
    ).eq("id", input.mediaId).maybeSingle();
    if (!media) {
      throw new AppError(
        "NOT_FOUND",
        "That media request is unavailable.",
        404,
      );
    }
    if (media.status !== "failed") {
      throw new AppError(
        "CONFLICT",
        "Only a failed media request can be requeued.",
        409,
      );
    }
    const now = new Date().toISOString(),
      metadata = {
        ...((media.metadata ?? {}) as Record<string, unknown>),
        opsRecovery: {
          actorUserId: user.id,
          at: now,
          priorFailureCode: media.failure_code,
        },
      },
      { data: updated, error } = await db.from("together_generated_media")
        .update({
          status: "queued",
          failure_code: null,
          failure_reason_safe: null,
          claimed_at: null,
          next_attempt_at: null,
          metadata,
          updated_at: now,
        }).eq("id", input.mediaId).eq("status", "failed").select(
          "id,user_id,status",
        ).single();
    if (error || !updated) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The media request could not be requeued.",
        500,
        true,
      );
    }
    if (media.media_offer_id) {
      await db.from("together_media_offers").update({
        status: "accepted",
        failure_code: null,
        failure_reason_safe: null,
        updated_at: now,
      }).eq("id", String(media.media_offer_id)).eq(
        "generated_media_id",
        media.id,
      );
    }
    await kickMediaDispatcher();
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "media_requeued",
      targetType: "generated_media",
      targetId: input.mediaId,
      requestId: correlationId,
      reasonSafe: input.reason,
      metadata: { affectedUserId: String(media.user_id) },
    });
    return json(
      { data: { media: updated }, correlationId },
      202,
      correlationId,
    );
  }
  if (input.action === "fail_media_job") {
    requireMinimumRole(role, "admin");
    confirmTarget(input.confirmTarget, input.jobId);
    const { data: job } = await db.from("together_media_provider_jobs").select(
      "id,user_id,status",
    ).eq("id", input.jobId).maybeSingle();
    if (!job) {
      throw new AppError("NOT_FOUND", "That provider job is unavailable.", 404);
    }
    if (["completed", "failed", "cancelled"].includes(String(job.status))) {
      throw new AppError(
        "CONFLICT",
        "That provider job has already ended.",
        409,
      );
    }
    const { data: recovery, error: recoveryError } = await db.rpc(
      "kivelle_ops_terminate_media_job",
      {
        p_job_id: input.jobId,
        p_failure_code: "OPS_TERMINATED",
        p_failure_reason_safe:
          "The media request could not be completed. Your credits were returned.",
      },
    );
    if (recoveryError) {
      throw new AppError(
        "INTERNAL_ERROR",
        "That provider job could not be ended safely.",
        500,
        true,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "media_job_terminated",
      targetType: "media_provider_job",
      targetId: input.jobId,
      requestId: correlationId,
      reasonSafe: input.reason,
      metadata: { affectedUserId: String(job.user_id) },
    });
    return json({ data: recovery, correlationId }, 200, correlationId);
  }
  if (input.action === "refund_credit") {
    requireMinimumRole(role, "admin");
    confirmTarget(input.confirmTarget, input.transactionId);
    const { data: transaction } = await db.from("together_credit_ledger")
      .select("id,user_id,event_type").eq("id", input.transactionId).eq(
        "user_id",
        input.userId,
      ).maybeSingle();
    if (!transaction) {
      throw new AppError(
        "NOT_FOUND",
        "That credit transaction is unavailable.",
        404,
      );
    }
    if (transaction.event_type !== "spend") {
      throw new AppError(
        "CONFLICT",
        "Only an exact spend transaction can be refunded.",
        409,
      );
    }
    const refunded = await refundCredits(db, {
      userId: input.userId,
      transactionId: input.transactionId,
      idempotencyKey: `ops-refund:${input.transactionId}`,
      metadata: { reason: "ops_support_refund", actorUserId: user.id },
    });
    if (!refunded) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The exact credit transaction could not be refunded.",
        500,
        true,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "credit_transaction_refunded",
      targetType: "credit_transaction",
      targetId: input.transactionId,
      requestId: correlationId,
      reasonSafe: input.reason,
      metadata: { affectedUserId: input.userId },
    });
    return json(
      { data: { refunded: true }, correlationId },
      200,
      correlationId,
    );
  }
  if (input.action === "invalidate_sessions") {
    requireMinimumRole(role, "admin");
    confirmTarget(input.confirmTarget, input.userId);
    const { data: account, error: accountError } = await db.auth.admin
      .getUserById(input.userId);
    if (accountError || !account.user) {
      throw new AppError("NOT_FOUND", "That account is unavailable.", 404);
    }
    const invalidatedAt = new Date().toISOString(),
      { error } = await db.auth.admin.updateUserById(input.userId, {
        app_metadata: {
          ...(account.user.app_metadata ?? {}),
          together_sessions_invalid_before: invalidatedAt,
        },
      });
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Account sessions could not be invalidated.",
        500,
        true,
      );
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "sessions_invalidated",
      targetType: "user",
      targetId: input.userId,
      requestId: correlationId,
      reasonSafe: input.reason,
    });
    return json({ data: { invalidatedAt }, correlationId }, 200, correlationId);
  }
  if (input.action === "update_alert_rule") {
    requireMinimumRole(role, "admin");
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.threshold !== undefined) patch.threshold = input.threshold;
    if (input.cooldownMinutes !== undefined) {
      patch.cooldown_minutes = input.cooldownMinutes;
    }
    if (input.channels) patch.channels = [...new Set(input.channels)];
    const { data, error } = await db.from("together_ops_alert_rules").update(
      patch,
    ).eq("id", input.ruleId).select("*").maybeSingle();
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The alert rule could not be updated.",
        500,
        true,
      );
    }
    if (!data) {
      throw new AppError("NOT_FOUND", "That alert rule is unavailable.", 404);
    }
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "alert_rule_updated",
      targetType: "alert_rule",
      targetId: input.ruleId,
      requestId: correlationId,
      metadata: {
        enabled: Boolean(data.enabled),
        threshold: Number(data.threshold),
      },
    });
    return json({ data: { rule: data }, correlationId }, 200, correlationId);
  }
  if (input.action === "evaluate_alerts") {
    requireMinimumRole(role, "admin");
    const result = await evaluateOperationalAlerts(db, {
      deliver: true,
      trigger: "manual",
    });
    await recordOperationsAudit(db, {
      actorUserId: user.id,
      actorRole: role,
      action: "manual_alert_evaluation",
      targetType: "alert_batch",
      requestId: correlationId,
      metadata: result,
    });
    return json({ data: result, correlationId }, 200, correlationId);
  }
  if (input.action === "audit_log") {
    requireMinimumRole(role, "admin");
    const { data, error } = await db.from("together_ops_audit_log").select("*")
      .order("created_at", { ascending: false }).limit(250);
    if (error) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The operations audit trail could not be loaded.",
        500,
        true,
      );
    }
    return json(
      { data: { audit: data ?? [] }, correlationId },
      200,
      correlationId,
    );
  }
  requireMinimumRole(role, "admin");
  const { data, error } = await db.from("together_ops_release_records").upsert({
    environment: input.environment,
    git_commit: input.gitCommit,
    deploy_id: input.deployId ?? null,
    app_version: input.appVersion ?? null,
    web_url: input.webUrl ?? null,
    migration_version: input.migrationVersion ?? null,
    edge_versions: input.edgeVersions,
    released_by: user.id,
    released_at: new Date().toISOString(),
  }, { onConflict: "environment,git_commit,deploy_id" }).select("*").single();
  if (error || !data) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The release record could not be saved.",
      500,
      true,
    );
  }
  await recordOperationsAudit(db, {
    actorUserId: user.id,
    actorRole: role,
    action: "release_recorded",
    targetType: "release",
    targetId: String(data.id),
    requestId: correlationId,
    metadata: {
      environment: input.environment,
      gitCommit: input.gitCommit,
      deployId: input.deployId ?? null,
    },
  });
  return json({ data: { release: data }, correlationId }, 201, correlationId);
});

function ticketState(row: Record<string, unknown>) {
  return {
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to ?? null,
    tags: row.tags ?? [],
  };
}
function confirmTarget(actual: string, expected: string) {
  if (actual !== expected) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Confirm the exact target before continuing.",
      422,
    );
  }
}
function requireMinimumRole(actual: OperationsRole, required: OperationsRole) {
  const rank = { viewer: 1, support: 2, admin: 3 };
  if (rank[actual] < rank[required]) {
    throw new AppError(
      "FORBIDDEN",
      `${
        required === "admin" ? "Administrator" : "Support"
      } access is required.`,
      403,
    );
  }
}
