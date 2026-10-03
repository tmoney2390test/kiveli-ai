/** Only an actual declined user request can be answered as ordinary dialogue. */
export function declinedPhotoSourceMessageId(
  offer: {
    status?: unknown;
    source?: unknown;
    message_id?: unknown;
    offer_key?: unknown;
  } | null,
  anchorMessageId: string,
): string | null {
  if (offer?.status !== 'declined' || offer.source !== 'user_request' ||
    offer.message_id !== anchorMessageId) return null;
  const match = /^user_request:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    .exec(String(offer.offer_key ?? ''));
  return match?.[1] ?? null;
}

export function declinedGroupPhotoSourceMessageId(
  offer: {
    status?: unknown;
    source?: unknown;
    message_id?: unknown;
    offer_key?: unknown;
  } | null,
  anchorMessageId: string,
): string | null {
  if (offer?.status !== 'declined' || offer.source !== 'user_request' ||
    offer.message_id !== anchorMessageId) return null;
  const match = /^group_request:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):[0-9a-f:-]+$/i
    .exec(String(offer.offer_key ?? ''));
  return match?.[1] ?? null;
}
