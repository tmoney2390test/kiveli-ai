import type { GroupDetail } from "../types";

type GroupDetailCacheEntry = {
  detail: GroupDetail;
  complete: boolean;
  touchedAt: number;
};

const MAX_CACHED_GROUPS = 24;
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
  const entry = entries.get(cacheKey(scope, conversationId));
  if (!entry) return undefined;
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
  trimCache();
}

export function cacheCompleteGroupDetail(scope: string, detail: GroupDetail) {
  entries.set(cacheKey(scope, detail.conversation.id), {
    detail,
    complete: true,
    touchedAt: Date.now(),
  });
  trimCache();
}

export function clearGroupDetailCache(scope?: string) {
  if (!scope) {
    entries.clear();
    return;
  }
  for (const key of entries.keys()) {
    if (key.startsWith(`${scope}:`)) entries.delete(key);
  }
}
