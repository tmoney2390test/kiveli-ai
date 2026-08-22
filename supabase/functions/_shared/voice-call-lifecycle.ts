export type VoiceCallLifecycleStatus =
  | "creating"
  | "ringing"
  | "connecting"
  | "active"
  | "reconnecting"
  | "ending"
  | "ended"
  | "failed";

export const voiceCallBlockingStatuses: VoiceCallLifecycleStatus[] = [
  "creating",
  "ringing",
  "connecting",
  "active",
  "reconnecting",
];

const setupLeaseMs = 120_000;
const activeLeaseMs = 75_000;
const reconnectLeaseMs = 60_000;

export function voiceCallLeaseExpiresAt(
  status: string,
  now = new Date(),
): string | null {
  if (status === "ended" || status === "failed" || status === "ending") {
    return null;
  }
  const duration = status === "active"
    ? activeLeaseMs
    : status === "reconnecting"
    ? reconnectLeaseMs
    : setupLeaseMs;
  return new Date(now.getTime() + duration).toISOString();
}

export function voiceCallSessionIsStale(
  call: {
    status?: unknown;
    lease_expires_at?: unknown;
    updated_at?: unknown;
    created_at?: unknown;
  },
  now = new Date(),
): boolean {
  const status = String(call.status ?? "");
  if (status === "ended" || status === "failed") return false;
  // Ending means the user has already left. Reconciliation must never retain
  // the exclusive-call lock, even if an older invocation is still finishing.
  if (status === "ending") return true;
  const explicitLease = timestamp(call.lease_expires_at);
  if (explicitLease !== null) return explicitLease <= now.getTime();
  // Backward compatibility for rows created before leases were introduced.
  const lastUpdate = timestamp(call.updated_at) ?? timestamp(call.created_at);
  if (lastUpdate === null) return true;
  const fallbackLease = status === "active"
    ? 120_000
    : status === "reconnecting"
    ? 90_000
    : setupLeaseMs;
  return now.getTime() - lastUpdate > fallbackLease;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}
