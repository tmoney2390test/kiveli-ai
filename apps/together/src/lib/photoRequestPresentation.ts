import type { GeneratedMedia, MediaOffer } from '../types';
import { classifyPhotoIntent } from '@together/domain/src/media';

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const HARD_BLOCKED_PREVIEW_PATTERN = /\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  return classifyPhotoIntent(text).requested && !HARD_BLOCKED_PREVIEW_PATTERN.test(text);
}

export function photoOfferForMessage(offers: MediaOffer[], messageId: string): MediaOffer | null {
  return offers
    .filter((offer) => offer.message_id === messageId && (offer.status === 'pending' || offer.status === 'accepted'))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;
}

export function photoOffersWithoutVisibleMessages(offers: MediaOffer[], visibleMessageIds: ReadonlySet<string>): MediaOffer[] {
  return offers.filter((offer) => offer.status !== 'failed' && (!offer.message_id || !visibleMessageIds.has(offer.message_id)));
}

export function mediaWithoutActivePhotoOffer(media: GeneratedMedia[], generatedMediaId?: string | null): GeneratedMedia[] {
  if (!generatedMediaId) return media;
  return media.filter((item) => item.id !== generatedMediaId);
}

export function customPhotoRequestText(description: string): string {
  const requested = description.trim();
  return requested ? `Send me a photo showing exactly this: ${requested}` : '';
}

/**
 * Chat presents an edited photo as the current version of its source rather
 * than adding every edit in the chain as another image below the message.
 * A failed edit falls back to the last usable version.
 */
export function visibleChatPhotoMedia(media: GeneratedMedia[]): GeneratedMedia[] {
  const candidates = media.filter((item) => item.media_type === 'image' && item.status !== 'failed');
  const byId = new Map(media.filter((item) => item.media_type === 'image').map((item) => [item.id, item]));
  const currentByRoot = new Map<string, GeneratedMedia>();
  for (const item of candidates) {
    const root = photoRootId(item, byId);
    const current = currentByRoot.get(root);
    if (!current || comparePhotoVersions(item, current) > 0) currentByRoot.set(root, item);
  }
  return [...currentByRoot.values()].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

/** Resolve an offer linked to the original photo to its newest viable edit. */
export function photoMediaForOffer(media: GeneratedMedia[], generatedMediaId?: string | null): GeneratedMedia | undefined {
  const visible = visibleChatPhotoMedia(media);
  if (!generatedMediaId) return visible[0];
  const byId = new Map(media.filter((item) => item.media_type === 'image').map((item) => [item.id, item]));
  const linked = byId.get(generatedMediaId);
  if (!linked) return visible[0];
  const linkedRoot = photoRootId(linked, byId);
  return visible.find((item) => photoRootId(item, byId) === linkedRoot) ?? visible[0];
}

function photoRootId(item: GeneratedMedia, byId: ReadonlyMap<string, GeneratedMedia>): string {
  const explicitRoot = typeof item.metadata?.rootMediaId === 'string' ? item.metadata.rootMediaId.trim() : '';
  if (explicitRoot) return explicitRoot;
  let current = item;
  const visited = new Set<string>();
  while (current.parent_media_id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parent_media_id);
    if (!parent) return current.parent_media_id;
    current = parent;
  }
  return current.id;
}

function comparePhotoVersions(left: GeneratedMedia, right: GeneratedMedia): number {
  const leftDepth = Number(left.metadata?.editDepth ?? 0);
  const rightDepth = Number(right.metadata?.editDepth ?? 0);
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
}
