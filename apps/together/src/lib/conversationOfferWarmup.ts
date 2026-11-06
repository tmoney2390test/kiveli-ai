import type { MediaOffer } from '../types';

const MAX_ENTRIES = 20;
const MAX_AGE_MS = 60_000;
const entries = new Map<string, { offers: MediaOffer[]; savedAt: number }>();

function key(userId: string, continuityId: string, conversationId: string) {
  return `${userId}:${continuityId}:${conversationId}`;
}

export function readCachedConversationOffers(
  userId?: string,
  continuityId?: string,
  conversationId?: string,
  now = Date.now(),
): MediaOffer[] {
  if (!userId || !continuityId || !conversationId) return [];
  const id = key(userId, continuityId, conversationId);
  const entry = entries.get(id);
  if (!entry) return [];
  if (now - entry.savedAt > MAX_AGE_MS) {
    entries.delete(id);
    return [];
  }
  entries.delete(id);
  entries.set(id, entry);
  return entry.offers.filter((offer) => !offer.expires_at || Date.parse(offer.expires_at) > now);
}

export function cacheConversationOffers(
  userId: string | undefined,
  continuityId: string | undefined,
  conversationId: string | undefined,
  offers: MediaOffer[],
  now = Date.now(),
) {
  if (!userId || !continuityId || !conversationId) return;
  const id = key(userId, continuityId, conversationId);
  entries.delete(id);
  entries.set(id, {
    offers: offers.filter((offer) => offer.continuity_id === continuityId &&
      offer.conversation_id === conversationId &&
      (offer.status === 'pending' || offer.status === 'accepted' || offer.status === 'failed')),
    savedAt: now,
  });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function clearConversationOfferWarmup() {
  entries.clear();
}
