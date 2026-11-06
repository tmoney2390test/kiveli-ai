import type { MediaOffer } from '../types';

export type PhotoDeclineHandoff = {
  offer: MediaOffer;
  dismissed: MediaOffer | null;
  queuedAt: number;
  startedAt: number | null;
};

const handoffs = new Map<string, PhotoDeclineHandoff>();
type OptimisticDeclineIntent = {
  requestId: string;
  startedAt: string;
  offer: MediaOffer;
  queuedAt: number;
};
const optimisticIntents = new Map<string, OptimisticDeclineIntent>();
const MAX_AGE_MS = 2 * 60_000;

export function photoDeclineHandoffKey(
  userId?: string,
  lifeId?: string,
  conversationId?: string,
): string | null {
  return userId && lifeId && conversationId
    ? JSON.stringify([userId, lifeId, conversationId])
    : null;
}

export function rememberPhotoDecline(key: string | null, offer: MediaOffer, now = Date.now()): void {
  if (!key || offer.source !== 'user_request' || offer.status !== 'pending' || !offer.message_id) return;
  handoffs.set(key, { offer, dismissed: null, queuedAt: now, startedAt: null });
}

export function settlePhotoDecline(key: string | null, dismissed: MediaOffer): PhotoDeclineHandoff | null {
  if (!key) return null;
  const current = readPhotoDecline(key);
  if (!current || current.offer.id !== dismissed.id || dismissed.status !== 'declined') return null;
  const next = { ...current, dismissed };
  handoffs.set(key, next);
  return next;
}

export function startPhotoDeclineReply(key: string | null, offerId: string, now = Date.now()): void {
  const current = readPhotoDecline(key);
  if (key && current?.offer.id === offerId) handoffs.set(key, { ...current, startedAt: now });
}

export function readPhotoDecline(key: string | null, now = Date.now()): PhotoDeclineHandoff | null {
  if (!key) return null;
  const current = handoffs.get(key);
  if (!current) return null;
  if (now - current.queuedAt > MAX_AGE_MS) {
    handoffs.delete(key);
    return null;
  }
  return current;
}

export function clearPhotoDecline(key: string | null, offerId: string): void {
  if (key && handoffs.get(key)?.offer.id === offerId) handoffs.delete(key);
}

export function rememberOptimisticPhotoDecline(
  key: string | null,
  request: Omit<OptimisticDeclineIntent, 'queuedAt'>,
  now = Date.now(),
): void {
  if (key) optimisticIntents.set(key, { ...request, queuedAt: now });
}

export function readOptimisticPhotoDecline(key: string | null, now = Date.now()): OptimisticDeclineIntent | null {
  if (!key) return null;
  const current = optimisticIntents.get(key);
  if (!current) return null;
  if (now - current.queuedAt > MAX_AGE_MS) {
    optimisticIntents.delete(key);
    return null;
  }
  return current;
}

export function clearOptimisticPhotoDecline(key: string | null, requestId: string): void {
  if (key && optimisticIntents.get(key)?.requestId === requestId) optimisticIntents.delete(key);
}
