export function mediaOfferActionBusy(
  busyId: string | null,
  offer?: { id: string; generated_media_id?: string | null } | null,
): boolean {
  return Boolean(
    busyId && offer &&
      (busyId === offer.id ||
        (offer.generated_media_id && busyId === offer.generated_media_id)),
  );
}
