export function mediaOfferActionBusy(
  busyId: string | null,
  offer?: { id: string; generated_media_id?: string | null } | null,
  retryBusyId?: string | null,
): boolean {
  return Boolean(
    offer && [busyId, retryBusyId].some((activeId) =>
      Boolean(activeId) &&
        (activeId === offer.id ||
          Boolean(offer.generated_media_id && activeId === offer.generated_media_id)),
    ),
  );
}
