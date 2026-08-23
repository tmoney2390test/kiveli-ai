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
    usage,
    mediaUsage,
    recentErrors,
    recentTickets,
    incidents,
    alertRules,
    alertEvents,
    releases,
    versions,
    migration,
    queues,
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
    db.from("together_ai_usage_events").select(
      "latency_ms,estimated_cost_usd,provider_cost_usd,success,provider,model,operation,error_code",
    ).gte("created_at", since24).limit(5000),
    db.from("together_media_usage_events").select(
      "generation_ms,estimated_provider_cost_usd,success,provider,model,source",
    ).gte("created_at", since24).limit(5000),
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
    db.from("together_client_sessions").select(
      "user_id,platform,app_version,build_id,last_seen_at",
    ).gte("last_seen_at", since7).limit(5000),
    db.rpc("kivelle_ops_latest_migration"),
    queueHealth(db, new Date()),
    role === "admin"
      ? db.from("together_ops_audit_log").select("*").order("created_at", {
        ascending: false,
      }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const queried = [
      usage,
      mediaUsage,
      recentErrors,
      recentTickets,
      incidents,
      alertRules,
      alertEvents,
      releases,
      versions,
      migration,
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
  const aiRows = usage.data ?? [],
    latencies = aiRows.map((row) => Number(row.latency_ms ?? 0)).filter((
      value,
    ) => value > 0).sort((a, b) => a - b),
    success = aiRows.filter((row) => row.success === true).length,
    cost = aiRows.reduce(
      (sum, row) =>
        sum + Number(row.provider_cost_usd ?? row.estimated_cost_usd ?? 0),
      0,
    ),
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
      aiRequests24h: aiRows.length,
      aiSuccessRate: aiRows.length ? success / aiRows.length : 1,
      aiP95LatencyMs: percentile(latencies, .95),
      providerCost24h: cost,
    },
    queues,
    providerHealth: providerHealth(aiRows, mediaUsage.data ?? []),
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
      clientVersions: clientVersionDistribution(versions.data ?? []),
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

async function queueHealth(db: SupabaseClient, now: Date) {
  const since24 = new Date(now.getTime() - 86400000).toISOString(),
    definitions = [
      {
        key: "dialogue",
        label: "Chat generation",
        table: "together_dialogue_turns",
        column: "state",
        active: ["planning", "generating"],
        failed: ["failed"],
        staleSeconds: 180,
        time: "created_at",
      },
      {
        key: "media",
        label: "Photo & video generation",
        table: "together_generated_media",
        column: "status",
        active: ["queued", "generating"],
        failed: ["failed"],
        staleSeconds: 600,
        time: "created_at",
      },
      {
        key: "provider_media",
        label: "Provider handoff",
        table: "together_media_provider_jobs",
        column: "status",
        active: ["created", "submitting", "processing", "submission_unknown"],
        failed: ["failed"],
        staleSeconds: 600,
        time: "created_at",
      },
      {
        key: "calls",
        label: "Realtime calls",
        table: "together_voice_call_sessions",
        column: "status",
        active: [
          "creating",
          "ringing",
          "connecting",
          "active",
          "reconnecting",
          "ending",
        ],
        failed: ["failed"],
        staleSeconds: 180,
        time: "created_at",
      },
      {
        key: "push",
        label: "Push delivery",
        table: "together_push_deliveries",
        column: "status",
        active: ["queued", "accepted"],
        failed: ["failed"],
        staleSeconds: 900,
        time: "created_at",
      },
      {
        key: "proactive",
        label: "Proactive messages",
        table: "together_proactive_messages",
        column: "status",
        active: ["queued"],
        failed: [],
        staleSeconds: 1800,
        time: "eligible_at",
      },
    ];
  return await Promise.all(definitions.map(async (definition) => {
    const [active, oldest, recent] = await Promise.all([
      db.from(definition.table).select("*", { head: true, count: "exact" }).in(
        definition.column,
        definition.active,
      ),
      db.from(definition.table).select(
        `${definition.time},${definition.column}${
          definition.table === "together_media_provider_jobs"
            ? ",provider,model"
            : ""
        }`,
      ).in(definition.column, definition.active).order(definition.time, {
        ascending: true,
      }).limit(1).maybeSingle(),
      db.from(definition.table).select(definition.column).gte(
        "created_at",
        since24,
      ).limit(5000),
    ]);
    if (active.error || oldest.error || recent.error) {
      throw new AppError(
        "INTERNAL_ERROR",
        `${definition.label} telemetry could not be loaded.`,
        500,
        true,
      );
    }
    const oldestRow = oldest.data as unknown as Record<string, unknown> | null,
      recentRows = (recent.data ?? []) as unknown as Array<
        Record<string, unknown>
      >,
      age = oldestRow
        ? Math.max(
          0,
          Math.floor(
            (now.getTime() -
              new Date(String(oldestRow[definition.time])).getTime()) / 1000,
          ),
        )
        : 0,
      statuses = Object.entries(
        recentRows.reduce((acc: Record<string, number>, row) => {
          const value = String(row[definition.column]);
          acc[value] = (acc[value] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([status, count]) => ({ status, count }));
    return {
      key: definition.key,
      label: definition.label,
      active: Number(active.count ?? 0),
      stale: age >= definition.staleSeconds ? Number(active.count ?? 0) : 0,
      oldestAgeSeconds: age,
      failed24h: recentRows.filter((row) =>
        definition.failed.includes(String(row[definition.column]))
      ).length,
      statuses,
      oldest: oldestRow
        ? {
          status: String(oldestRow[definition.column]),
          provider: oldestRow.provider ?? null,
          model: oldestRow.model ?? null,
        }
        : null,
    };
  }));
}

function providerHealth(
  aiRows: Array<Record<string, unknown>>,
  mediaRows: Array<Record<string, unknown>>,
) {
  const groups = new Map<
    string,
    {
      provider: string;
      model: string;
      modality: string;
      requests: number;
      failures: number;
      latencies: number[];
      estimatedCost: number;
    }
  >();
  const rows: Array<[Record<string, unknown>, string]> = [
    ...aiRows.map((row) =>
      [row, "dialogue"] as [Record<string, unknown>, string]
    ),
    ...mediaRows.map((row) =>
      [row, "media"] as [Record<string, unknown>, string]
    ),
  ];
  for (const [row, modality] of rows) {
    const provider = String(row.provider ?? "unknown"),
      model = String(row.model ?? "unknown"),
      key = `${modality}:${provider}:${model}`,
      group = groups.get(key) ??
        {
          provider,
          model,
          modality,
          requests: 0,
          failures: 0,
          latencies: [],
          estimatedCost: 0,
        };
    group.requests += 1;
    if (row.success === false) group.failures += 1;
    const latency = Number(row.latency_ms ?? row.generation_ms ?? 0);
    if (latency > 0) group.latencies.push(latency);
    group.estimatedCost += Number(
      row.provider_cost_usd ?? row.estimated_cost_usd ??
        row.estimated_provider_cost_usd ?? 0,
    );
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    successRate: group.requests
      ? (group.requests - group.failures) / group.requests
      : 1,
    p95LatencyMs: percentile(group.latencies.sort((a, b) => a - b), .95),
  })).sort((left, right) => right.requests - left.requests).slice(0, 50);
}
function clientVersionDistribution(rows: Array<Record<string, unknown>>) {
  const groups = new Map<
    string,
    {
      platform: string;
      appVersion: string;
      buildId: string;
      users: Set<string>;
      lastSeenAt: string;
    }
  >();
  for (const row of rows) {
    const key = `${row.platform}:${row.app_version}:${row.build_id}`,
      current = groups.get(key) ??
        {
          platform: String(row.platform),
          appVersion: String(row.app_version),
          buildId: String(row.build_id),
          users: new Set<string>(),
          lastSeenAt: String(row.last_seen_at),
        };
    current.users.add(String(row.user_id));
    if (new Date(String(row.last_seen_at)) > new Date(current.lastSeenAt)) {
      current.lastSeenAt = String(row.last_seen_at);
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    users: group.users.size,
  })).sort((a, b) =>
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
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
function percentile(values: number[], value: number) {
  return values.length
    ? values[Math.min(values.length - 1, Math.floor(values.length * value))]
    : 0;
}
