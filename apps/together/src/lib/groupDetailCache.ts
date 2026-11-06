import type { GroupDetail, MediaOffer, Message } from "../types";
import { mergeGroupDetailRefresh } from './groupDetailReconciliation';
import { isVisibleChatMessage } from './messageActions';
import { reconcileMessages } from './messageReconciliation';
import { preferNewerReadState } from './messageInbox';

type GroupDetailCacheEntry = {
  detail: GroupDetail;
  complete: boolean;
  loadedAt: number;
  touchedAt: number;
};

const MAX_CACHED_GROUPS = 24;
const SESSION_CACHE_PREFIX = "kivelle:group-summary:v1:";
const SESSION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const entries = new Map<string, GroupDetailCacheEntry>();
const inFlight = new Map<string, Promise<GroupDetail>>();
let cacheGeneration = 0;

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
  const merged = { ...detail, conversation: preferNewerReadState(detail.conversation, existing?.detail.conversation) };
  entries.set(key, {
    detail: existing?.complete
      ? {
        ...existing.detail,
        conversation: merged.conversation,
        participants: merged.participants,
        settings: merged.settings,
      }
      : merged,
    complete: existing?.complete ?? false,
    loadedAt: existing?.loadedAt ?? Date.now(),
    touchedAt: Date.now(),
  });
  persistSessionSummary(scope, merged);
  trimCache();
}

export function cacheInboxGroupSummary(
  scope: string,
  summary: Pick<GroupDetail, "conversation" | "participants">,
) {
  const configured = summary.conversation.metadata?.groupSettings as
    | Partial<GroupDetail["settings"]>
    | undefined;
  cacheGroupDetailSummary(scope, {
    ...summary,
    messages: [],
    reactions: [],
    generatedMedia: [],
    mediaOffers: [],
    sharedPlans: [],
    conversationActions: [],
    conversationEvents: [],
    settings: {
      responseMode: configured?.responseMode === "choose_speaker"
        ? "choose_speaker"
        : "automatic",
      energy: ["quiet", "balanced", "lively"].includes(configured?.energy ?? "")
        ? configured!.energy!
        : "balanced",
      notificationMode: ["all", "mentions", "muted"].includes(configured?.notificationMode ?? "")
        ? configured!.notificationMode!
        : "all",
    },
    hasMoreMessages: false,
  });
}

export function cacheCompleteGroupDetail(scope: string, detail: GroupDetail) {
  const existing = entries.get(cacheKey(scope, detail.conversation.id));
  const refreshed = existing?.complete && existing.detail !== detail
    ? mergeGroupDetailRefresh(existing.detail, detail) : detail;
  const merged = existing
    ? { ...refreshed, conversation: preferNewerReadState(refreshed.conversation, existing.detail.conversation) }
    : refreshed;
  const latestVisible=[...merged.messages].reverse().find((message)=>
    isVisibleChatMessage(message) && Boolean(message.content?.trim()) && message.delivery_status!=='failed');
  const conversation=latestVisible && (!merged.conversation.last_message_at ||
    Date.parse(latestVisible.created_at)>Date.parse(merged.conversation.last_message_at))
    ? {...merged.conversation,last_message_at:latestVisible.created_at,
      last_message_preview:latestVisible.content.replace(/\s+/g,' ').trim(),last_message_role:latestVisible.role}
    : merged.conversation;
  const cached=conversation===merged.conversation?merged:{...merged,conversation};
  entries.set(cacheKey(scope, detail.conversation.id), {
    detail: cached,
    complete: true,
    loadedAt: Date.now(),
    touchedAt: Date.now(),
  });
  persistSessionSummary(scope, cached);
  trimCache();
}

export function markCachedGroupRead(scope: string, conversationId: string, readAt: string) {
  const entry = entries.get(cacheKey(scope, conversationId));
  if (!entry) return;
  entry.detail = {
    ...entry.detail,
    conversation: preferNewerReadState(entry.detail.conversation, {
      ...entry.detail.conversation,
      last_read_at: readAt,
      unread: false,
      unread_count: 0,
    }),
  };
  entry.touchedAt = Date.now();
  persistSessionSummary(scope, entry.detail);
}

export function groupDetailCacheGeneration(): number {
  return cacheGeneration;
}

/** Keep a completed group reply ready for navigation after its screen is gone. */
export function mergeGroupStreamMessage(
  scope: string,
  conversationId: string,
  message: Message,
  expectedGeneration: number,
): boolean {
  if (expectedGeneration !== cacheGeneration || message.conversation_id !== conversationId) return false;
  const entry = entries.get(cacheKey(scope, conversationId));
  if (!entry?.complete) return false;
  const conversation = entry.detail.conversation;
  const advancesPreview = isVisibleChatMessage(message) && Boolean(message.content.trim()) &&
    (!conversation.last_message_at || Date.parse(message.created_at) >= Date.parse(conversation.last_message_at));
  const speaker=message.role==='assistant'
    ? entry.detail.participants.find((participant)=>participant.character_instance_id===message.speaker_character_instance_id)
    : undefined;
  entry.detail = {
    ...entry.detail,
    messages: reconcileMessages(entry.detail.messages, [message]),
    conversation: advancesPreview ? {
      ...conversation,
      last_message_at: message.created_at,
      last_message_preview: message.content.replace(/\s+/g, ' ').trim(),
      last_message_role: message.role,
      ...(message.role==='assistant'?{
        last_assistant_message_at:message.created_at,
        unread:Date.parse(message.created_at)>(conversation.last_read_at?Date.parse(conversation.last_read_at):0),
        unread_count:Date.parse(message.created_at)>(conversation.last_read_at?Date.parse(conversation.last_read_at):0)
          ? Math.max(1,conversation.unread_count??0) : 0,
      }:{}),
      ...(message.role==='assistant'?{reply_pending:false,reply_pending_speaker_name:null}:{}),
      ...(speaker?{last_speaker_name:speaker.together_character_instances.together_character_templates.name,
        last_speaker_character_instance_id:speaker.character_instance_id}:{}),
    } : conversation,
  };
  entry.touchedAt = Date.now();
  return true;
}

/** Keep a dismissed photo hidden in a warm group chat during rapid navigation. */
export function hideCachedGroupPhotoOffer(
  scope: string,
  conversationId: string,
  offerId: string,
  removedMediaId?: string | null,
) {
  const entry = entries.get(cacheKey(scope, conversationId));
  if (!entry) return;
  entry.detail = {
    ...entry.detail,
    mediaOffers: entry.detail.mediaOffers.filter((offer) => offer.id !== offerId),
    generatedMedia: removedMediaId
      ? entry.detail.generatedMedia.filter((media) => media.id !== removedMediaId)
      : entry.detail.generatedMedia,
  };
}

export function restoreCachedGroupPhotoOffer(scope: string, conversationId: string, offer: MediaOffer) {
  const entry = entries.get(cacheKey(scope, conversationId));
  if (!entry || entry.detail.mediaOffers.some((item) => item.id === offer.id)) return;
  entry.detail = { ...entry.detail, mediaOffers: [...entry.detail.mediaOffers, offer] };
}

/**
 * Warms a complete group timeline before navigation. Requests are coalesced so
 * hover, pointer-down, and the destination screen cannot fan out into several
 * identical detail loads.
 */
export function prefetchCompleteGroupDetail(
  scope: string,
  conversationId: string,
  loader: () => Promise<GroupDetail>,
  options: { maxAgeMs?: number } = {},
): Promise<GroupDetail> {
  const cached = readCachedGroupDetail(scope, conversationId);
  const maxAgeMs=options.maxAgeMs??15_000;
  if (cached?.complete&&Date.now()-cached.loadedAt<=maxAgeMs) return Promise.resolve(cached.detail);
  const key = cacheKey(scope, conversationId);
  const current = inFlight.get(key);
  if (current) return current;
  const request = loader()
    .then((detail) => {
      if (inFlight.get(key) !== request) return detail;
      cacheCompleteGroupDetail(scope, detail);
      return readCachedGroupDetail(scope, conversationId)?.detail ?? detail;
    })
    .finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
}

export function clearGroupDetailCache(scope?: string) {
  cacheGeneration += 1;
  if (!scope) {
    entries.clear();
    inFlight.clear();
    clearSessionSummaries();
    return;
  }
  for (const key of entries.keys()) {
    if (key.startsWith(`${scope}:`)) entries.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(`${scope}:`)) inFlight.delete(key);
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
    return { detail: summaryOnly(parsed.detail), complete: false, loadedAt: parsed.touchedAt, touchedAt: parsed.touchedAt };
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
