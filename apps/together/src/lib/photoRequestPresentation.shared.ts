import type { GeneratedMedia, MediaOffer } from '../types';

export function photoOfferDismissAction(
  status: MediaOffer['status'] | undefined,
  preparing = false,
  generating = false,
): 'cancel' | 'remove' | null {
  if (status === 'failed') return 'remove';
  if (status === 'pending' && !preparing && !generating) return 'cancel';
  return null;
}

export function photoOfferForMessage(offers: MediaOffer[], messageId: string): MediaOffer | null {
  return offers
    // The source message is the single visual owner for the full offer
    // lifecycle. Keeping failed offers attached here prevents realtime timing
    // from rendering the same failure once inline and again as an orphan.
    .filter((offer) => offer.message_id === messageId && (offer.status === 'pending' || offer.status === 'accepted' || offer.status === 'failed'))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] ?? null;
}

export function photoOffersWithoutVisibleMessages(offers: MediaOffer[], visibleMessageIds: ReadonlySet<string>): MediaOffer[] {
  // Terminal failures stay at their original source message and never collect
  // at the bottom of chat when that message is outside the loaded page.
  return offers.filter((offer) => offer.status !== 'failed' && (!offer.message_id || !visibleMessageIds.has(offer.message_id)));
}

/**
 * Detached offers render in a small tail section after the loaded timeline.
 * Only offers that are actually as new as that timeline belong there; older
 * offers render inline once their source message is loaded instead of making
 * "Latest" jump back to a historical photo request.
 */
export function photoOffersAtTimelineTail(
  offers: MediaOffer[],
  visibleMessageIds: ReadonlySet<string>,
  visibleTimelineDates: string[],
): MediaOffer[] {
  const latestTimelineTime = visibleTimelineDates.reduce((latest, value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, Number.NEGATIVE_INFINITY);

  return photoOffersWithoutVisibleMessages(offers, visibleMessageIds)
    .filter((offer) => {
      if (!Number.isFinite(latestTimelineTime)) return true;
      const offerTime = Date.parse(offer.created_at);
      return Number.isFinite(offerTime) && offerTime >= latestTimelineTime;
    })
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
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
