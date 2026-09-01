import type { GroupDetail } from "../types";

type GroupDetailCacheEntry = {
  detail: GroupDetail;
  complete: boolean;
  touchedAt: number;
};

const MAX_CACHED_GROUPS = 24;
const SESSION_CACHE_PREFIX = "kivelle:group-summary:v1:";
const SESSION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const entries = new Map<string, GroupDetailCacheEntry>();

function cacheKey(scope: string, conversationId: string) {
  return `${scope}:${conversationId}`;
}

function trimCache() {
  if (entries.size <= MAX_CACHED_GROUPS) return;
  const oldest = [...entries.entries()].sort((left, right) =>
    left[1].touchedAt - right[1].touchedAt
  );
  for (const [key] of oldest.slice(0, entries.size - MAX_CACHED_GROUPS)) {
    entries.delete(key);
  }
}

export function readCachedGroupDetail(
  scope: string,
  conversationId: string,
): GroupDetailCacheEntry | undefined {
  const key = cacheKey(scope, conversationId);
  const entry = entries.get(key) ?? readSessionSummary(scope, conversationId);
  if (!entry) return undefined;
  entries.set(key, entry);
  entry.touchedAt = Date.now();
  return entry;
}

export function cacheGroupDetailSummary(scope: string, detail: GroupDetail) {
  const key = cacheKey(scope, detail.conversation.id);
  const existing = entries.get(key);
  entries.set(key, {
    detail: existing?.complete
      ? {
        ...existing.detail,
        conversation: detail.conversation,
        participants: detail.participants,
        settings: detail.settings,
      }
      : detail,
    complete: existing?.complete ?? false,
    touchedAt: Date.now(),
  });
  persistSessionSummary(scope, detail);
  trimCache();
}

export function cacheCompleteGroupDetail(scope: string, detail: GroupDetail) {
  entries.set(cacheKey(scope, detail.conversation.id), {
    detail,
    complete: true,
    touchedAt: Date.now(),
  });
  persistSessionSummary(scope, detail);
  trimCache();
}

export function clearGroupDetailCache(scope?: string) {
  if (!scope) {
    entries.clear();
    clearSessionSummaries();
    return;
  }
  for (const key of entries.keys()) {
    if (key.startsWith(`${scope}:`)) entries.delete(key);
  }
  clearSessionSummaries(scope);
}

function sessionStorageAvailable(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function sessionKey(scope: string, conversationId: string) {
  return `${SESSION_CACHE_PREFIX}${scope}:${conversationId}`;
}

function summaryOnly(detail: GroupDetail): GroupDetail {
  return {
    ...detail,
    messages: [],
    reactions: [],
    generatedMedia: [],
    mediaOffers: [],
    sharedPlans: [],
    conversationActions: [],
    conversationEvents: [],
    hasMoreMessages: false,
  };
}

function persistSessionSummary(scope: string, detail: GroupDetail) {
  const storage = sessionStorageAvailable();
  if (!storage) return;
  try {
    storage.setItem(sessionKey(scope, detail.conversation.id), JSON.stringify({
      detail: summaryOnly(detail),
      touchedAt: Date.now(),
    }));
  } catch {
    // A warm shell is an optimization; storage restrictions must not block Chat.
  }
}

function readSessionSummary(
  scope: string,
  conversationId: string,
): GroupDetailCacheEntry | undefined {
  const storage = sessionStorageAvailable();
  if (!storage) return undefined;
  const key = sessionKey(scope, conversationId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { detail?: GroupDetail; touchedAt?: number };
    if (
      !parsed.detail ||
      parsed.detail.conversation?.id !== conversationId ||
      typeof parsed.touchedAt !== "number" ||
      Date.now() - parsed.touchedAt > SESSION_CACHE_MAX_AGE_MS
    ) {
      storage.removeItem(key);
      return undefined;
    }
    return { detail: summaryOnly(parsed.detail), complete: false, touchedAt: parsed.touchedAt };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore browsers that expose storage but deny mutation.
    }
    return undefined;
  }
}

function clearSessionSummaries(scope?: string) {
  const storage = sessionStorageAvailable();
  if (!storage) return;
  const prefix = scope ? `${SESSION_CACHE_PREFIX}${scope}:` : SESSION_CACHE_PREFIX;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix)));
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Session storage cleanup is best-effort.
  }
}
