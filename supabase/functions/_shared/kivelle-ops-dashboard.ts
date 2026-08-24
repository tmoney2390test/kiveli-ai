import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./types.ts";
import {
  operationalAlertConfiguration,
  type OperationsRole,
} from "./kivelle-ops.ts";

export async function operationsDashboard(
  db: SupabaseClient,
  role: OperationsRole,
) {
  const now = Date.now(),
    since24 = new Date(now - 86400000).toISOString(),
    since7 = new Date(now - 7 * 86400000).toISOString();
  const [
    errors24,
    errors7,
    openTickets,
    newUsers,
    runtimeRollup,
    recentErrors,
    recentTickets,
    incidents,
    alertRules,
    alertEvents,
    releases,
    migration,
    queueRollup,
    audit,
  ] = await Promise.all([
    count(
      db,
      "together_client_error_events",
      (query) => query.gte("created_at", since24),
    ),
    count(
      db,
      "together_client_error_events",
      (query) => query.gte("created_at", since7),
    ),
    count(
      db,
      "together_support_tickets",
      (query) => query.in("status", ["open", "in_progress", "waiting"]),
    ),
    count(db, "together_profiles", (query) => query.gte("created_at", since24)),
    db.rpc("kivelle_ops_runtime_rollup", { p_since: since24 }),
    db.from("together_client_error_events").select(
      "id,incident_id,route,surface,error_name,message_safe,stack_hash,platform,app_version,build_id,correlation_id,created_at",
    ).order("created_at", { ascending: false }).limit(60),
    db.from("together_support_tickets").select(
      "id,user_id,category,subject,message,status,priority,assigned_to,tags,correlation_id,incident_id,created_at,updated_at",
    ).order("updated_at", { ascending: false }).limit(100),
    db.from("together_ops_incidents").select("*").order("last_seen_at", {
      ascending: false,
    }).limit(100),
    db.from("together_ops_alert_rules").select("*").order("severity", {
      ascending: false,
    }),
    db.from("together_ops_alert_events").select("*").order("triggered_at", {
      ascending: false,
    }).limit(100),
    db.from("together_ops_release_records").select("*").order("released_at", {
      ascending: false,
    }).limit(20),
    db.rpc("kivelle_ops_latest_migration"),
    db.rpc("kivelle_ops_queue_rollup", { p_since: since24 }),
    role === "admin"
      ? db.from("together_ops_audit_log").select("*").order("created_at", {
        ascending: false,
      }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const queried = [
      runtimeRollup,
      recentErrors,
      recentTickets,
      incidents,
      alertRules,
      alertEvents,
      releases,
      migration,
      queueRollup,
      audit,
    ],
    failed = queried.find((item) => item.error);
  if (failed?.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Operations telemetry could not be loaded.",
      500,
      true,
    );
  }
  const runtime = (runtimeRollup.data ?? {}) as Record<string, any>,
    ai = (runtime.ai ?? {}) as Record<string, any>,
    queues = Array.isArray(queueRollup.data) ? queueRollup.data : [],
    openIncidents = (incidents.data ?? []).filter((item) =>
      item.status !== "resolved"
    ),
    criticalIncidents =
      openIncidents.filter((item) => item.severity === "critical").length;
  const mediaFailed =
      queues.find((queue) => queue.key === "media")?.failed24h ?? 0,
    mediaStale = queues.find((queue) => queue.key === "media")?.stale ?? 0,
    callFailed = queues.find((queue) => queue.key === "calls")?.failed24h ?? 0,
    pushFailed = queues.find((queue) => queue.key === "push")?.failed24h ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    access: {
      role,
      permissions: {
        view: true,
        support: role !== "viewer",
        admin: role === "admin",
      },
    },
    health: {
      status: criticalIncidents > 0 || mediaStale + callFailed + pushFailed > 0
        ? "attention"
        : "healthy",
      openIncidents: openIncidents.length,
      criticalIncidents,
    },
    metrics: {
      clientErrors24h: errors24,
      clientErrors7d: errors7,
      openSupportTickets: openTickets,
      newAccounts24h: newUsers,
      mediaActive: queues.find((queue) => queue.key === "media")?.active ?? 0,
      mediaFailed24h: mediaFailed,
      mediaStale,
      activeCalls: queues.find((queue) => queue.key === "calls")?.active ?? 0,
      failedCalls24h: callFailed,
      pushFailures24h: pushFailed,
      aiRequests24h: Number(ai.requests ?? 0),
      aiSuccessRate: Number(ai.requests ?? 0) ? Number(ai.successes ?? 0) / Number(ai.requests) : 1,
      aiP95LatencyMs: Number(ai.p95LatencyMs ?? 0),
      providerCost24h: Number(ai.cost ?? 0),
    },
    queues,
    providerHealth: Array.isArray(runtime.providerHealth) ? runtime.providerHealth : [],
    clientPerformance: Array.isArray(runtime.clientSurfaces) ? runtime.clientSurfaces : [],
    recentErrors: recentErrors.data ?? [],
    supportTickets: recentTickets.data ?? [],
    incidents: incidents.data ?? [],
    alertRules: alertRules.data ?? [],
    alertEvents: alertEvents.data ?? [],
    alertConfiguration: operationalAlertConfiguration(),
    releases: releases.data ?? [],
    releaseHealth: {
      runtimeCommit: Deno.env.get("KIVELLE_RELEASE_COMMIT") ?? null,
      runtimeDeployId: Deno.env.get("KIVELLE_WEB_DEPLOYMENT_ID") ?? null,
      latestMigration: migration.data ?? null,
      clientVersions: Array.isArray(runtime.clientVersions) ? runtime.clientVersions : [],
    },
    audit: audit.data ?? [],
    note:
      "No prompts, chat messages, transcripts, media URLs, provider payloads, user Persona, memories, or content preferences are included.",
  };
}

export async function supportUserLookup(db: SupabaseClient, query: string) {
  const { data: found, error } = await db.rpc("kivelle_ops_find_user", {
    p_query: query,
  });
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The account lookup could not be completed.",
      500,
      true,
    );
  }
  const account = Array.isArray(found) ? found[0] : found;
  if (!account) return null;
  const id = String(account.user_id),
    since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const [
    profile,
    entitlement,
    credits,
    ledger,
    media,
    calls,
    ai,
    sessions,
    tickets,
    errors,
  ] = await Promise.all([
    db.from("together_profiles").select(
      "created_at,updated_at,onboarding_completed_at,age_verified_at,experience_timezone",
    ).eq("user_id", id).maybeSingle(),
    db.from("together_entitlements").select(
      "tier,billing_provider,product_key,billing_status,billing_period_start,billing_period_end,expires_at,updated_at",
    ).eq("user_id", id).maybeSingle(),
    db.from("together_credit_accounts").select(
      "permanent_balance,subscription_balance,subscription_expires_at,updated_at",
    ).eq("user_id", id).maybeSingle(),
    db.from("together_credit_ledger").select(
      "id,event_type,permanent_delta,subscription_delta,reference_type,reference_id,created_at",
    ).eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("together_generated_media").select(
      "id,media_type,status,provider,failure_code,attempt_count,generation_ms,created_at,updated_at",
    ).eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    db.from("together_voice_call_sessions").select(
      "id,status,provider,model,failure_code,connected_duration_ms,reconnect_count,created_at,updated_at",
    ).eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("together_ai_usage_events").select(
      "id,provider,model,operation,success,latency_ms,error_code,created_at",
    ).eq("user_id", id).gte("created_at", since7).order("created_at", {
      ascending: false,
    }).limit(100),
    db.from("together_client_sessions").select(
      "platform,app_version,build_id,first_seen_at,last_seen_at",
    ).eq("user_id", id).order("last_seen_at", { ascending: false }),
    db.from("together_support_tickets").select(
      "id,category,subject,status,priority,created_at,updated_at",
    ).eq("user_id", id).order("updated_at", { ascending: false }).limit(30),
    db.from("together_client_error_events").select(
      "id,route,surface,error_name,message_safe,correlation_id,app_version,created_at",
    ).eq("user_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const results = [
      profile,
      entitlement,
      credits,
      ledger,
      media,
      calls,
      ai,
      sessions,
      tickets,
      errors,
    ],
    failed = results.find((item) => item.error);
  if (failed?.error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Safe account diagnostics could not be loaded.",
      500,
      true,
    );
  }
  return {
    account: {
      userId: id,
      email: account.email,
      createdAt: account.created_at,
      lastSignInAt: account.last_sign_in_at,
      bannedUntil: account.banned_until,
      deletedAt: account.deleted_at,
    },
    profile: profile.data ?? null,
    entitlement: entitlement.data ?? null,
    credits: credits.data ?? { permanent_balance: 0, subscription_balance: 0 },
    creditLedger: ledger.data ?? [],
    recentMedia: media.data ?? [],
    recentCalls: calls.data ?? [],
    recentAi: ai.data ?? [],
    clientSessions: sessions.data ?? [],
    supportTickets: tickets.data ?? [],
    recentErrors: errors.data ?? [],
    privacyNote:
      "No chat messages, prompts, transcripts, media URLs, Persona, memories, or content preferences are returned.",
  };
}

async function count(
  db: SupabaseClient,
  table: string,
  apply: (query: any) => any,
) {
  const { count, error } = await apply(
    db.from(table).select("*", { head: true, count: "exact" }),
  );
  if (error) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Operations telemetry could not be counted.",
      500,
      true,
    );
  }
  return Number(count ?? 0);
}
