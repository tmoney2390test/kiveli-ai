export const recoveryTopics = [
  {
    id: "purchase",
    title: "Missing purchase or credits",
    category: "billing",
    body:
      "Review your balance and restore purchases in the app where you paid. Do not purchase again to recover an existing transaction.",
    route: "/subscription",
    action: "Plans & purchase recovery",
  },
  {
    id: "conversation",
    title: "Missing conversation",
    category: "account",
    body:
      "Check the active Persona and Life, then Archived chats. Retained chats show their remaining restore window.",
    route: "/archived-chats",
    action: "Open archived chats",
  },
  {
    id: "media",
    title: "Photo or video stuck",
    category: "bug",
    body:
      "Open the original request to refresh its status. Support can trace the request without starting a second paid generation.",
    route: "/chat-tab",
    action: "Open conversations",
  },
  {
    id: "login",
    title: "Account or sign-in problem",
    category: "account",
    body:
      "Check the account and sign-in method you originally used. Keep passwords and verification codes out of support messages.",
    route: "/settings?section=account",
    action: "Account settings",
  },
] as const;
export function supportStatusLabel(status: string): string {
  return ({
    open: "Awaiting support",
    in_progress: "In progress",
    waiting: "Awaiting your reply",
    resolved: "Resolved",
    closed: "Closed",
  } as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}
export type SupportDiagnostics = {
  platform: string;
  appVersion: string;
  buildId?: string;
  topic?: string;
};
// Persisted drafts are untrusted input: restore only known primitive fields.
export function parseSupportDraft<T extends object>(
  raw: string | null,
  initial: T,
): T {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...initial };
    }
    const restored = { ...initial };
    for (const key of Object.keys(initial) as Array<keyof T>) {
      const candidate = (value as T)[key];
      if (
        typeof candidate === typeof initial[key] &&
        ["string", "boolean", "number"].includes(typeof candidate)
      ) restored[key] = candidate;
    }
    return restored;
  } catch {
    return { ...initial };
  }
}
export function filterSupportQueue(
  rows: Array<Record<string, unknown>>,
  query: string,
  status: string,
  category: string,
  mine: boolean,
  actorId: string | null,
  oldest: boolean,
) {
  const term = query.trim().toLowerCase();
  return rows.filter((row) =>
    (status === "all" ||
      status === "active" &&
        !["resolved", "closed"].includes(String(row.status)) ||
      row.status === status) &&
    (category === "all" || row.category === category) &&
    (!mine || Boolean(actorId) && row.assigned_to === actorId) &&
    (!term ||
      [row.subject, row.ticket_number, row.id, row.user_id].some((value) =>
        String(value ?? "").toLowerCase().includes(term)
      ))
  )
    .sort((a, b) =>
      (oldest ? 1 : -1) *
      (Date.parse(String(a.updated_at)) - Date.parse(String(b.updated_at)))
    );
}
