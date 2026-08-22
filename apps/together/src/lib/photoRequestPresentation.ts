import type { MediaOffer } from '../types';
import { classifyPhotoIntent } from '@together/domain/src/media';

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const HARD_BLOCKED_PREVIEW_PATTERN = /\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  return classifyPhotoIntent(text).requested && !HARD_BLOCKED_PREVIEW_PATTERN.test(text);
}

export function photoOfferForMessage(offers: MediaOffer[], messageId: string): MediaOffer | null {
  return offers
    .filter((offer) => offer.message_id === messageId && (offer.status === 'pending' || offer.status === 'accepted' || offer.status === 'failed'))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;
}

export function photoOffersWithoutVisibleMessages(offers: MediaOffer[], visibleMessageIds: ReadonlySet<string>): MediaOffer[] {
  return offers.filter((offer) => !offer.message_id || !visibleMessageIds.has(offer.message_id));
}
