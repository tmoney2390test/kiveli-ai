import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AppError } from "./types.ts";

export type OperationsRole = "viewer" | "support" | "admin";
export type OperationalMetricKey =
  | "media_oldest_seconds"
  | "media_failures_15m"
  | "ai_failure_rate_15m"
  | "ai_p95_latency_ms_15m"
  | "voice_failures_30m"
  | "push_failures_30m"
  | "refunds_24h"
  | "auth_client_errors_15m"
  | "photo_cleanup_failures_30m"
  | "dialogue_oldest_seconds"
  | "proactive_oldest_seconds";

const roleRank: Record<OperationsRole, number> = {
  viewer: 1,
  support: 2,
  admin: 3,
};

export function operationsRoleForUser(
  user: Pick<User, "id" | "app_metadata">,
): OperationsRole | null {
  const allowed = (Deno.env.get("TOGETHER_ADMIN_USER_IDS") ??
    Deno.env.get("TOGETHER_DEBUG_USER_IDS") ?? "").split(",").map((value) =>
      value.trim()
    ).filter(Boolean);
  if (allowed.includes(user.id) || user.app_metadata?.together_admin === true) {
    return "admin";
  }
  const configured = String(user.app_metadata?.together_ops_role ?? "")
    .toLowerCase();
  if (
    configured === "admin" || configured === "support" ||
    configured === "viewer"
  ) return configured;
  if (user.app_metadata?.together_internal === true) return "viewer";
  return null;
}

export function requireOperationsRole(
  user: Pick<User, "id" | "app_metadata">,
  minimum: OperationsRole = "viewer",
): OperationsRole {
  const role = operationsRoleForUser(user);
  if (!role || roleRank[role] < roleRank[minimum]) {
    throw new AppError(
      "FORBIDDEN",
      `${
        minimum === "admin"
          ? "Administrator"
          : minimum === "support"
          ? "Support"
          : "Operations"
      } access is required.`,
      403,
    );
  }
  return role;
}

export function compareOperationalAlert(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  if (operator === "lte") return value <= threshold;
  if (operator === "eq") return value === threshold;
  return false;
}

export function sanitizeOperationsText(value: string, limit: number): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[secret]").replace(
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    "Bearer [redacted]",
  ).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(
    /[\r\n]{3,}/g,
    "\n\n",
  ).slice(0, limit);
}

export async function recordOperationsAudit(
  db: SupabaseClient,
  input: {
    actorUserId?: string | null;
    actorRole: OperationsRole | "system";
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    requestId?: string | null;
    reasonSafe?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("together_ops_audit_log").insert({
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole,
    action: input.action.slice(0, 120),
    target_type: input.targetType?.slice(0, 80) ?? null,
    target_id: input.targetId?.slice(0, 200) ?? null,
    request_id: input.requestId?.slice(0, 160) ?? null,
    reason_safe: input.reasonSafe
      ? sanitizeOperationsText(input.reasonSafe, 1000)
      : null,
    metadata: safeAuditMetadata(input.metadata ?? {}),
  });
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The operations audit record could not be written.",
      500,
      true,
    );
  }
}

export function operationalAlertConfiguration() {
  return {
    webhook: Boolean(Deno.env.get("KIVELLE_OPS_ALERT_WEBHOOK_URL")),
    email: Boolean(
      Deno.env.get("RESEND_API_KEY") &&
        Deno.env.get("KIVELLE_OPS_ALERT_EMAIL") &&
        Deno.env.get("KIVELLE_OPS_ALERT_FROM"),
    ),
  };
}

export async function collectOperationalAlertMetrics(
  db: SupabaseClient,
  now = new Date(),
): Promise<Record<OperationalMetricKey, number>> {
  const since15 = new Date(now.getTime() - 15 * 60_000).toISOString(),
    since30 = new Date(now.getTime() - 30 * 60_000).toISOString(),
    since24 = new Date(now.getTime() - 24 * 60 * 60_000).toISOString(),
    nowIso = now.toISOString();
  const [
    mediaOldest,
    dialogueOldest,
    proactiveOldest,
    mediaFailures,
    ai,
    voiceFailures,
    pushFailures,
    refunds,
    authErrors,
    photoCleanupCycles,
  ] = await Promise.all([
    db.from("together_generated_media").select("created_at").in("status", [
      "queued",
      "generating",
    ]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    db.from("together_dialogue_turns").select("created_at").in("state", [
      "planning",
      "generating",
    ]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    db.from("together_proactive_messages").select("eligible_at").eq(
      "status",
      "queued",
    ).lte("eligible_at", nowIso).order("eligible_at", { ascending: true })
      .limit(1).maybeSingle(),
    db.from("together_generated_media").select("id", {
      head: true,
      count: "exact",
    }).eq("status", "failed").gte("updated_at", since15),
    db.from("together_ai_usage_events").select("success,latency_ms").gte(
      "created_at",
      since15,
    ).limit(5000),
    db.from("together_voice_call_sessions").select("id", {
      head: true,
      count: "exact",
    }).eq("status", "failed").gte("updated_at", since30),
    db.from("together_push_deliveries").select("id", {
      head: true,
      count: "exact",
    }).eq("status", "failed").gte("updated_at", since30),
    db.from("together_credit_ledger").select("id", {
      head: true,
      count: "exact",
    }).eq("event_type", "refund").gte("created_at", since24),
    db.from("together_client_error_events").select("id", {
      head: true,
      count: "exact",
    }).or("route.ilike.%auth%,surface.ilike.%auth%").gte("created_at", since15),
    db.from("together_analytics_events").select("properties").eq("event_name","chat_photo_cleanup_cycle").gte("created_at",since30).limit(100),
  ]);
  const failed = [
    mediaOldest,
    dialogueOldest,
    proactiveOldest,
    mediaFailures,
    ai,
    voiceFailures,
    pushFailures,
    refunds,
    authErrors,
    photoCleanupCycles,
  ].find((result) => result.error);
  if (failed?.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Operational alert metrics could not be collected.",
      500,
      true,
    );
  }
  const aiRows = ai.data ?? [],
    latencies = aiRows.map((row) => Number(row.latency_ms ?? 0)).filter((
      value,
    ) => value > 0).sort((a, b) => a - b),
    aiFailures = aiRows.filter((row) => row.success === false).length;
  return {
    media_oldest_seconds: ageSeconds(mediaOldest.data?.created_at, now),
    media_failures_15m: Number(mediaFailures.count ?? 0),
    ai_failure_rate_15m: aiRows.length ? aiFailures / aiRows.length * 100 : 0,
    ai_p95_latency_ms_15m: latencies.length
      ? (latencies[
        Math.min(latencies.length - 1, Math.floor(latencies.length * .95))
      ] ?? 0)
      : 0,
    voice_failures_30m: Number(voiceFailures.count ?? 0),
    push_failures_30m: Number(pushFailures.count ?? 0),
    refunds_24h: Number(refunds.count ?? 0),
    auth_client_errors_15m: Number(authErrors.count ?? 0),
    photo_cleanup_failures_30m: sumPhotoCleanupFailures(photoCleanupCycles.data??[]),
    dialogue_oldest_seconds: ageSeconds(dialogueOldest.data?.created_at, now),
    proactive_oldest_seconds: ageSeconds(
      proactiveOldest.data?.eligible_at,
      now,
    ),
  };
}

export function sumPhotoCleanupFailures(rows:Array<{properties?:unknown}>):number{return rows.reduce((total,row)=>{const properties=row.properties&&typeof row.properties==='object'&&!Array.isArray(row.properties)?row.properties as Record<string,unknown>:{};const failures=Number(properties.failures??0);return total+(Number.isFinite(failures)&&failures>0?failures:0);},0);}

export async function evaluateOperationalAlerts(
  db: SupabaseClient,
  input: {
    deliver: boolean;
    trigger: "scheduled" | "manual" | "dashboard";
    now?: Date;
  },
): Promise<
  {
    metrics: Record<OperationalMetricKey, number>;
    triggered: number;
    resolved: number;
    delivered: number;
  }
> {
  const now = input.now ?? new Date(),
    metrics = await collectOperationalAlertMetrics(db, now),
    { data: rules, error } = await db.from("together_ops_alert_rules").select(
      "*",
    ).eq("enabled", true).order("severity", { ascending: false });
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Operational alert rules could not be loaded.",
      500,
      true,
    );
  }
  let triggered = 0, resolved = 0, delivered = 0;
  for (const rule of rules ?? []) {
    const metric = String(rule.metric) as OperationalMetricKey;
    if (!(metric in metrics)) continue;
    const value = metrics[metric],
      isTriggered = compareOperationalAlert(
        value,
        String(rule.operator),
        Number(rule.threshold),
      );
    if (!isTriggered) {
      const { data: incident } = await db.from("together_ops_incidents").select(
        "id,status",
      ).eq("dedupe_key", `alert:${rule.slug}`).maybeSingle();
      if (incident && incident.status !== "resolved") {
        const resolvedAt = now.toISOString();
        await db.from("together_ops_incidents").update({
          status: "resolved",
          resolved_at: resolvedAt,
          updated_at: resolvedAt,
        }).eq("id", incident.id);
        await db.from("together_ops_alert_events").insert({
          alert_rule_id: rule.id,
          incident_id: incident.id,
          metric_value: value,
          threshold: rule.threshold,
          status: "resolved",
          channels: [],
          triggered_at: resolvedAt,
          resolved_at: resolvedAt,
          delivery_metadata: { trigger: input.trigger },
        });
        resolved += 1;
      }
      continue;
    }
    const cooldownMs = Number(rule.cooldown_minutes ?? 60) * 60_000,
      last = rule.last_triggered_at
        ? new Date(rule.last_triggered_at).getTime()
        : 0;
    if (last && now.getTime() - last < cooldownMs) continue;
    const { data: incidentId, error: incidentError } = await db.rpc(
      "kivelle_ops_upsert_incident",
      {
        p_dedupe_key: `alert:${rule.slug}`,
        p_source: "alert",
        p_severity: rule.severity,
        p_title: rule.name,
        p_summary_safe: `${metric} is ${
          formatMetric(value)
        }; threshold ${rule.operator} ${formatMetric(Number(rule.threshold))}.`,
        p_correlation_id: null,
        p_metadata: { metric, trigger: input.trigger },
      },
    );
    if (incidentError || !incidentId) {
      throw new AppError(
        "INTERNAL_ERROR",
        "An operational incident could not be created.",
        500,
        true,
      );
    }
    const channels = Array.isArray(rule.channels)
        ? rule.channels.map(String)
        : ["dashboard"],
      { data: event, error: eventError } = await db.from(
        "together_ops_alert_events",
      ).insert({
        alert_rule_id: rule.id,
        incident_id: incidentId,
        metric_value: value,
        threshold: rule.threshold,
        status: "triggered",
        channels,
        triggered_at: now.toISOString(),
        delivery_metadata: { trigger: input.trigger },
      }).select("id").single();
    if (eventError || !event) {
      throw new AppError(
        "INTERNAL_ERROR",
        "An operational alert event could not be recorded.",
        500,
        true,
      );
    }
    let delivery = {
      status: "delivered",
      metadata: { dashboard: "recorded" } as Record<string, unknown>,
    };
    if (input.deliver) {
      delivery = await deliverAlert(rule, value, String(incidentId));
    }
    await db.from("together_ops_alert_events").update({
      status: delivery.status,
      delivery_metadata: { trigger: input.trigger, ...delivery.metadata },
    }).eq("id", event.id);
    await db.from("together_ops_alert_rules").update({
      last_triggered_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", rule.id);
    triggered += 1;
    if (delivery.status === "delivered") delivered += 1;
  }
  if (triggered || resolved) {
    await recordOperationsAudit(db, {
      actorRole: "system",
      action: "alerts_evaluated",
      targetType: "alert_batch",
      metadata: { trigger: input.trigger, triggered, resolved, delivered },
    });
  }
  return { metrics, triggered, resolved, delivered };
}

async function deliverAlert(
  rule: Record<string, any>,
  value: number,
  incidentId: string,
): Promise<
  {
    status: "delivered" | "partial" | "skipped" | "failed";
    metadata: Record<string, unknown>;
  }
> {
  const requested = Array.isArray(rule.channels)
      ? rule.channels.map(String)
      : ["dashboard"],
    metadata: Record<string, unknown> = { dashboard: "recorded" };
  let requestedExternal = 0, succeeded = 0;
  const publicAppUrl =
      (Deno.env.get("KIVELLE_PUBLIC_APP_URL") || "https://kivelli.app")
        .replace(/\/+$/, ""),
    dashboardUrl = `${publicAppUrl}/ops`,
    payload = {
      event: "kivelle_ops_alert",
      name: String(rule.name),
      severity: String(rule.severity),
      metric: String(rule.metric),
      value,
      threshold: Number(rule.threshold),
      incidentId,
      occurredAt: new Date().toISOString(),
      dashboardUrl,
    };
  if (requested.includes("webhook")) {
    requestedExternal += 1;
    const url = Deno.env.get("KIVELLE_OPS_ALERT_WEBHOOK_URL");
    if (!url) metadata.webhook = "not_configured";
    else {try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        metadata.webhook = response.ok
          ? "delivered"
          : `http_${response.status}`;
        if (response.ok) succeeded += 1;
      } catch {
        metadata.webhook = "failed";
      }}
  }
  if (requested.includes("email")) {
    requestedExternal += 1;
    const apiKey = Deno.env.get("RESEND_API_KEY"),
      to = Deno.env.get("KIVELLE_OPS_ALERT_EMAIL"),
      from = Deno.env.get("KIVELLE_OPS_ALERT_FROM");
    if (!apiKey || !to || !from) metadata.email = "not_configured";
    else {try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: to.split(",").map((item) => item.trim()).filter(Boolean),
            subject: `[${
              String(rule.severity).toUpperCase()
            }] Kivelle · ${rule.name}`,
            text: `${rule.name}\n${rule.metric}: ${
              formatMetric(value)
            }\nIncident: ${incidentId}\nOpen: ${dashboardUrl}`,
          }),
          signal: AbortSignal.timeout(8000),
        });
        metadata.email = response.ok ? "delivered" : `http_${response.status}`;
        if (response.ok) succeeded += 1;
      } catch {
        metadata.email = "failed";
      }}
  }
  if (!requestedExternal) return { status: "delivered", metadata };
  if (succeeded === requestedExternal) return { status: "delivered", metadata };
  if (succeeded > 0) return { status: "partial", metadata };
  if (Object.values(metadata).some((item) => item === "not_configured")) {
    return { status: "skipped", metadata };
  }
  return { status: "failed", metadata };
}

function ageSeconds(value: unknown, now: Date) {
  if (!value) return 0;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / 1000))
    : 0;
}
function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
function safeAuditMetadata(input: Record<string, unknown>) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    if (
      value === null || typeof value === "number" || typeof value === "boolean"
    ) output[key.slice(0, 80)] = value;
    else if (typeof value === "string") {
      output[key.slice(0, 80)] = sanitizeOperationsText(value, 300);
    }
  }
  return output;
}
