import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { invoke } from "./api";

export type SupportCategory =
  | "bug"
  | "billing"
  | "safety"
  | "account"
  | "feedback"
  | "other";
export type OperationsRole = "viewer" | "support" | "admin";
export type OperationsQueue = {
  key: string;
  label: string;
  active: number;
  stale: number;
  oldestAgeSeconds: number;
  failed24h: number;
  statuses: Array<{ status: string; count: number }>;
  oldest?:
    | { status: string; provider?: string | null; model?: string | null }
    | null;
};
export type OperationsIncident = {
  id: string;
  dedupe_key: string;
  source: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "monitoring" | "resolved";
  title: string;
  summary_safe?: string | null;
  correlation_id?: string | null;
  assignee_user_id?: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
};
export type OperationsAlertRule = {
  id: string;
  slug: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  severity: string;
  cooldown_minutes: number;
  channels: string[];
  enabled: boolean;
  last_triggered_at?: string | null;
  metadata?: Record<string, unknown>;
};
export type OperationsDashboard = {
  generatedAt: string;
  access: {
    role: OperationsRole;
    permissions: { view: boolean; support: boolean; admin: boolean };
  };
  health: {
    status: "healthy" | "attention";
    openIncidents: number;
    criticalIncidents: number;
  };
  metrics: Record<string, number>;
  queues: OperationsQueue[];
  providerHealth: Array<
    {
      provider: string;
      model: string;
      modality: string;
      requests: number;
      failures: number;
      successRate: number;
      p95LatencyMs: number;
      estimatedCost: number;
    }
  >;
  recentErrors: Array<Record<string, unknown>>;
  supportTickets: Array<Record<string, unknown>>;
  incidents: OperationsIncident[];
  alertRules: OperationsAlertRule[];
  alertEvents: Array<Record<string, unknown>>;
  alertConfiguration: { webhook: boolean; email: boolean };
  releases: Array<Record<string, unknown>>;
  releaseHealth: {
    runtimeCommit?: string | null;
    runtimeDeployId?: string | null;
    latestMigration?: string | null;
    clientVersions: Array<
      {
        platform: string;
        appVersion: string;
        buildId: string;
        users: number;
        lastSeenAt: string;
      }
    >;
  };
  audit: Array<Record<string, unknown>>;
  note: string;
};
export type OperationsUserLookup = {
  account: {
    userId: string;
    email: string;
    createdAt: string;
    lastSignInAt?: string | null;
    bannedUntil?: string | null;
    deletedAt?: string | null;
  };
  profile: Record<string, unknown> | null;
  entitlement: Record<string, unknown> | null;
  credits: Record<string, unknown>;
  creditLedger: Array<Record<string, unknown>>;
  recentMedia: Array<Record<string, unknown>>;
  recentCalls: Array<Record<string, unknown>>;
  recentAi: Array<Record<string, unknown>>;
  clientSessions: Array<Record<string, unknown>>;
  supportTickets: Array<Record<string, unknown>>;
  recentErrors: Array<Record<string, unknown>>;
  privacyNote: string;
};

function safeError(value: unknown) {
  const error = value instanceof Error
    ? value
    : new Error(typeof value === "string" ? value : "Unexpected client error");
  const sanitize = (text: string) =>
    text.replace(/sk-[A-Za-z0-9_-]+/g, "[secret]").replace(
      /Bearer\s+[A-Za-z0-9._-]+/gi,
      "Bearer [redacted]",
    ).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  return {
    name: error.name.slice(0, 100),
    message: sanitize(error.message || "Unexpected client error").slice(0, 600),
    stack: sanitize(error.stack ?? "").slice(0, 4000),
  };
}

export async function reportClientError(
  error: unknown,
  input: {
    route?: string;
    surface?: string;
    correlationId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  } = {},
) {
  if (process.env.EXPO_PUBLIC_KIVELLE_ERROR_REPORTING_ENABLED === "false") {
    return;
  }
  const safe = safeError(error),
    stackHash = safe.stack
      ? await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        safe.stack,
      )
      : undefined;
  await invoke("together-ops", {
    action: "report_client_error",
    route: input.route ?? "unknown",
    surface: input.surface ?? "client",
    errorName: safe.name,
    messageSafe: safe.message,
    stackSafe: safe.stack || undefined,
    stackHash,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    buildId: Constants.expoConfig?.runtimeVersion
      ? String(Constants.expoConfig.runtimeVersion)
      : undefined,
    correlationId: input.correlationId,
    metadata: input.metadata ?? {},
  });
}

export async function reportClientHeartbeat() {
  await invoke("together-ops", {
    action: "client_heartbeat",
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    buildId: Constants.expoConfig?.runtimeVersion
      ? String(Constants.expoConfig.runtimeVersion)
      : "unknown",
  });
}

export const createSupportTicket = (
  input: {
    category: SupportCategory;
    subject: string;
    message: string;
    correlationId?: string;
    conversationId?: string;
  },
) =>
  invoke<{ ticket: { id: string; status: string; created_at: string } }>(
    "together-ops",
    { action: "create_support_ticket", ...input },
  );
export const loadMySupportTickets = () =>
  invoke<
    {
      tickets: Array<
        {
          id: string;
          category: SupportCategory;
          subject: string;
          status: string;
          priority: string;
          created_at: string;
          updated_at: string;
        }
      >;
    }
  >("together-ops", { action: "my_tickets" });
export const loadOperationsDashboard = () =>
  invoke<OperationsDashboard>("together-ops", { action: "dashboard" });
export const loadSupportTicket = (ticketId: string) =>
  invoke<
    { ticket: Record<string, unknown>; events: Array<Record<string, unknown>> }
  >("together-ops", { action: "ticket_detail", ticketId });
export const updateSupportTicket = (
  input: {
    ticketId: string;
    status?: string;
    priority?: string;
    assignedTo?: string | null;
    tags?: string[];
    note?: string;
  },
) =>
  invoke<{ ticket: Record<string, unknown> }>("together-ops", {
    action: "update_ticket",
    ...input,
  });
export const updateOperationsIncident = (
  input: {
    incidentId: string;
    status?: string;
    severity?: string;
    assignedTo?: string | null;
    note?: string;
  },
) =>
  invoke<{ incident: OperationsIncident }>("together-ops", {
    action: "update_incident",
    ...input,
  });
export const lookupOperationsUser = (query: string) =>
  invoke<OperationsUserLookup>("together-ops", {
    action: "lookup_user",
    query,
  });
export const retryOperationsMedia = (mediaId: string, reason: string) =>
  invoke<{ media: Record<string, unknown> }>("together-ops", {
    action: "retry_media",
    mediaId,
    reason,
    confirmTarget: mediaId,
  });
export const terminateOperationsMediaJob = (jobId: string, reason: string) =>
  invoke<{ ended: boolean }>("together-ops", {
    action: "fail_media_job",
    jobId,
    reason,
    confirmTarget: jobId,
  });
export const refundOperationsCredit = (
  userId: string,
  transactionId: string,
  reason: string,
) =>
  invoke<{ refunded: boolean }>("together-ops", {
    action: "refund_credit",
    userId,
    transactionId,
    reason,
    confirmTarget: transactionId,
  });
export const invalidateOperationsSessions = (userId: string, reason: string) =>
  invoke<{ invalidatedAt: string }>("together-ops", {
    action: "invalidate_sessions",
    userId,
    reason,
    confirmTarget: userId,
  });
export const updateOperationsAlertRule = (
  input: {
    ruleId: string;
    enabled?: boolean;
    threshold?: number;
    cooldownMinutes?: number;
    channels?: Array<"dashboard" | "webhook" | "email">;
  },
) =>
  invoke<{ rule: OperationsAlertRule }>("together-ops", {
    action: "update_alert_rule",
    ...input,
  });
export const evaluateOperationsAlerts = () =>
  invoke<{ triggered: number; resolved: number; delivered: number }>(
    "together-ops",
    { action: "evaluate_alerts" },
  );
export const loadOperationsAudit = () =>
  invoke<{ audit: Array<Record<string, unknown>> }>("together-ops", {
    action: "audit_log",
  });
export const recordOperationsRelease = (
  input: {
    environment?: "development" | "preview" | "production";
    gitCommit: string;
    deployId?: string;
    appVersion?: string;
    webUrl?: string;
    migrationVersion?: string;
    edgeVersions?: Record<string, string | number>;
  },
) =>
  invoke<{ release: Record<string, unknown> }>("together-ops", {
    action: "record_release",
    ...input,
  });
